import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";

import {
  connectDatabase,
  connectRedis,
  disconnectDatabase,
  disconnectRedis,
  env,
} from "./config";
import { auditTrailAfterResponseHook } from "./middlewares/request-logger.middleware";
import { authRoutes } from "./routes/auth.routes";
import { eventsRoutes } from "./routes/events.routes";
import { errorResponse } from "./utils/http-response";
import { logError, logInfo } from "./utils/logger";

interface ErrorIssue {
  code: string;
  message: string;
  path?: string;
  expected?: unknown;
  found?: unknown;
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message);
  }

  return "Unknown error";
}

function toPath(path: unknown): string | undefined {
  if (!Array.isArray(path) || path.length === 0) {
    return undefined;
  }

  return path.map((segment) => String(segment)).join(".");
}

function extractErrorIssues(code: string, error: unknown): ErrorIssue[] {
  const fallback: ErrorIssue[] = [
    {
      code,
      message: resolveErrorMessage(error),
    },
  ];

  if (typeof error !== "object" || error === null) {
    return fallback;
  }

  const errorObject = error as Record<string, unknown>;
  const candidates = [
    errorObject.all,
    errorObject.errors,
    typeof errorObject.cause === "object" && errorObject.cause !== null
      ? (errorObject.cause as Record<string, unknown>).errors
      : undefined,
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate) || candidate.length === 0) {
      continue;
    }

    const issues: ErrorIssue[] = [];

    for (const item of candidate) {
      if (typeof item !== "object" || item === null) {
        continue;
      }

      const issue = item as Record<string, unknown>;
      const message =
        typeof issue.message === "string"
          ? issue.message
          : "Invalid request data";

      issues.push({
        code: typeof issue.code === "string" ? issue.code : code,
        message,
        path: toPath(issue.path),
        expected: issue.expected,
        found: issue.received,
      });
    }

    if (issues.length > 0) {
      return issues;
    }
  }

  return fallback;
}

export const app = new Elysia()
  .use(
    cors({
      credentials: true,
      origin: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["content-type", "x-csrf-token"],
    }),
  )
  .use(
    jwt({
      name: "jwt",
      secret: env.JWT_SECRET,
    }),
  )
  .onAfterResponse(auditTrailAfterResponseHook)
  .onStart(async () => {
    await connectDatabase();
    await connectRedis();
    logInfo(`Starting ${env.APP_NAME} in ${env.APP_ENV} mode`);
  })
  .onStop(async () => {
    await disconnectRedis();
    await disconnectDatabase();
  })
  .onError(({ code, error, set }) => {
    const errorMessage = resolveErrorMessage(error);

    logError("Unhandled API error", {
      code,
      message: errorMessage,
    });

    if (code === "PARSE") {
      return errorResponse(
        set,
        400,
        "Invalid request payload",
        extractErrorIssues(String(code), error),
      );
    }

    if (code === "VALIDATION") {
      return errorResponse(
        set,
        422,
        "Request validation failed",
        extractErrorIssues(String(code), error),
      );
    }

    if (code === "NOT_FOUND") {
      return errorResponse(set, 404, "Route not found");
    }

    if (set.status === 200) {
      set.status = 500;
    }

    return errorResponse(
      set,
      (set.status as number) || 500,
      "Internal server error",
      extractErrorIssues(String(code), error),
    );
  })
  .get("/health", () => ({ status: "ok" }))
  .use(authRoutes)
  .use(eventsRoutes);

app.listen(env.APP_PORT);

logInfo(`${env.APP_NAME} listening on port ${env.APP_PORT}`);
