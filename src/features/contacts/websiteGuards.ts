import { isIP } from "node:net";
import vm from "node:vm";

/**
 * Guards of Add company → Website → Fetch (check of November 19, 2026), kept apart so the unit tests can load them:
 * which addresses the server may visit, and how long it may spend reading one page.
 */

/** Whether an IP address is on a private, loopback, link-local, shared or reserved network. */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    // An IPv4 address inside IPv6 (::ffff:127.0.0.1) is judged as that IPv4 address. A URL writes it in hex
    // ([::ffff:127.0.0.1] becomes ::ffff:7f00:1), so both spellings are read.
    const dotted = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) return isPrivateAddress(dotted[1]);
    const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const high = parseInt(hex[1], 16);
      const low = parseInt(hex[2], 16);
      return isPrivateAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }
    // The rest of ::/96 (unspecified, loopback, IPv4-compatible, IPv4-translated) is never a public website.
    if (lower.startsWith("::")) return true;
    return /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || lower.startsWith("ff") || lower.startsWith("64:ff9b") || lower.startsWith("2001:db8");
  }
  return true;
}

/** Thrown when reading a page took longer than its time. */
export class ReadTimeout extends Error {
  constructor() {
    super("The page took too long to read.");
    this.name = "ReadTimeout";
  }
}

/**
 * Runs `work` (reading a fetched page) with a hard time limit. The page reading uses regular expressions on up to 2 MB of
 * someone else's HTML, and some malformed pages make them run for minutes while the whole server waits; V8 stops the work
 * at the limit instead.
 */
export function readWithin<T>(work: () => T, timeoutMs = 2000): T {
  try {
    return vm.runInNewContext("work()", { work }, { timeout: timeoutMs }) as T;
  } catch (error) {
    if ((error as { code?: string }).code === "ERR_SCRIPT_EXECUTION_TIMEOUT") throw new ReadTimeout();
    throw error;
  }
}
