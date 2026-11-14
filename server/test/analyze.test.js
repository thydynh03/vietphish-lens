import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

process.env.VISION_MOCK = "1";
delete process.env.SAFE_BROWSING_KEY;
delete process.env.GEMINI_API_KEY;
const { analyze } = await import("../src/analyze.js");

const vectors = JSON.parse(readFileSync(new URL("./vectors/api.json", import.meta.url), "utf8"));

for (const v of vectors) {
  test(`analyze: ${v.name}`, async () => {
    const r = await analyze(v.body);
    assert.equal(r.verdict, v.expect.verdict);
    assert.equal(r.riskScore, v.expect.riskScore);
  });
}

test("signals sai kiểu", async () => {
  for (const signals of [null, "abc", 5]) {
    const r = await analyze({ url: "http://a-b.example/", signals });
    assert.equal(r.riskScore, 10);
  }
});

test("Whitelist trả ngay", async () => {
  const r = await analyze({ url: "https://vcbdigibank.vietcombank.com.vn/x", mode: "full" });
  assert.deepEqual(r.layers, { whitelist: true });
  assert.deepEqual(r.reasons.map(x => x.code), ["WHITELIST"]);
  assert.equal(r.reasons[0].text, "Tên miền vietcombank.com.vn nằm trong danh sách chính thức.");
  assert.equal(r.degraded, false);
});
