import { env } from "../config/env";
import * as bwipjs from "bwip-js";
import nodemailer from "nodemailer";
import { logInfo } from "./logger";

export interface TicketEmailPayload {
  to: string;
  fullName: string;
  eventName: string;
  orderCode: string;
  tickets: Array<{
    ticketCode: string;
    barcodeValue: string;
    barcodeFormat: string;
    barcodePayload: string;
  }>;
}

interface BarcodeAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
  cid: string;
}

let smtpTransporter: nodemailer.Transporter | null = null;

function buildBarcodeCid(orderCode: string, ticketCode: string): string {
  const orderPart = orderCode.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const ticketPart = ticketCode.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return `barcode-${orderPart}-${ticketPart}@luminapass.local`;
}

function mapBarcodeFormatToBcid(format: string): string {
  const normalized = format.trim().toLowerCase();

  if (normalized === "code128" || normalized === "code-128") {
    return "code128";
  }

  if (normalized === "qrcode" || normalized === "qr") {
    return "qrcode";
  }

  return "code128";
}

async function buildBarcodeAttachments(payload: TicketEmailPayload) {
  const attachments: BarcodeAttachment[] = await Promise.all(
    payload.tickets.map(async (ticket) => {
      const pngBuffer = await bwipjs.toBuffer({
        bcid: mapBarcodeFormatToBcid(ticket.barcodeFormat),
        text: ticket.barcodePayload,
        scale: 3,
        height: 10,
        includetext: true,
        textxalign: "center",
      });

      return {
        filename: `${ticket.ticketCode}.png`,
        content: pngBuffer,
        contentType: "image/png",
        cid: buildBarcodeCid(payload.orderCode, ticket.ticketCode),
      };
    }),
  );

  return attachments;
}

function getSmtpTransporter(): nodemailer.Transporter {
  if (smtpTransporter) {
    return smtpTransporter;
  }

  smtpTransporter = nodemailer.createTransport({
    host: env.EMAIL_SMTP_HOST,
    port: env.EMAIL_SMTP_PORT,
    secure: env.EMAIL_SMTP_SECURE,
    auth:
      env.EMAIL_SMTP_USER && env.EMAIL_SMTP_PASS
        ? {
            user: env.EMAIL_SMTP_USER,
            pass: env.EMAIL_SMTP_PASS,
          }
        : undefined,
  });

  return smtpTransporter;
}

function buildEmailHtml(
  payload: TicketEmailPayload,
  attachments: BarcodeAttachment[],
): string {
  const cidByTicketCode = new Map(
    attachments.map((attachment) => {
      const ticketCode = attachment.filename.replace(/\.png$/i, "");
      return [ticketCode, attachment.cid] as const;
    }),
  );

  const ticketRows = payload.tickets
    .map((ticket) => {
      const cid = cidByTicketCode.get(ticket.ticketCode);
      const preview = cid
        ? `<img src="cid:${cid}" alt="Barcode ${ticket.ticketCode}" style="max-width:260px;height:auto;display:block;" />`
        : "-";

      return `<tr><td>${ticket.ticketCode}</td><td>${ticket.barcodeValue}</td><td>${ticket.barcodeFormat}</td><td>${preview}</td></tr>`;
    })
    .join("");

  return `
    <h2>Your LuminaPass Tickets</h2>
    <p>Hello ${payload.fullName},</p>
    <p>Thank you for your payment. Your ticket order <strong>${payload.orderCode}</strong> for <strong>${payload.eventName}</strong> has been confirmed.</p>
    <p>Each ticket below has its own barcode value for scan validation.</p>
    <p>Barcode PNG files are attached, and previews are shown inline below.</p>
    <table border="1" cellpadding="6" cellspacing="0">
      <thead><tr><th>Ticket Code</th><th>Barcode Value</th><th>Format</th><th>Barcode Preview</th></tr></thead>
      <tbody>${ticketRows}</tbody>
    </table>
  `;
}

function buildEmailText(payload: TicketEmailPayload): string {
  const ticketLines = payload.tickets
    .map(
      (ticket) =>
        `- ${ticket.ticketCode} | ${ticket.barcodeValue} | ${ticket.barcodeFormat}`,
    )
    .join("\n");

  return [
    `Hello ${payload.fullName},`,
    "",
    `Order ${payload.orderCode} for ${payload.eventName} is confirmed.`,
    "",
    "Ticket barcodes:",
    ticketLines,
  ].join("\n");
}

function buildRetryableEmailError(message: string): Error {
  return new Error(`EMAIL_RETRYABLE:${message}`);
}

function buildFatalEmailError(message: string): Error {
  return new Error(`EMAIL_FATAL:${message}`);
}

function classifySmtpError(error: unknown): Error {
  const err = error as {
    responseCode?: number;
    code?: string;
    message?: string;
  };

  const responseCode = err.responseCode;
  const code = err.code ?? "SMTP_ERROR";
  const message = err.message ?? String(error);

  if (
    responseCode === 421 ||
    responseCode === 450 ||
    responseCode === 451 ||
    responseCode === 452 ||
    responseCode === 454
  ) {
    return buildRetryableEmailError(`${code}:${message}`);
  }

  return buildFatalEmailError(`${code}:${message}`);
}

function classifyBarcodeError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return buildFatalEmailError(`BARCODE_GENERATION_FAILED:${message}`);
}

export async function sendTicketEmail(
  payload: TicketEmailPayload,
): Promise<void> {
  if (env.EMAIL_TRANSPORT === "webhook" && env.EMAIL_WEBHOOK_URL) {
    const response = await fetch(env.EMAIL_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        subject: `Your LuminaPass tickets for ${payload.eventName}`,
        ...payload,
      }),
    });

    if (!response.ok) {
      if (response.status === 429 || response.status >= 500) {
        throw buildRetryableEmailError(`WEBHOOK_${response.status}`);
      }

      throw buildFatalEmailError(`WEBHOOK_${response.status}`);
    }

    return;
  }

  if (env.EMAIL_TRANSPORT === "smtp") {
    if (!env.EMAIL_SMTP_USER || !env.EMAIL_SMTP_PASS) {
      throw buildFatalEmailError("SMTP credentials are not configured");
    }

    try {
      const transporter = getSmtpTransporter();
      const attachments = await buildBarcodeAttachments(payload).catch(
        (error) => {
          throw classifyBarcodeError(error);
        },
      );

      await transporter.sendMail({
        from: env.EMAIL_FROM,
        to: payload.to,
        subject: `Your LuminaPass tickets for ${payload.eventName}`,
        text: buildEmailText(payload),
        html: buildEmailHtml(payload, attachments),
        attachments,
      });

      return;
    } catch (error) {
      throw classifySmtpError(error);
    }
  }

  // Fallback transport for local/dev.
  logInfo("Ticket email dispatched (dev transport)", {
    to: payload.to,
    orderCode: payload.orderCode,
    ticketCount: payload.tickets.length,
  });
}
