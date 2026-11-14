import { domainToUnicode } from "node:url";
import { parse } from "tldts";
import { distance } from "fastest-levenshtein";
import { OFFICIAL } from "./official.js";
import { reason } from "./reasons.js";

export const WEIGHTS = { homoglyph: 40, lookalike: 40, subdomainTrick: 40, brandKeyword: 25, suspiciousTld: 15, noHttps: 10, formOtherHost: 10 };
export const SUSPICIOUS_TLDS = new Set(["top", "xyz", "cc", "icu", "vip", "shop", "online", "click", "info", "live"]);

function skeleton(s) {
  return s.replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/0/g, 'o').replace(/1/g, 'l');
}

export function domainHeuristics(url, signals = {}) {
  const u = new URL(url);
  const hostname = u.hostname;
  const p = parse(hostname);
  const label = p.domainWithoutSuffix || "";
  let score = 0;
  let reasons = [];
  let suspectedBrand = null;

  if (hostname.split(".").some((part) => part.startsWith("xn--"))) {
    score += WEIGHTS.homoglyph;
    reasons.push(reason("HOMOGLYPH", { puny: hostname, uni: domainToUnicode(hostname) }));
  }

  for (const b of OFFICIAL.brands) {
    for (const off of b.domains) {
      const offLabel = parse(off).domainWithoutSuffix;
      if (!offLabel || offLabel === label) {
        continue;
      }
      const d = distance(label, offLabel);
      if ((d > 0 && d <= 2 && offLabel.length >= 5) || skeleton(label) === offLabel) {
        score += WEIGHTS.lookalike;
        suspectedBrand ??= b;
        reasons.push(reason("LOOKALIKE_DOMAIN", { domain: p.domain, official: off, n: Math.max(d, 1) }));
        break;
      }
    }

    const sub = p.subdomain || "";
    if (b.domains.some((off) => sub.includes(off))) {
      score += WEIGHTS.subdomainTrick;
      suspectedBrand ??= b;
      reasons.push(reason("SUBDOMAIN_TRICK", { registrable: p.domain, brand: b.name }));
    } else if (b.keywords.some((k) => hostname.includes(k))) {
      score += WEIGHTS.brandKeyword;
      suspectedBrand ??= b;
      reasons.push(reason("BRAND_KEYWORD", { domain: p.domain, brand: b.name }));
    }
  }

  if (SUSPICIOUS_TLDS.has(p.publicSuffix)) {
    score += WEIGHTS.suspiciousTld;
    reasons.push(reason("SUSPICIOUS_TLD", { tld: p.publicSuffix }));
  }

  if (u.protocol !== "https:") {
    score += WEIGHTS.noHttps;
    reasons.push(reason("NO_HTTPS"));
  }

  if (signals.formActionHost && parse(signals.formActionHost).domain !== p.domain) {
    score += WEIGHTS.formOtherHost;
    reasons.push(reason("FORM_OTHER_HOST", { host: signals.formActionHost }));
  }

  return { score: Math.min(score, 60), reasons, suspectedBrand, registrable: p.domain };
}
