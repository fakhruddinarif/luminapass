import { env } from "../config/env";
import {
  authCookieName,
  csrfCookieName,
  verifyAccessToken,
} from "../services/auth.service";
import type { JwtService } from "../interfaces/auth.interface";

interface MutableHeaders {
  [key: string]: string | string[] | undefined;
}

interface MutableSet {
  headers: MutableHeaders;
  status?: number;
}

interface CookieOptions {
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  path?: string;
  expires?: Date;
}

function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions,
): string {
  const chunks = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) chunks.push(`Max-Age=${options.maxAge}`);
  if (options.expires) chunks.push(`Expires=${options.expires.toUTCString()}`);
  if (options.httpOnly) chunks.push("HttpOnly");
  if (options.secure) chunks.push("Secure");
  if (options.sameSite) chunks.push(`SameSite=${options.sameSite}`);
  chunks.push(`Path=${options.path ?? "/"}`);

  return chunks.join("; ");
}

function appendSetCookieHeader(set: MutableSet, cookieValue: string): void {
  const existing = set.headers["set-cookie"];

  if (!existing) {
    set.headers["set-cookie"] = cookieValue;
    return;
  }

  if (Array.isArray(existing)) {
    set.headers["set-cookie"] = [...existing, cookieValue];
    return;
  }

  set.headers["set-cookie"] = [existing, cookieValue];
}

export function applyAuthCookies(
  set: MutableSet,
  accessToken: string,
  csrfToken: string,
  maxAge: number,
): void {
  const isProduction = env.APP_ENV === "production";

  appendSetCookieHeader(
    set,
    serializeCookie(authCookieName, accessToken, {
      maxAge,
      httpOnly: true,
      secure: isProduction,
      sameSite: "Strict",
      path: "/",
    }),
  );

  appendSetCookieHeader(
    set,
    serializeCookie(csrfCookieName, csrfToken, {
      maxAge,
      httpOnly: false,
      secure: isProduction,
      sameSite: "Strict",
      path: "/",
    }),
  );
}

export function clearAuthCookies(set: MutableSet): void {
  const isProduction = env.APP_ENV === "production";

  appendSetCookieHeader(
    set,
    serializeCookie(authCookieName, "", {
      maxAge: 0,
      expires: new Date(0),
      httpOnly: true,
      secure: isProduction,
      sameSite: "Strict",
      path: "/",
    }),
  );

  appendSetCookieHeader(
    set,
    serializeCookie(csrfCookieName, "", {
      maxAge: 0,
      expires: new Date(0),
      httpOnly: false,
      secure: isProduction,
      sameSite: "Strict",
      path: "/",
    }),
  );
}

export function parseRequestCookies(request: Request): Record<string, string> {
  const raw = request.headers.get("cookie") ?? "";

  return raw
    .split(";")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .reduce<Record<string, string>>((acc, chunk) => {
      const separatorIndex = chunk.indexOf("=");
      if (separatorIndex < 0) {
        return acc;
      }

      const key = chunk.slice(0, separatorIndex).trim();
      const value = decodeURIComponent(chunk.slice(separatorIndex + 1).trim());
      acc[key] = value;
      return acc;
    }, {});
}

export async function resolveRequestAuth(request: Request, jwt: JwtService) {
  const cookies = parseRequestCookies(request);
  const accessToken = cookies[authCookieName];

  if (!accessToken) {
    return null;
  }

  return verifyAccessToken(jwt, accessToken);
}
