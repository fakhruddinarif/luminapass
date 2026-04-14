import { Elysia } from "elysia";

import { parseRequestCookies } from "./auth.middleware";
import { authCookieName, verifyAccessToken } from "../services/auth.service";
import { createAuditTrail } from "../repositories/audit-trails.repository";
import { logAudit } from "../utils/logger";
import type { JwtService } from "../interfaces/auth.interface";

const auditableMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function sanitizePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const sensitiveKeys = new Set([
    "password",
    "passwordHash",
    "token",
    "accessToken",
    "refreshToken",
    "csrfToken",
  ]);

  return JSON.parse(
    JSON.stringify(payload, (key, value) => {
      if (sensitiveKeys.has(key)) {
        return "[REDACTED]";
      }

      return value;
    }),
  );
}

function getIpAddress(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }

  return request.headers.get("x-real-ip") ?? "unknown";
}

async function resolveUserInfo(
  request: Request,
  jwt: JwtService,
): Promise<string> {
  const cookies = parseRequestCookies(request);
  const accessToken = cookies[authCookieName];

  if (!accessToken) {
    return "anonymous";
  }

  const payload = await verifyAccessToken(jwt, accessToken);
  if (!payload) {
    return "anonymous";
  }

  return `${payload.sub}:${payload.email}`;
}

export const requestLoggerMiddleware = new Elysia().onAfterHandle(
  async (context) => {
    const method = context.request.method.toUpperCase();
    if (!auditableMethods.has(method)) {
      return;
    }

    const endpoint = new URL(context.request.url).pathname;
    const setStatus = context.set.status;
    const status =
      typeof setStatus === "number"
        ? setStatus
        : typeof setStatus === "string"
          ? Number(setStatus)
          : 200;

    const jwt = (context as unknown as { jwt: JwtService }).jwt;
    const user = await resolveUserInfo(context.request, jwt);

    const payload = {
      endpoint,
      datetime: new Date().toISOString(),
      ip: getIpAddress(context.request),
      user,
      method,
      request: sanitizePayload((context as unknown as { body?: unknown }).body),
      response: sanitizePayload(context.response),
      status,
    };

    try {
      await createAuditTrail({
        endpoint: payload.endpoint,
        datetime: new Date(payload.datetime),
        ip: payload.ip,
        user: payload.user,
        method: payload.method,
        request: payload.request,
        response: payload.response,
        status: payload.status,
      });
    } catch {
      logAudit(payload);
    }
  },
);
