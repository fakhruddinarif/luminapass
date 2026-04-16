# LuminaPass API

LuminaPass is a Bun + Elysia + Drizzle ORM backend for authentication, authorization, event management, stock override, and live analytics.

## 1. Tech Stack

- Bun runtime
- Elysia
- PostgreSQL
- Redis
- RabbitMQ
- Drizzle ORM
- Zod

## 2. Available Features

- User authentication and authorization.
- Cookie-based session security (HttpOnly token + CSRF protection).
- Event management for admin users.
- Event stock override workflow.
- Live dashboard and streaming analytics.
- Ticket order and payment transaction processing.

## 3. OpenAPI

OpenAPI endpoint is available for API schema access:

- http://localhost:3000/openapi/json

Use this schema for API documentation tools and client generation.

## 4. Environment Setup

1. Copy .env.example to .env.
2. Update the environment variables.

Contoh command:

```powershell
Copy-Item .env.example .env
```

Important variables:

- APP_PORT
- JWT_SECRET
- DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME
- REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
- AMQP_URL, AMQP_PORT, AMQP_USER, AMQP_PASS

## 5. Run Dependency Services

Run PostgreSQL, Redis, RabbitMQ, and app with Docker Compose:

```powershell
docker compose up -d
```

Optional load test via Docker profile:

```powershell
docker compose --profile loadtest run --rm k6
```

Load test target behavior:

- Default `BASE_URL` points to host app: `http://host.docker.internal:3000`.
- This is suitable when API is started locally with `bun run dev`.
- If API runs as Docker service in compose network, override:

```powershell
$env:LOADTEST_BASE_URL="http://app:3000"
docker compose --profile loadtest run --rm k6
```

## 6. Install Project Dependencies

```powershell
bun install
```

## 7. Run Database Migration

Push schema to database:

```powershell
bun run db:push
```

Optional:

- Generate migration:

```powershell
bun run db:generate
```

- Open Drizzle Studio:

```powershell
bun run db:studio
```

## 8. Run Application

```powershell
bun run dev
```

Health check:

- GET /health

Worker metrics dashboard:

- GET /metrics/workers

Metrics included:

- queueDepth
- publishSuccessRate
- retryCount
- lagMs

Notes:

- `outbox.available = false` means outbox table is not ready yet.
- Run `bun run db:push` to apply latest schema and enable outbox metrics.

## 9. Run Testing

### 9.1 Run All Unit Tests

```powershell
bun test
```

### 9.2 Run Specific Test Files

```powershell
bun test tests/auth.service.test.ts tests/events.service.test.ts
```

### 9.3 Run Type Check

```powershell
bunx tsc --noEmit
```

### 9.4 Full Validation (Type Check + Test)

```powershell
bunx tsc --noEmit; bun test
```

## 10. Postman Collection

Postman collection file is located at project root:

- luminapass-api.postman_collection.json

### Import Steps

1. Open Postman.
2. Click Import.
3. Select luminapass-api.postman_collection.json.
4. Update collection variables if needed.

Default baseUrl:

- http://localhost:3000

## 11. Endpoint Usage Guide

### System

- `GET /health`: Quick health probe to verify service is up.

### OpenAPI

- `GET /openapi/json`: Get OpenAPI schema for API docs, tooling, and client generation.

### Monitoring

- `GET /metrics/workers`: Get runtime worker metrics (queue depth, retry count, publish success rate, lag).

### Auth

- `POST /api/register`: Register new user account.
- `POST /api/login`: Authenticate user and issue auth + CSRF cookies.
- `GET /api/info`: Get currently authenticated user profile.
- `DELETE /api/logout`: Revoke session and clear auth cookies (requires CSRF header).

### Events (Public Read)

- `GET /api/events?page=&size=&search=`: List events with sections and optional search pagination.
- `GET /api/events/id/:eventId`: Get one event by ID with its sections.
- `GET /api/events/slug/:slug`: Get one event by slug with its sections.

### Events (Admin)

- `POST /api/events`: Create event and event sections.
- `PUT /api/events/:eventId`: Update existing event details.
- `POST /api/events/stock/override?eventId=&sectionId=`: Add/withdraw section capacity manually.
- `GET /api/dashboard/live`: Get live dashboard aggregation (waiting users, sold tickets, active viewers, resolutions).

### Ticket Orders

- `POST /api/ticket-orders`: Create ticket order and reserve stock.
- `GET /api/ticket-orders/:orderId`: Get order details and order items by order ID.

### Payment Transactions

- `POST /api/payment-transactions`: Create payment transaction for an order.
- `POST /api/payment-transactions/webhook`: Process payment provider webhook and update payment/order status.

## 12. Troubleshooting

### DB connection failed

- Ensure PostgreSQL is running.
- Verify DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME.

### Redis authentication error

- Make sure REDIS_PASSWORD in .env matches Redis container config.

### Outbox metrics unavailable

- If `/metrics/workers` shows `outbox.available = false`, run migration:

```powershell
bun run db:push
```

## 13. CI/CD

GitHub Actions workflow is available at .github/workflows/ci-cd.yml.

Pipeline stages:

- CI: install dependencies, typecheck, and unit tests.
- Build & Publish: build Docker image and push to GHCR.
- Deploy (optional): deploy via SSH when deploy secrets are configured.

Required GitHub secrets for deployment:

- DEPLOY_HOST
- DEPLOY_USER
- DEPLOY_SSH_KEY
- DEPLOY_PATH
- DEPLOY_HEALTHCHECK_URL (optional, default: http://localhost:3000/health)

### Production Docker Compose

Production override file is available at docker-compose.prod.yml.

Deployment command example:

```powershell
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull app
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm app bun run db:push
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-build app
```
