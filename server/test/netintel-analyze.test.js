// Test tích hợp NetIntel trong analyze(), không gọi mạng thật.
// RDAP: thay globalThis.fetch (netintel gọi `fetch` toàn cục lúc chạy).
// TLS: thay tls.connect trên object module node:tls (netintel gọi `tls.connect` lúc chạy),
// nên không cần sửa netintel.js hay bật --experimental-test-module-mocks.
import test from "node:test";
import assert from "node:assert/strict";
import tls from "node:tls";
import { EventEmitter } from "node:events";

delete process.env.SAFE_BROWSING_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.VISION_MOCK;

const { analyze } = await import("../src/analyze.js");
const { domainHeuristics } = await import("../src/heuristics.js");
const { fuse } = await import("../src/fusion.js");
const { mockVision, __setVisionClientForTest } = await import("../src/vision.js");

const DAY = 24 * 60 * 60 * 1000;

function withEnv(t, vars) {
  const saved = {};
  for (const k of Object.keys(vars)) saved[k] = process.env[k];
  const savedFetch = globalThis.fetch;
  const savedConnect = tls.connect;
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  t.after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    globalThis.fetch = savedFetch;
    tls.connect = savedConnect;
    __setVisionClientForTest(null);
  });
}

function fetchSpy(impl) {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push(String(url));
    if (impl) return impl(url, opts);
    throw new Error("Không được gọi mạng: " + url);
  };
  return calls;
}

function rdapRegisteredDaysAgo(days) {
  return async () => new Response(
    JSON.stringify({ events: [{ eventAction: "registration", eventDate: new Date(Date.now() - days * DAY - 3600_000).toISOString() }] }),
    { status: 200, headers: { "content-type": "application/rdap+json" } }
  );
}

function fakeTls({ certAgeDays, subjectO, authorized = true }) {
  const calls = [];
  tls.connect = (opts) => {
    calls.push(opts.host);
    const s = new EventEmitter();
    s.authorized = authorized;
    s.authorizationError = authorized ? null : "CERT_HAS_EXPIRED";
    s.getPeerCertificate = () => ({
      valid_from: new Date(Date.now() - certAgeDays * DAY - 3600_000).toUTCString(),
      valid_to: new Date(Date.now() + 89 * DAY).toUTCString(),
      subject: subjectO ? { CN: opts.host, O: subjectO } : { CN: opts.host },
      issuer: { O: "Let's Encrypt" },
    });
    s.destroy = () => {};
    process.nextTick(() => s.emit("secureConnect"));
    return s;
  };
  return calls;
}

const failingVisionClient = {
  interactions: { create: async () => { throw new Error("Gemini lỗi giả lập"); } },
};

const PHISH = {
  url: "http://xacthuc-taikhoan.com:8080/",
  title: "Vietcombank - Đăng nhập VCB Digibank",
  signals: { hasPasswordField: true, hasOtpField: false, hasCardField: false, formActionHost: "collector.example-attacker.xyz" },
  mode: "full",
};

test("a. NET_INTEL tắt: kết quả giống hệt trước, chỉ thêm layers.netIntel và latencyMs.netIntel", async (t) => {
  withEnv(t, { NET_INTEL: undefined, VISION_MOCK: "1" });
  const calls = fetchSpy();
  const connects = fakeTls({ certAgeDays: 1 });

  const r = await analyze(PHISH);
  const expected = fuse({
    h: domainHeuristics(PHISH.url, PHISH.signals),
    sb: "skipped",
    vision: mockVision(PHISH.title),
    signals: PHISH.signals,
    mode: PHISH.mode,
  });

  assert.equal(r.verdict, "DANGER");
  assert.equal(r.riskScore, 85);
  assert.equal(r.verdict, expected.verdict);
  assert.equal(r.riskScore, expected.riskScore);
  assert.deepEqual(r.reasons, expected.reasons);
  assert.deepEqual(r.brand, expected.brand);
  assert.equal(r.degraded, expected.degraded);
  assert.equal(r.layers.heuristics, domainHeuristics(PHISH.url, PHISH.signals).score);
  assert.equal(r.layers.netIntel.skipped, true);
  assert.equal(r.latencyMs.netIntel, 0);
  assert.deepEqual(
    Object.keys(r).sort(),
    ["brand", "degraded", "latencyMs", "layers", "reasons", "riskScore", "verdict"]
  );
  assert.deepEqual(calls, []);
  assert.deepEqual(connects, []);
});

test("b. NET_INTEL=1, vision lỗi, tên miền 2 ngày, chứng chỉ DV 1 ngày: ít nhất SUSPICIOUS", async (t) => {
  withEnv(t, { NET_INTEL: "1", VISION_MOCK: undefined, GEMINI_API_KEY: "test-key" });
  __setVisionClientForTest(failingVisionClient);
  const calls = fetchSpy(rdapRegisteredDaysAgo(2));
  const connects = fakeTls({ certAgeDays: 1 });

  const url = "https://xacthuc-taikhoan.com/";
  const signals = { hasPasswordField: true, hasOtpField: false, hasCardField: false, formActionHost: null };
  const r = await analyze({ url, title: "Đăng nhập", screenshot: "data:image/jpeg;base64,AAAA", signals, mode: "full" });

  assert.ok(r.layers.vision?.error, "vision phải lỗi");
  assert.equal(r.degraded, true, "degraded do vision lỗi, đúng như fusion");
  assert.ok(r.riskScore >= 40, "riskScore = " + r.riskScore);
  assert.ok(["SUSPICIOUS", "DANGER"].includes(r.verdict));

  const nd = r.reasons.find((x) => x.code === "NEW_DOMAIN");
  assert.ok(nd, "phải có lý do NEW_DOMAIN");
  assert.match(nd.text, /2 ngày/);
  const dv = r.reasons.find((x) => x.code === "NEW_DV_CERT");
  assert.ok(dv, "phải có lý do NEW_DV_CERT");
  assert.match(dv.text, /1 ngày/);
  for (const x of r.reasons) {
    assert.doesNotMatch(x.text, /undefined|null|\{days\}/);
  }
  assert.equal(r.reasons.filter((x) => x.code === "NO_HTTPS").length, 0);

  // layers.heuristics giữ điểm heuristic thuần, phần NetIntel nằm trong layers.netIntel.
  assert.equal(r.layers.heuristics, domainHeuristics(url, signals).score);
  assert.equal(r.layers.netIntel.score, 40);
  assert.equal(r.layers.netIntel.degraded, false);
  assert.ok(calls.some((u) => u.includes("rdap.org/domain/xacthuc-taikhoan.com")));
  assert.deepEqual(connects, ["xacthuc-taikhoan.com"]);
});

test("c. NET_INTEL=1 nhưng RDAP treo: vẫn trả kết quả, degraded theo fusion, điểm không đổi", async (t) => {
  withEnv(t, { NET_INTEL: "1", VISION_MOCK: "1" });
  // Dùng http:// để không cần TLS. fetch treo hẳn, bỏ qua cả signal abort,
  // để chắc chắn nhánh timeout 1500ms của inspectNetIntel chạy.
  const calls = fetchSpy(() => new Promise(() => {}));
  const connects = fakeTls({ certAgeDays: 1 });

  const body = { ...PHISH, url: "http://rdap-treo-demo.com/" };
  const r = await analyze(body);

  const expected = fuse({
    h: domainHeuristics(body.url, body.signals),
    sb: "skipped",
    vision: mockVision(body.title),
    signals: body.signals,
    mode: body.mode,
  });

  assert.equal(r.layers.netIntel.degraded, true);
  assert.equal(r.layers.netIntel.score, 0);
  assert.equal(r.degraded, expected.degraded);
  assert.equal(r.degraded, false, "RDAP chậm không được bật banner chế độ cơ bản");
  assert.equal(r.riskScore, expected.riskScore);
  assert.equal(r.verdict, expected.verdict);
  assert.deepEqual(r.reasons, expected.reasons);
  assert.ok(r.latencyMs.total < 5000);
  assert.equal(calls.length, 1);
  assert.deepEqual(connects, []);
});

test("blacklist_only và whitelist: NetIntel không gọi mạng", async (t) => {
  withEnv(t, { NET_INTEL: "1", VISION_MOCK: "1" });
  const calls = fetchSpy();
  const connects = fakeTls({ certAgeDays: 1 });

  const r1 = await analyze({ url: "https://blacklist-only-demo.com/", signals: { hasPasswordField: true }, mode: "blacklist_only" });
  assert.equal(r1.riskScore, 0);
  assert.equal(r1.layers.netIntel, null);

  const r2 = await analyze({ url: "https://vcbdigibank.vietcombank.com.vn/x", mode: "full" });
  assert.deepEqual(r2.layers, { whitelist: true });

  assert.deepEqual(calls, []);
  assert.deepEqual(connects, []);
});
