import { createHash, randomBytes } from "node:crypto";
import { apiTokenPrefix } from "./api-token-model.ts";

/** Server-side helpers for personal access tokens (SPEC §4); the browser-safe model is api-token-model.ts. */

export const newApiToken = (): string => `${apiTokenPrefix}${randomBytes(32).toString("base64url")}`;
export const hashApiToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export { apiTokenDisplayPrefix, apiTokenExpiry, apiTokenPattern, apiTokenUsable, bearerToken, isApiToken, parseCreateApiToken } from "./api-token-model.ts";
export type { ApiToken, CreateApiTokenInput } from "./api-token-model.ts";
