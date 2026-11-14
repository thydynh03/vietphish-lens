import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { domainHeuristics } from "../src/heuristics.js";

const vectors = JSON.parse(readFileSync(new URL("./vectors/heuristics.json", import.meta.url), "utf8"));

for (const v of vectors) {
  test(`domainHeuristics: ${v.url}`, () => {
    const r = domainHeuristics(v.url, v.signals || {});
    assert.equal(r.score, v.score);
    assert.deepEqual(r.reasons.map((x) => x.code), v.codes);
  });
}

test('domainHeuristics("https://vietcombank-xacthuc.top/") suspectedBrand and registrable', () => {
  const r = domainHeuristics("https://vietcombank-xacthuc.top/");
  assert.equal(r.suspectedBrand.id, "vietcombank");
  assert.equal(r.registrable, "vietcombank-xacthuc.top");
});
