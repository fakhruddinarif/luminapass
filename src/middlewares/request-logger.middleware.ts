import { parseRequestCookies } from "./auth.middleware";
import { authCookieName, verifyAccessToken } from "../services/auth.service";
import { createAuditTrail } from "../repositories/audit-trails.repository";
import { logAudit, logError } from "../utils/logger";
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

export async function auditTrailAfterResponseHook(context: {
  request: Request;
  set: { status?: number | string };
  response?: unknown;
  body?: unknown;
  jwt?: JwtService;
}) {
  try {
    const method = context.request.method.toUpperCase();
    if (!auditableMethods.has(method)) {
      return;
    }

    const endpoint = new URL(context.request.url).pathname;
    const setStatus = context.set.status;
    const parsedStatus =
      typeof setStatus === "number"
        ? setStatus
        : typeof setStatus === "string"
          ? Number(setStatus)
          : 200;
    const status = Number.isFinite(parsedStatus) ? parsedStatus : 200;

    const jwt = context.jwt;
    const user = jwt
      ? await resolveUserInfo(context.request, jwt)
      : "anonymous";

    const payload = {
      endpoint,
      datetime: new Date().toISOString(),
      ip: getIpAddress(context.request),
      user,
      method,
      request: sanitizePayload(context.body),
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
    } catch (error) {
      logError("Failed to persist audit trail to database", {
        message: error instanceof Error ? error.message : String(error),
        endpoint: payload.endpoint,
        method: payload.method,
        status: payload.status,
      });
      logAudit(payload);
    }
  } catch (error) {
    logError("Audit middleware execution failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
