export function logInfo(message: string, payload?: unknown): void {
  if (payload === undefined) {
    console.log(message);
    return;
  }

  console.log(message, payload);
}

export function logError(message: string, payload?: unknown): void {
  if (payload === undefined) {
    console.error(message);
    return;
  }

  console.error(message, payload);
}

export interface AuditLogPayload {
  endpoint: string;
  datetime: string;
  ip: string;
  user: string;
  method: string;
  request: unknown;
  response: unknown;
  status: number;
}

export function logAudit(payload: AuditLogPayload): void {
  console.log("[AUDIT]", JSON.stringify(payload));
}
