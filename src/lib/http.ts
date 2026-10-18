import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/** Maps thrown errors to a JSON response without leaking database internals. */
export function handleRouteError(error: unknown, context: string) {
  // Let Next.js keep its own signals (for example the prerender bailout thrown by cookies()).
  unstable_rethrow(error);
  if (error instanceof HttpError) return jsonError(error.status, error.message);
  const code = (error as { code?: string }).code;
  if (code === "ER_DUP_ENTRY") return jsonError(409, "A record with the same unique value already exists.");
  if (code === "ER_NO_REFERENCED_ROW_2" || code === "ER_NO_REFERENCED_ROW") return jsonError(400, "A referenced record does not exist.");
  if (code === "ER_DATA_TOO_LONG" || code === "ER_TRUNCATED_WRONG_VALUE" || code === "ER_TRUNCATED_WRONG_VALUE_FOR_FIELD" || code === "WARN_DATA_TRUNCATED") {
    return jsonError(400, "One of the values is too long or in the wrong format.");
  }
  console.error(`${context} failed.`, error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error");
  return jsonError(503, "The database request failed. Verify MySQL is running and the MYSQL_* settings in .env.local.");
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  const body = await request.json().catch(() => null) as unknown;
  return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
}

/**
 * State-changing requests must carry an Origin header matching the site origin.
 * APP_URL (or TRUSTED_ORIGINS, comma separated) must be set when a reverse proxy
 * terminates TLS, because then request.url reports the internal origin.
 */
export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const requestOrigin = new URL(origin).origin;
    const trusted = new Set<string>();
    trusted.add(new URL(request.url).origin);
    for (const candidate of [process.env.APP_URL, ...(process.env.TRUSTED_ORIGINS || "").split(",")]) {
      const value = candidate?.trim();
      if (!value) continue;
      try { trusted.add(new URL(value).origin); } catch { /* ignore malformed entries */ }
    }
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto");
    if (forwardedHost && forwardedProto && /^[a-z]+$/i.test(forwardedProto) && /^[A-Za-z0-9.:\-[\]]+$/.test(forwardedHost)) {
      trusted.add(`${forwardedProto.toLowerCase()}://${forwardedHost.toLowerCase()}`);
    }
    return trusted.has(requestOrigin);
  } catch {
    return false;
  }
}

export function requireSameOrigin(request: Request) {
  if (!isSameOriginRequest(request)) throw new HttpError(403, "Request origin rejected.");
}

export function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || request.headers.get("x-real-ip") || "local").slice(0, 64);
}

export function userAgent(request: Request): string {
  return (request.headers.get("user-agent") || "").slice(0, 255);
}

export function appBaseUrl(request: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    try { return new URL(configured).origin; } catch { /* fall through */ }
  }
  return new URL(request.url).origin;
}

export const asString = (value: unknown, max = 1000) => (typeof value === "string" ? value.trim().slice(0, max) : "");
export const asOptionalId = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};
export const asId = (value: unknown): number | null => asOptionalId(value);
export const asBoolean = (value: unknown, fallback = false) => (typeof value === "boolean" ? value : fallback);
