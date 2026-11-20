/**
 * The form of a website used to find duplicates (request of November 19, 2026): no protocol (http://, https://), no
 * leading "www.", no query, fragment or trailing slash, in lower case. "HTTPS://www.Acme.ca/" and "acme.ca" are the
 * same site; "" when nothing is left.
 */
export function websiteKey(url: string | null | undefined): string {
  return (url ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
}

/** True when both are websites and the same one once the protocol, "www." and letter case are set aside. */
export function sameWebsite(a: string | null | undefined, b: string | null | undefined): boolean {
  const key = websiteKey(a);
  return key !== "" && key === websiteKey(b);
}
