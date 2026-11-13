// Deal value (PD-11, SPEC §10.15): an optional amount on a deal, in the one currency the app uses. Pure rules with no
// imports, so the unit tests load this file directly; features/leads/model.ts re-exports them.

/** The one currency deal values are kept in (PD-11). */
export const dealCurrency = "CA$";
export const maxDealValue = 999_999_999;
/** "CA$82,000" (cents only when there are any); an empty value shows nothing. */
export function formatDealValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  const cents = Math.round(value * 100) % 100 !== 0;
  return `${dealCurrency}${value.toLocaleString("en-CA", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 })}`;
}
/** Reads a typed amount ("82,000", "1200.50", 500); null when left empty, an error text when it is not an amount. */
export function parseDealValue(value: unknown): { value: number | null; error: string | null } {
  if (value === null || value === undefined || value === "") return { value: null, error: null };
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/[\s,]/g, "").replace(/^(CA)?\$/i, "")) : NaN;
  if (!Number.isFinite(amount) || amount < 0) return { value: null, error: "Deal value must be an amount of zero or more." };
  if (amount > maxDealValue) return { value: null, error: "Deal value is too large." };
  return { value: Math.round(amount * 100) / 100, error: null };
}
