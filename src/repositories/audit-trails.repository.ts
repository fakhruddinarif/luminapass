import { db } from "../config/db";
import type { CreateAuditTrailParams } from "../dtos/audit-trail";
import { auditTrails } from "../entities/audit-trails";

export async function createAuditTrail(input: CreateAuditTrailParams) {
  const [created] = await db
    .insert(auditTrails)
    .values({
      endpoint: input.endpoint,
      datetime: input.datetime,
      ip: input.ip,
      user: input.user,
      method: input.method,
      request: input.request,
      response: input.response,
      status: input.status,
    })
    .returning();

  return created ?? null;
}
