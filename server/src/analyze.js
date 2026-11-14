import { parse } from "tldts";
import { isWhitelisted } from "./official.js";
import { reason } from "./reasons.js";
import { domainHeuristics } from "./heuristics.js";
import { safeBrowsing } from "./safebrowsing.js";
import { detectBrand } from "./vision.js";
import { fuse } from "./fusion.js";

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

  let visionMs = 0;
  const [sb, vision] = await Promise.all([
    safeBrowsing(url),
    mode === "full" ? (async () => {
      const t1 = Date.now();
      const v = await detectBrand(screenshot, title);
      visionMs = Date.now() - t1;
      return v;
    })() : Promise.resolve(null)
  ]);

  const f = fuse({ h, sb, vision, signals, mode });

  return {
    ...f,
    layers: { whitelist: false, safeBrowsing: sb, heuristics: h.score, vision },
    latencyMs: { total: Date.now() - t0, vision: visionMs },
  };
}
