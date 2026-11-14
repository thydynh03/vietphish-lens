import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { domainHeuristics } from "../src/heuristics.js";
import { fuse } from "../src/fusion.js";

const vectors = JSON.parse(readFileSync(new URL("./vectors/fusion.json", import.meta.url), "utf8"));

for (const v of vectors) {
  test(`fuse vector: ${v.name}`, () => {
    const h = domainHeuristics(v.url, v.signals || {});
    const r = fuse({ h, sb: v.sb, vision: v.vision, signals: v.signals || {}, mode: v.mode });
    assert.equal(r.verdict, v.expect.verdict);
    assert.equal(r.riskScore, v.expect.riskScore);
    assert.equal(r.degraded, v.expect.degraded);
    assert.deepEqual(r.reasons.map((x) => x.code), v.expect.codes);
    assert.equal(r.brand?.id ?? null, v.expect.brandId);
  });
}

test("asks_sensitive_data sai kiểu không làm sập", () => {
  const h = domainHeuristics("http://xacthuc-taikhoan.com/", {});
  for (const asks of ["password", null, { a: 1 }]) {
    const r = fuse({ 
      h, 
      sb: "clean", 
      vision: { brand_detected: "vietcombank", confidence: 0.9, asks_sensitive_data: asks }, 
      signals: {}, 
      mode: "full" 
    });
    assert.equal(r.riskScore, 19);
    assert.deepEqual(r.reasons.map(x => x.code), ["BRAND_DOMAIN_MISMATCH", "NO_HTTPS"]);
  }
});

test("Ngưỡng luật cứng và trần của V", () => {
  const h = domainHeuristics("https://xacthuc-taikhoan.com/", {});
  const base = { brand_detected: "vietcombank", asks_sensitive_data: ["otp"], urgency_language: true };

  let r = fuse({ h, sb: "clean", vision: { ...base, confidence: 0.7 }, mode: "full" });
  assert.equal(r.riskScore, 85);

  r = fuse({ h, sb: "clean", vision: { ...base, confidence: 0.69 }, mode: "full" });
  assert.equal(r.riskScore, 53);

  r = fuse({ h, sb: "clean", vision: { ...base, confidence: 5 }, mode: "full" });
  assert.equal(r.riskScore, 85);

  r = fuse({ h, sb: "clean", vision: { ...base, brand_detected: "khong-co", confidence: 1 }, mode: "full" });
  assert.equal(r.riskScore, 0);
});
