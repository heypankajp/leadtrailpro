/**
 * Personal access tokens (SPEC §4): an administrator creates one under Administration → API access and uses it as
 * `Authorization: Bearer ltp_…` from scripts or another machine. A token acts as the person who created it, with the
 * privileges that account has at the time of each request, so terminating the account disables its tokens. Only the
 * SHA-256 hash is stored; the token itself is shown once. This module has no Node imports so the browser can use it;
 * the crypto helpers are in api-tokens.ts and storage in api-token-repository.ts.
 */

export const apiTokenPrefix = "ltp_";
/** The prefix plus 32 random bytes in base64url (43 characters). */
export const apiTokenPattern = /^ltp_[A-Za-z0-9_-]{43}$/;
export const apiTokenExpiryChoices = [30, 90, 365] as const;
export const defaultApiTokenExpiryDays = 90;
export const maxApiTokenNameLength = 80;
/** How many characters of a token are kept in clear for the list ("ltp_" plus eight). */
export const apiTokenPrefixLength = 12;

export type ApiToken = {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  name: string;
  prefix: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type CreateApiTokenInput = { name: string; expiresInDays: number | null };

export const isApiToken = (value: unknown): value is string => typeof value === "string" && apiTokenPattern.test(value);
export const apiTokenDisplayPrefix = (token: string): string => token.slice(0, apiTokenPrefixLength);

/** The token in an `Authorization: Bearer …` header, or null when the header is absent or not a bearer scheme. */
export function bearerToken(header: string | null | undefined): string | null {
  const match = /^\s*Bearer\s+(\S+)\s*$/i.exec(header ?? "");
  return match ? match[1] : null;
}

export function apiTokenExpiry(expiresInDays: number | null, now = new Date()): Date | null {
  return expiresInDays === null ? null : new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);
}

export function parseCreateApiToken(value: unknown): CreateApiTokenInput | { error: string } {
  const body = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return { error: "Give the token a name, for example the machine or script it is for." };
  if (name.length > maxApiTokenNameLength) return { error: `The name can be at most ${maxApiTokenNameLength} characters.` };
  const raw = body.expiresInDays;
  if (raw === null || raw === "" || raw === "never") return { name, expiresInDays: null };
  if (raw === undefined) return { name, expiresInDays: defaultApiTokenExpiryDays };
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > 3660) return { error: "Expiry must be a number of days from 1 to 3660, or never." };
  return { name, expiresInDays: days };
}

/** Whether a stored token may still be used: not revoked and not past its expiry. */
export function apiTokenUsable(token: { expiresAt: string | null; revokedAt: string | null }, now = new Date()): boolean {
  if (token.revokedAt) return false;
  return !token.expiresAt || new Date(token.expiresAt).getTime() > now.getTime();
}
