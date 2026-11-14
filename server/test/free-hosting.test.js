import { test } from "node:test";
import assert from "node:assert/strict";
import { freeHostingPlatform } from "../src/hosting.js";
import { domainHeuristics } from "../src/heuristics.js";
import { inspectNetIntel, _resetNetIntelCache } from "../src/netintel.js";
import { isWhitelisted } from "../src/official.js";

test("freeHostingPlatform nhận ra tên miền con trên nền tảng miễn phí", () => {
  assert.equal(freeHostingPlatform("outlook-silk-nine.vercel.app"), "vercel.app");
  assert.equal(freeHostingPlatform("abc.github.io."), "github.io");
  assert.equal(freeHostingPlatform("vercel.app"), null);
  assert.equal(freeHostingPlatform("vnexpress.net"), null);
});

test("Outlook giả trên vercel.app: BRAND_KEYWORD + FREE_HOSTING = 40", () => {
  const h = domainHeuristics("https://outlook-silk-nine.vercel.app/");
  assert.deepEqual(h.reasons.map((r) => r.code), ["BRAND_KEYWORD", "FREE_HOSTING"]);
  assert.equal(h.score, 40);
  assert.equal(h.suspectedBrand.id, "microsoft");
});

test("trang thường trên nền tảng miễn phí chỉ bị +15", () => {
  const h = domainHeuristics("https://my-portfolio.netlify.app/");
  assert.deepEqual(h.reasons.map((r) => r.code), ["FREE_HOSTING"]);
  assert.equal(h.score, 15);
});

test("tên miền thật của Microsoft và Facebook nằm trong whitelist", () => {
  assert.ok(isWhitelisted("outlook.live.com"));
  assert.ok(isWhitelisted("login.microsoftonline.com"));
  assert.ok(isWhitelisted("www.facebook.com"));
  assert.ok(!isWhitelisted("facebook-hotro.vercel.app"));
});

test("NetIntel không tra RDAP cho trang trên nền tảng miễn phí", async () => {
  const prev = process.env.NET_INTEL;
  process.env.NET_INTEL = "1";
  _resetNetIntelCache();
  let fetchCalls = 0;
  const fakeFetch = async () => { fetchCalls++; throw new Error("không được gọi"); };
  const fakeTls = () => { throw new Error("tls giả"); };
  try {
    const r = await inspectNetIntel("https://outlook-silk-nine.vercel.app/", {}, fakeFetch, fakeTls);
    assert.equal(fetchCalls, 0);
    assert.equal(r.facts.ageDays, null);
    assert.equal(r.facts.ageSource, "platform");
    assert.equal(r.facts.platform, "vercel.app");
  } finally {
    if (prev === undefined) delete process.env.NET_INTEL; else process.env.NET_INTEL = prev;
    _resetNetIntelCache();
  }
});
