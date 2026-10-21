/** Client-safe formatting helpers. Calendar dates are `YYYY-MM-DD`; instants are ISO 8601. */

const parseYmd = (ymd: string) => {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export function formatDate(ymd: string | null | undefined, fallback = "Not set"): string {
  if (!ymd) return fallback;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(parseYmd(ymd));
}

export function formatShortDate(ymd: string | null | undefined, fallback = "—"): string {
  if (!ymd) return fallback;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(parseYmd(ymd));
}

export function formatDateTime(iso: string | null | undefined, fallback = "—"): string {
  if (!iso) return fallback;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function relativeTime(iso: string | null | undefined, fallback = "—"): string {
  if (!iso) return fallback;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return fallback;
  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (abs < 60) return "just now";
  if (abs < 3600) return formatter.format(Math.round(diffSeconds / 60), "minute");
  if (abs < 86400) return formatter.format(Math.round(diffSeconds / 3600), "hour");
  if (abs < 86400 * 30) return formatter.format(Math.round(diffSeconds / 86400), "day");
  if (abs < 86400 * 365) return formatter.format(Math.round(diffSeconds / (86400 * 30)), "month");
  return formatter.format(Math.round(diffSeconds / (86400 * 365)), "year");
}

/** Today's date in the browser's timezone as `YYYY-MM-DD`. */
export function localToday(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Converts an ISO instant to the value a `datetime-local` input expects (local time, no zone). */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Formats an `HH:MM` time of day in the viewer's locale ("23:00" → "11:00 PM"). */
export function formatTimeOfDay(hhmm: string | null | undefined, fallback = "—"): string {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return fallback;
  const [hour, minute] = hhmm.split(":").map(Number);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 1, hour, minute));
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

const tones = ["violet", "blue", "orange", "green", "pink", "teal"] as const;
export function avatarTone(seed: number | string): (typeof tones)[number] {
  const number = typeof seed === "number" ? seed : [...seed].reduce((total, char) => total + char.charCodeAt(0), 0);
  return tones[Math.abs(number) % tones.length];
}

export function statusClass(code: string | null | undefined): string {
  return code && ["cold", "warm", "hot", "client", "lost", "disqualified"].includes(code) ? `status-${code}` : "status-opportunity";
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function percentChange(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "No change" : "New";
  const change = Math.round(((current - previous) / previous) * 100);
  return `${change >= 0 ? "+" : ""}${change}%`;
}
