# LuminaPass Use Case Flow: Customer Login -> Payment -> Webhook

## 1. Tujuan Dokumen

Dokumen ini menjelaskan alur end-to-end dari sisi customer:

1. Login.
2. Membuat ticket order.
3. Membuat payment transaction.
4. Menyelesaikan pembayaran via webhook.
5. Proses async oleh workers (outbox, order-expiry, event-status, ticket-email).

Dokumen ini fokus ke alur runtime yang terjadi di aplikasi saat ini.

## 2. Komponen Inti

1. HTTP API (Elysia): menerima request, validasi payload, response standar.
2. Service layer: validasi bisnis dan mapping error domain.
3. Repository layer: query database, transaksi, dan outbox enqueue.
4. Redis: session auth + distributed lock worker expiry.
5. RabbitMQ: publish event dari outbox worker.
6. Workers: background processing untuk outbox, expiry order, event status, email.

## 3. Ringkasan Status Order

Status utama yang muncul dalam flow ini:

1. `awaiting_payment`: order berhasil dibuat, stok sudah di-reserve.
2. `paid`: pembayaran sukses.
3. `failed`: pembayaran gagal.
4. `expired`: waktu bayar habis.
5. `cancelled`: dibatalkan/refund.

## 4. Use Case A: Login Customer

### A1. Endpoint dan payload

1. Endpoint: `POST /api/login`.
2. Payload utama: `email`, `password`.

### A2. Urutan proses

1. Route memvalidasi body via schema.
2. Controller memanggil service login.
3. Service:
4. Cari user by email.
5. Verifikasi password hash (argon2id).
6. Pastikan status user `active`.
7. Update `lastLoginAt`.
8. Issue access session (JWT + session key di Redis + csrf token).
9. Controller set cookies auth.

### A3. Output penting

1. Cookie `AUTH-TOKEN` (HttpOnly).
2. Cookie `CSRF-TOKEN` (non-HttpOnly).
3. Data user public.

## 5. Use Case B: Create Ticket Order

### B1. Endpoint dan payload

1. Endpoint: `POST /api/ticket-orders`.
2. Wajib auth cookie valid.
3. Payload:
4. `eventId` (uuid).
5. `idempotencyKey` (unik per niat order).
6. `items[]` dengan `eventSectionId` dan `quantity`.
7. `paymentProvider` opsional.

### B2. Urutan proses

1. Route validasi schema.
2. Controller cek auth dari cookie.
3. Service panggil repository `createTicketOrder`.
4. Repository membuka `db.transaction(...)`.
5. Cek event ada.
6. Sinkronisasi status event otomatis (`synchronizeEventStatusTx`).
7. Pastikan event status `on_sale`.
8. Ambil semua section yang diminta dan verifikasi semua ada.
9. Hitung subtotal dan line total.
10. Insert `ticket_orders` status `awaiting_payment`.
11. Insert `ticket_order_items`.
12. Reserve stock per section dengan update kapasitas (`capacity - quantity`) memakai guard `capacity >= quantity`.
13. Insert `stock_movements` tipe `reserve`.
14. Sinkronisasi status event lagi.
15. Enqueue outbox event `order.created` dalam transaksi yang sama.
16. Commit transaksi.

### B3. Hasil

1. Order dibuat atomik.
2. Stok sudah terpotong.
3. Event outbox siap dipublish async.

## 6. Use Case C: Create Payment Transaction

### C1. Endpoint dan payload

1. Endpoint: `POST /api/payment-transactions`.
2. Wajib auth cookie valid.
3. Payload:
4. `orderId`.
5. `idempotencyKey`.
6. `provider`.
7. `simulatorCode` opsional (untuk mock/load test flow).

### C2. Urutan proses

1. Route validasi schema.
2. Controller cek auth.
3. Service panggil repository `createPaymentTransaction`.
4. Repository membuka `db.transaction(...)`.
5. Ambil order target.
6. Tolak jika order final (`paid/failed/expired/cancelled`).
7. Simulasikan hasil payment (mock): `captured` atau `failed`.
8. Tentukan target order status.
9. Tentukan `suppressTicketEmail`.
10. Insert `payment_transactions`.
11. Update `ticket_orders` (status, paidAt, failedReason, paymentReference, suppress flag).
12. Jika payment gagal: release stok (insert movement `release`) dan sync event status.
13. Jika payment sukses dan email tidak di-suppress: issue ticket units.
14. Enqueue outbox event `payment.transaction.created`.
15. Commit transaksi.

### C3. Catatan load test vs non-load test

1. Jika `simulatorCode` mengandung `k6`, order ditandai `suppressTicketEmail=true`.
2. Jika bukan load test, flow normal tetap issue ticket unit sehingga bisa dikirim email oleh worker.

## 7. Use Case D: Payment Webhook

### D1. Endpoint dan payload

1. Endpoint: `POST /api/payment-transactions/webhook`.
2. Tidak butuh auth cookie customer.
3. Payload penting:
4. `provider`.
5. `providerOrderId` atau `externalTxnId` (minimal salah satu).
6. `status` provider (`captured`, `failed`, dll).
7. `webhookEventId` opsional untuk dedup.
8. `payload.source = k6` untuk menandai load test.

### D2. Urutan proses

1. Route validasi schema.
2. Controller panggil service.
3. Service panggil repository `processPaymentWebhook`.
4. Repository membuka `db.transaction(...)`.
5. Cari transaksi berdasarkan provider + order/txn id.
6. Jika tidak ketemu -> return null (service map jadi 404 domain).
7. Dedup by `webhookEventId`.
8. Update payment transaction dari data webhook.
9. Ambil order saat ini.
10. Tentukan target status order dari status payment.
11. Jika order sudah final dan status target beda -> idempotent return tanpa overwrite.
12. Update order (`status`, `paidAt`, `failedReason`, `suppressTicketEmail`).
13. Jika status non-paid dari kondisi reserved -> release stock + sync event.
14. Jika status paid dan email tidak di-suppress -> issue ticket units.
15. Enqueue outbox event `payment.webhook.processed`.
16. Commit transaksi.

### D3. Dedup dan race handling

1. Jika unique conflict pada `webhookEventId`, repo melakukan lookup ulang event yang menang race.
2. Hasil akhirnya tetap idempotent untuk caller.

## 8. Worker Detail dan Fungsinya

### 8.1 Outbox Worker

Fungsi:

1. Claim event `pending` dari tabel `outbox_events`.
2. Publish payload ke RabbitMQ menggunakan routing key.
3. Jika sukses -> mark `published` + `publishedAt`.
4. Jika gagal -> increment `attempts`, simpan `lastError`, jadwalkan `nextAttemptAt` (backoff).

Kenapa penting:

1. Menjamin perubahan data bisnis dan pencatatan event terjadi atomik.
2. Publish ke broker dilakukan async, retryable, dan lebih tahan crash.

### 8.2 Order Expiry Worker

Fungsi:

1. Scan order `awaiting_payment/reserved` yang `expiresAt` lewat.
2. Ubah status order jadi `expired`.
3. Release stok section terkait.
4. Sinkronkan status event.

Catatan:

1. Pakai Redis lock (`NX + PX`) agar tidak dobel proses antar instance.

### 8.3 Event Status Worker

Fungsi:

1. Sinkronkan status event otomatis berdasarkan waktu/fase jual.
2. Menjaga event lifecycle konsisten walau tanpa request user.

### 8.4 Ticket Email Worker

Fungsi:

1. Cari order paid yang siap dikirim email.
2. Filter hanya order dengan `suppressTicketEmail=false`.
3. Kirim email tiket (smtp/webhook/log transport).
4. Jika sukses -> tandai `ticketEmailSentAt` dan `emailedAt` per unit.
5. Jika gagal -> simpan error, hitung retry count, jadwalkan retry.

## 9. Tabel outbox_events: Fungsi Kolom Inti

1. `status`: `pending`, `processing`, `published`.
2. `attempts`: jumlah percobaan publish.
3. `nextAttemptAt`: jadwal retry berikutnya.
4. `lastError`: pesan error terakhir.
5. `publishedAt`: timestamp publish sukses.
6. `routingKey` + `payload`: data event untuk broker.

## 10. Error yang Sering Muncul dalam Flow

1. `Invalid ticket order payload`: payload order tidak sesuai schema (contoh UUID salah).
2. `EVENT_NOT_ON_SALE`: event belum/selesai masa jual.
3. `INSUFFICIENT_STOCK`: stok section tidak cukup saat reserve.
4. `ORDER_ALREADY_FINALIZED`: payment create ke order final.
5. `WEBHOOK_TRANSACTION_NOT_FOUND`: webhook tidak menemukan transaksi target.

## 11. Observability yang Disediakan

1. Endpoint `GET /metrics/workers` menampilkan runtime metrics worker.
2. Outbox metrics: queueDepth, retryCount, lagMs, publishSuccessRate.
3. Worker runtime: ticks, lastBatchCount, failures/sent/processed sesuai jenis worker.

## 12. Ringkasan Sequence Sederhana

1. Customer login -> dapat AUTH cookie.
2. Customer create order -> stok reserve + outbox `order.created`.
3. Customer create payment atau provider kirim webhook.
4. Sistem update payment+order atomik.
5. Jika paid normal -> issue ticket units.
6. Ticket email worker kirim email (kecuali di-suppress).
7. Outbox worker publish event integrasi ke RabbitMQ.

## 13. Referensi Kode

1. [src/index.ts](../src/index.ts)
2. [src/routes/auth.routes.ts](../src/routes/auth.routes.ts)
3. [src/services/auth.service.ts](../src/services/auth.service.ts)
4. [src/middlewares/auth.middleware.ts](../src/middlewares/auth.middleware.ts)
5. [src/routes/ticket-orders.routes.ts](../src/routes/ticket-orders.routes.ts)
6. [src/repositories/ticket-orders.repository.ts](../src/repositories/ticket-orders.repository.ts)
7. [src/routes/payment-transactions.routes.ts](../src/routes/payment-transactions.routes.ts)
8. [src/repositories/payment-transactions.repository.ts](../src/repositories/payment-transactions.repository.ts)
9. [src/repositories/outbox.repository.ts](../src/repositories/outbox.repository.ts)
10. [src/entities/outbox-events.ts](../src/entities/outbox-events.ts)
11. [src/workers/outbox.worker.ts](../src/workers/outbox.worker.ts)
12. [src/workers/order-expiry.worker.ts](../src/workers/order-expiry.worker.ts)
13. [src/workers/event-status.worker.ts](../src/workers/event-status.worker.ts)
14. [src/workers/ticket-email.worker.ts](../src/workers/ticket-email.worker.ts)
15. [src/dtos/ticket-orders.ts](../src/dtos/ticket-orders.ts)
16. [src/dtos/payment-transactions.ts](../src/dtos/payment-transactions.ts)
