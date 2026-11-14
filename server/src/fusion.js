import { brandById } from "./official.js";
import { reason } from "./reasons.js";

export const THRESHOLDS = { danger: 70, suspicious: 40 };

export function verdictOf(score) {
  if (score >= 70) return "DANGER";
  if (score >= 40) return "SUSPICIOUS";
  return "SAFE";
}

const SENSITIVE = new Set(["password", "otp", "card_number", "cvv", "pin"]);

export function fuse({ h, sb, vision, signals = {}, mode = "full" }) {
  if (sb === "hit") {
    return { verdict: "DANGER", riskScore: 100, brand: null, reasons: [reason("SAFE_BROWSING_HIT")], degraded: false };
  }

  if (mode === "blacklist_only") {
    return { verdict: "SAFE", riskScore: 0, brand: null, reasons: [], degraded: false };
  }

  const reasons = [...h.reasons];
  let V = 0;
  let hardRule = false;
  let brand = h.suspectedBrand;

  const visionOk = Boolean(vision) && !vision.error;
  const degraded = mode === "full" && !visionOk;

  if (visionOk && vision.brand_detected !== "none") {
    const vb = brandById.get(vision.brand_detected);
    const mismatch = Boolean(vb) && !vb.domains.includes(h.registrable);
    
    const asksArray = Array.isArray(vision.asks_sensitive_data) ? vision.asks_sensitive_data : [];
    const asks = asksArray.filter((x) => SENSITIVE.has(x));

    if (signals.hasOtpField && !asks.includes("otp")) asks.push("otp");
    if (signals.hasPasswordField && !asks.includes("password")) asks.push("password");
    if (signals.hasCardField && !asks.includes("card_number")) asks.push("card_number");

    const conf = Math.max(0, Math.min(1, Number(vision.confidence) || 0));

    if (mismatch) {
      brand = vb;
      if (asks.length > 0) {
        V = 40 * conf + 20 + (vision.urgency_language ? 5 : 0);
      } else {
        V = 10 * conf;
      }

      const top = [];
      top.push(reason("BRAND_DOMAIN_MISMATCH", { brand: vb.name, domain: h.registrable, official: vb.domains[0] }));
      if (asks.includes("otp")) top.push(reason("ASKS_OTP"));
      if (asks.includes("password")) top.push(reason("ASKS_PASSWORD", { brand: vb.name }));
      if (asks.includes("card_number") || asks.includes("cvv")) top.push(reason("ASKS_CARD"));
      if (vb.id === "vneid") top.push(reason("VNEID_OFFLINE"));
      if (vision.urgency_language) top.push(reason("URGENCY"));

      reasons.unshift(...top);
      hardRule = conf >= 0.7 && asks.length > 0;
    }
  }

  V = Math.min(V, 60);

  let score = Math.min(100, Math.round(h.score + V));
  if (hardRule) {
    score = Math.max(score, 85);
  }

  return {
    verdict: verdictOf(score),
    riskScore: score,
    brand: brand ? { id: brand.id, name: brand.name, officialUrl: "https://" + brand.domains[0] } : null,
    reasons,
    degraded,
  };
}
