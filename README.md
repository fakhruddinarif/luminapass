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

Run PostgreSQL, Redis, RabbitMQ with Docker Compose:

```powershell
docker compose up -d
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

## 11. Troubleshooting

### DB connection failed

- Ensure PostgreSQL is running.
- Verify DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME.

### Redis authentication error

- Make sure REDIS_PASSWORD in .env matches Redis container config.
