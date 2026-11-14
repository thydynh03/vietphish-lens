import { readFileSync } from "node:fs";
import { parse } from "tldts";

export const OFFICIAL = JSON.parse(readFileSync(new URL("../data/official_domains.json", import.meta.url), "utf8"));

export const brandById = new Map(OFFICIAL.brands.map((b) => [b.id, b]));

export function isWhitelisted(hostname) {
  const lowerHostname = hostname.toLowerCase();

  // Kiểm tra trustedSuffixes
  for (const s of OFFICIAL.trustedSuffixes) {
    if (lowerHostname === s || lowerHostname.endsWith("." + s)) {
      return true;
    }
  }

  // Lấy eTLD+1 domain
  const { domain } = parse(lowerHostname);

  // Kiểm tra domains của brands
  for (const brand of OFFICIAL.brands) {
    if (brand.domains.includes(domain)) {
      return true;
    }
  }

  return false;
}
