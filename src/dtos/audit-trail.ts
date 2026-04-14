export interface CreateAuditTrailParams {
  endpoint: string;
  datetime: Date;
  ip: string;
  user: string;
  method: string;
  request: unknown;
  response: unknown;
  status: number;
}
