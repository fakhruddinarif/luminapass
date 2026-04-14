# LuminaPass API

LuminaPass is a Bun + Elysia + Drizzle ORM backend for authentication, authorization, event management, stock override, live analytics, and audit trail.

## 1. Tech Stack

- Bun runtime
- Elysia
- PostgreSQL
- Redis
- RabbitMQ
- Drizzle ORM
- Zod

## 2. Available Features

- Authentication endpoints:
  - POST /api/register
  - POST /api/login
  - GET /api/info
  - DELETE /api/logout
- Events management endpoints (admin role required):
  - POST /api/events
  - PUT /api/events/:eventId
  - POST /api/events/stock/override?eventId=<eventId>&sectionId=<sectionId>
  - GET /api/dashboard/live
- Cookie-based token security:
  - HttpOnly access token cookie
  - CSRF token cookie for logout endpoint
- Structured API response format:
  - status
  - message
  - data
  - errors
  - meta
- Audit trail for mutation methods:
  - POST
  - PUT
  - PATCH
  - DELETE

## 3. API Response Format

All endpoints follow this response format:

```json
{
  "status": 200,
  "message": "Success message",
  "data": {},
  "errors": null,
  "meta": null
}
```

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

## 10. Audit Trail

Audit trail is stored in audit_trails table with fields:

- endpoint
- datetime
- ip
- user
- method
- request
- response
- status
- created_at

Sensitive data such as password or token is redacted before storing.

## 11. Postman Collection

Postman collection file is located at project root:

- luminapass-api.postman_collection.json

### Import Steps

1. Open Postman.
2. Click Import.
3. Select luminapass-api.postman_collection.json.
4. Update collection variables if needed.

Default baseUrl:

- http://localhost:3000

### CSRF Notes

- Logout request requires x-csrf-token header.
- Collection script automatically extracts csrf token from Set-Cookie header after register/login.

## 12. API Summary

### Auth

- POST /api/register
- POST /api/login
- GET /api/info
- DELETE /api/logout

### Events (Admin)

- POST /api/events
- PUT /api/events/:eventId
- POST /api/events/stock/override?eventId=<eventId>&sectionId=<sectionId>
- GET /api/dashboard/live

## 13. Troubleshooting

### DB connection failed

- Ensure PostgreSQL is running.
- Verify DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME.

### Redis authentication error

- Make sure REDIS_PASSWORD in .env matches Redis container config.

### Invalid token on logout

- Ensure x-csrf-token header matches CSRF-TOKEN cookie value.

### audit_trails table missing

- Run bun run db:push after schema updates.
