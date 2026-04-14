export interface ApiMeta {
  page: number;
  size: number;
  total_page: number;
  total_item: number;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  field?: string;
  details?: unknown;
}

export interface ApiResponse<T = unknown> {
  status: number;
  message: string;
  data: T | Record<string, never> | unknown[];
  errors: ApiErrorDetail[] | null;
  meta: ApiMeta | null;
}

interface RouteSet {
  status?: number | string;
}

function normalizeErrors(input: unknown): ApiErrorDetail[] | null {
  if (!input) {
    return null;
  }

  if (Array.isArray(input)) {
    const mapped = input
      .map((item, index): ApiErrorDetail | null => {
        if (typeof item === "string") {
          return {
            code: "ERROR",
            message: item,
          };
        }

        if (typeof item === "object" && item !== null) {
          const row = item as Record<string, unknown>;

          return {
            code:
              typeof row.code === "string"
                ? row.code
                : typeof row.keyword === "string"
                  ? row.keyword
                  : "ERROR",
            message:
              typeof row.message === "string"
                ? row.message
                : "Terjadi kesalahan validasi",
            field:
              typeof row.path === "string"
                ? row.path
                : Array.isArray(row.path)
                  ? row.path.map((part) => String(part)).join(".")
                  : typeof row.field === "string"
                    ? row.field
                    : undefined,
            details: row,
          };
        }

        return {
          code: "ERROR",
          message: "Terjadi kesalahan",
          details: { index, value: item },
        };
      })
      .filter((entry): entry is ApiErrorDetail => entry !== null);

    return mapped.length > 0 ? mapped : null;
  }

  if (typeof input === "object" && input !== null) {
    const row = input as Record<string, unknown>;

    return [
      {
        code: typeof row.code === "string" ? row.code : "ERROR",
        message:
          typeof row.message === "string" ? row.message : "Terjadi kesalahan",
        field: typeof row.field === "string" ? row.field : undefined,
        details: row,
      },
    ];
  }

  return [
    {
      code: "ERROR",
      message: String(input),
    },
  ];
}

export function errorResponse(
  set: RouteSet,
  status: number,
  message: string,
  errors: unknown = null,
  data: Record<string, never> | unknown[] = {},
  meta: ApiMeta | null = null,
): ApiResponse {
  set.status = status;

  return {
    status,
    message,
    data,
    errors: normalizeErrors(errors),
    meta,
  };
}

export function successResponse<T>(
  set: RouteSet,
  status: number,
  message: string,
  data: T,
  meta: ApiMeta | null = null,
): ApiResponse<T> {
  set.status = status;

  return {
    status,
    message,
    data,
    errors: null,
    meta,
  };
}
