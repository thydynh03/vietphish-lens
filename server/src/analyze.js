import { parse } from "tldts";
import { isWhitelisted } from "./official.js";
import { reason } from "./reasons.js";
import { domainHeuristics } from "./heuristics.js";
import { safeBrowsing } from "./safebrowsing.js";
import { detectBrand } from "./vision.js";
import { fuse } from "./fusion.js";
import { inspectNetIntel } from "./netintel.js";

export async function analyze({ url, title = "", screenshot, signals = {}, mode = "full" }) {
  const t0 = Date.now();
  if (!signals || typeof signals !== "object") {
    signals = {};
  }
  const hostname = new URL(url).hostname;

  if (isWhitelisted(hostname)) {
    return {
      verdict: "SAFE",
      riskScore: 0,
      brand: null,
      reasons: [reason("WHITELIST", { domain: parse(hostname).domain })],
      layers: { whitelist: true },
      latencyMs: { total: Date.now() - t0 },
      degraded: false,
    };
  }

  const h = domainHeuristics(url, signals);

  const sensitive = !!(signals.hasPasswordField || signals.hasOtpField || signals.hasCardField);
  const brandLike = h.reasons.some(r => ["LOOKALIKE_DOMAIN", "HOMOGLYPH", "SUBDOMAIN_TRICK", "BRAND_KEYWORD"].includes(r.code));

  let visionMs = 0;
  const [sb, vision, netIntel] = await Promise.all([
    safeBrowsing(url),
    mode === "full" ? (async () => {
      const t1 = Date.now();
      const v = await detectBrand(screenshot, title);
      visionMs = Date.now() - t1;
      return v;
    })() : Promise.resolve(null),
    mode === "blacklist_only" ? Promise.resolve(null) : inspectNetIntel(url, { sensitive, brandLike })
  ]);

  // Không sửa trực tiếp h: layers.heuristics phải giữ điểm heuristic thuần.
  let hf = h;
  if (netIntel && !netIntel.skipped && netIntel.score > 0) {
    const extra = [];
    for (const r of netIntel.reasons || []) {
      let days;
      if (r.code === "NEW_DOMAIN") days = netIntel.facts?.ageDays;
      else if (r.code === "NEW_DV_CERT") days = netIntel.facts?.tls?.certAgeDays;
      try {
        extra.push(reason(r.code, { days: Number.isFinite(days) ? days : "vài" }));
      } catch {
        // Mã lý do mới chưa có template: bỏ qua phần chữ, không làm hỏng cả request.
      }
    }
    hf = { ...h, score: h.score + netIntel.score, reasons: [...h.reasons, ...extra] };
  }

  const f = fuse({ h: hf, sb, vision, signals, mode });

  return {
    ...f,
    layers: { whitelist: false, safeBrowsing: sb, heuristics: h.score, vision, netIntel },
    latencyMs: { total: Date.now() - t0, vision: visionMs, netIntel: netIntel?.ms || 0 },
  };
}
