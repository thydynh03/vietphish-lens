import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { inspectNetIntel, _resetNetIntelCache, _netIntelCacheStats } from "../src/netintel.js";

const DAY = 24 * 60 * 60 * 1000;

// Lưu và trả lại NET_INTEL để không rò sang file test khác.
function withNetIntel(t, value) {
  const saved = process.env.NET_INTEL;
  if (value === undefined) delete process.env.NET_INTEL;
  else process.env.NET_INTEL = value;
  _resetNetIntelCache();
  t.after(() => {
    if (saved === undefined) delete process.env.NET_INTEL;
    else process.env.NET_INTEL = saved;
    _resetNetIntelCache();
  });
}

// Fake fetch RDAP, ghi lại URL đã gọi.
function rdapFetch(ageDays, calls = []) {
  return async (url) => {
    calls.push(url);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        events: [{ eventAction: "registration", eventDate: new Date(Date.now() - ageDays * DAY).toISOString() }]
      })
    };
  };
}

// Fake tls.connect: cert DV (không có subject O), ghi lại hostname đã gọi.
function fakeTls(certAgeDays, { authorized = true, calls = [] } = {}) {
  return (options) => {
    calls.push(options.servername || options.host);
    const socket = new EventEmitter();
    socket.authorized = authorized;
    socket.authorizationError = authorized ? null : "CERT_HAS_EXPIRED";
    socket.getPeerCertificate = () => ({
      valid_from: new Date(Date.now() - certAgeDays * DAY).toUTCString(),
      valid_to: new Date(Date.now() + 80 * DAY).toUTCString(),
      subject: { CN: options.servername },
      issuer: { O: "Let's Encrypt" }
    });
    socket.destroy = () => {};
    setTimeout(() => socket.emit("secureConnect"), 5);
    return socket;
  };
}

test("1. NET_INTEL không đặt: skipped, fetch và tls giả không bị gọi", async (t) => {
  withNetIntel(t, undefined);
  const fetchCalls = [];
  const tlsCalls = [];
  const res = await inspectNetIntel("https://example.com", { sensitive: true }, rdapFetch(2, fetchCalls), fakeTls(1, { calls: tlsCalls }));
  assert.equal(res.skipped, true);
  assert.equal(res.score, 0);
  assert.equal(fetchCalls.length, 0);
  assert.equal(tlsCalls.length, 0);
});

test("2. Tên miền 2 ngày + cert DV 1 ngày + sensitive: score 40", async (t) => {
  withNetIntel(t, "1");
  const res = await inspectNetIntel("https://example1.com", { sensitive: true }, rdapFetch(2), fakeTls(1));
  assert.equal(res.score, 40);
  assert.equal(res.skipped, false);
  assert.equal(res.degraded, false);
  assert.ok(res.reasons.some((r) => r.code === "NEW_DOMAIN" && r.points === 25 && r.source === "rdap"));
  assert.ok(res.reasons.some((r) => r.code === "NEW_DV_CERT" && r.points === 15));
  assert.equal(res.facts.isHttps, true);
  assert.equal(res.facts.ageDays, 2);
  assert.equal(res.facts.ageSource, "rdap");
  assert.equal(res.facts.tls.authorized, true);
  assert.equal(res.facts.tls.certAgeDays, 1);
  assert.equal(res.facts.tls.issuerO, "Let's Encrypt");
});

test("3. Tên miền 3000 ngày + cert DV 1 ngày, không sensitive, không brand: score 0", async (t) => {
  withNetIntel(t, "1");
  const res = await inspectNetIntel("https://example2.com", { sensitive: false, brandLike: false }, rdapFetch(3000), fakeTls(1));
  assert.equal(res.score, 0);
  assert.equal(res.reasons.length, 0);
});

test("4. https + cert không hợp lệ: TLS_INVALID 25", async (t) => {
  withNetIntel(t, "1");
  const res = await inspectNetIntel("https://old-site.com", {}, rdapFetch(3000), fakeTls(400, { authorized: false }));
  assert.equal(res.score, 25);
  assert.ok(res.reasons.some((r) => r.code === "TLS_INVALID"));
  assert.equal(res.facts.tls.authorizationError, "CERT_HAS_EXPIRED");
});

test("5. fetch treo 5 giây (bỏ qua abort): trả về trong ~1600 ms, degraded true, score 0", async (t) => {
  withNetIntel(t, "1");
  const slowFetch = () => new Promise((resolve) => setTimeout(resolve, 5000).unref());
  const t0 = Date.now();
  const res = await inspectNetIntel("https://example3.com", { sensitive: true }, slowFetch, fakeTls(1));
  const elapsed = Date.now() - t0;
  assert.equal(res.degraded, true);
  assert.equal(res.score, 0);
  assert.ok(elapsed >= 1400 && elapsed < 1700, "elapsed " + elapsed);
});

test("6. Gọi 2 lần cùng URL: lần 2 trúng cache, không gọi fetch hay TLS nữa", async (t) => {
  withNetIntel(t, "1");
  const fetchCalls = [];
  const tlsCalls = [];
  const a = await inspectNetIntel("https://cache-test.com", { sensitive: true }, rdapFetch(2, fetchCalls), fakeTls(1, { calls: tlsCalls }));
  const b = await inspectNetIntel("https://cache-test.com", { sensitive: true }, rdapFetch(2, fetchCalls), fakeTls(1, { calls: tlsCalls }));
  assert.equal(fetchCalls.length, 1);
  assert.equal(tlsCalls.length, 1);
  assert.equal(a.score, 40);
  assert.equal(b.score, 40);
});

test("7. Hai subdomain cùng registrable domain: RDAP gọi 1 lần, TLS gọi riêng từng hostname", async (t) => {
  withNetIntel(t, "1");
  const fetchCalls = [];
  const tlsCalls = [];
  const okTls = fakeTls(400, { authorized: true, calls: tlsCalls });
  const badTls = fakeTls(400, { authorized: false, calls: tlsCalls });
  const good = await inspectNetIntel("https://good.badssl-like.com/", {}, rdapFetch(3000, fetchCalls), okTls);
  const bad = await inspectNetIntel("https://expired.badssl-like.com/", {}, rdapFetch(3000, fetchCalls), badTls);
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0], /badssl-like\.com$/);
  assert.deepEqual(tlsCalls, ["good.badssl-like.com", "expired.badssl-like.com"]);
  assert.equal(good.score, 0);
  assert.equal(bad.score, 25, "subdomain thứ hai không được dùng lại cert của subdomain đầu");
  const stats = _netIntelCacheStats();
  assert.deepEqual(stats.ageKeys, ["badssl-like.com"]);
  assert.deepEqual(stats.tlsKeys.sort(), ["expired.badssl-like.com", "good.badssl-like.com"]);
});

test("8. RDAP bị abort (lỗi) không được cache, lần sau lookup thành công vẫn chạy", async (t) => {
  withNetIntel(t, "1");
  let calls = 0;
  // Lần 1: fetch tôn trọng signal và reject khi signal abort (như fetch thật).
  const abortingFetch = (url, opts) =>
    new Promise((_, reject) => {
      calls++;
      opts.signal.addEventListener("abort", () => reject(opts.signal.reason));
    });
  const first = await inspectNetIntel("http://flaky-rdap.com/", {}, abortingFetch);
  assert.equal(first.facts.ageDays ?? null, null);
  assert.equal(first.score, 0);
  assert.equal(first.degraded, true);
  assert.deepEqual(_netIntelCacheStats().ageKeys, []);

  const second = await inspectNetIntel("http://flaky-rdap.com/", {}, async (url) => {
    calls++;
    return rdapFetch(3)(url);
  });
  assert.equal(calls, 2);
  assert.equal(second.facts.ageDays, 3);
  assert.equal(second.score, 25);
  assert.equal(second.degraded, false);
});

test("9. Lỗi TLS (ECONNRESET) không được cache", async (t) => {
  withNetIntel(t, "1");
  let tlsCalls = 0;
  const resetTls = () => {
    tlsCalls++;
    const socket = new EventEmitter();
    socket.destroy = () => {};
    setTimeout(() => socket.emit("error", new Error("read ECONNRESET")), 5);
    return socket;
  };
  const first = await inspectNetIntel("https://reset.example.org/", {}, rdapFetch(3000), resetTls);
  assert.deepEqual(first.facts.tls, { error: "read ECONNRESET" });
  assert.equal(first.score, 0);
  const second = await inspectNetIntel("https://reset.example.org/", {}, rdapFetch(3000), fakeTls(400, { authorized: false }));
  assert.equal(tlsCalls, 1);
  assert.equal(second.score, 25);
});

test("10. Không giữ event loop: timer timeout tổng được clear khi lookup thắng", async (t) => {
  withNetIntel(t, "1");
  const before = process.getActiveResourcesInfo().filter((r) => r === "Timeout").length;
  await inspectNetIntel("https://fast.example.net/", {}, rdapFetch(3000), fakeTls(400));
  const after = process.getActiveResourcesInfo().filter((r) => r === "Timeout").length;
  assert.equal(after, before);
});

test("11. :8080, 127.0.0.1, [::1] và IP private: skipped, không gọi mạng", async (t) => {
  withNetIntel(t, "1");
  const fetchCalls = [];
  const tlsCalls = [];
  for (const url of [
    "https://example.com:8080/",
    "http://127.0.0.1/",
    "http://127.0.0.1:8080/",
    "http://[::1]/",
    "https://[fe80::1]/",
    "http://0.0.0.0/",
    "http://169.254.169.254/latest/meta-data",
    "http://192.168.1.1/",
    "http://dev.localhost/"
  ]) {
    const res = await inspectNetIntel(url, { sensitive: true }, rdapFetch(2, fetchCalls), fakeTls(1, { calls: tlsCalls }));
    assert.equal(res.skipped, true, url);
    assert.equal(res.score, 0, url);
  }
  assert.equal(fetchCalls.length, 0);
  assert.equal(tlsCalls.length, 0);
});
