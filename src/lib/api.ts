export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type ApiInit = Omit<RequestInit, "body"> & { json?: unknown; body?: BodyInit | null };

/** Fetch wrapper for same-origin JSON APIs. Throws ApiError with the server's message on non-2xx responses. */
export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  let body = init.body ?? null;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  const response = await fetch(path, { ...init, headers, body, credentials: "same-origin", cache: "no-store" });
  const data = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new ApiError(response.status, data.error || `Request failed (${response.status}).`);
  return data;
}

export function errorMessage(error: unknown, fallback = "Something went wrong."): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function toQuery(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    search.set(key, value === true ? "1" : String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}
