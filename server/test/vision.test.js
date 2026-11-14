import { test } from "node:test";
import assert from "node:assert/strict";

delete process.env.VISION_MOCK;
process.env.GEMINI_API_KEY = "khoa-gia-cho-test";
const vision = await import("../src/vision.js");
const { detectBrand, VISION_CONFIG, PROMPT, __setVisionClientForTest, visionStatus } = vision;

const IMG = "data:image/png;base64,AAAA";
const GOOD = { brand_detected: "bidv", confidence: 0.8, page_type: "login", asks_sensitive_data: ["password"], urgency_language: false };

const unhandled = [];
process.on("unhandledRejection", (e) => unhandled.push(e));

function fakeClient(impl) {
  const calls = [];
  return {
    calls,
    interactions: {
      create(params, options) {
        calls.push({ params, options });
        return impl(params, options);
      }
    }
  };
}

test("Tham số đúng", async () => {
  const client = fakeClient(() => Promise.resolve({ output_text: JSON.stringify(GOOD) }));
  __setVisionClientForTest(client);
  const r = await detectBrand(IMG, "BIDV - Đăng nhập");
  assert.deepEqual(r, GOOD);
  const call = client.calls[0];
  const { params, options } = call;
  assert.equal(params.model, VISION_CONFIG.model);
  assert.deepEqual(params.input[0], { type: "text", text: PROMPT });
  assert.deepEqual(params.input[1], { type: "image", data: "AAAA", mime_type: "image/png" });
  assert.equal(params.response_format.type, "text");
  assert.equal(params.response_format.mime_type, "application/json");
  assert.ok(params.response_format.schema.properties.brand_detected.enum.includes("none"));
  assert.ok(options.signal instanceof AbortSignal);
  assert.ok(!JSON.stringify(params).includes("BIDV - Đăng nhập"));
});

test("Không có tiền tố data", async () => {
  const client = fakeClient(() => Promise.resolve({ output_text: JSON.stringify(GOOD) }));
  __setVisionClientForTest(client);
  await detectBrand("QUJDRA==", "");
  assert.deepEqual(client.calls[0].params.input[1], { type: "image", data: "QUJDRA==", mime_type: "image/jpeg" });
});

test("output_text undefined", async () => {
  __setVisionClientForTest(fakeClient(() => Promise.resolve({})));
  const r = await detectBrand(IMG, "");
  assert.equal(typeof r.error, "string");
});

test("interaction là null", async () => {
  __setVisionClientForTest(fakeClient(() => Promise.resolve(null)));
  const r = await detectBrand(IMG, "");
  assert.equal(typeof r.error, "string");
});

test("JSON hỏng", async () => {
  __setVisionClientForTest(fakeClient(() => Promise.resolve({ output_text: "{brand_detected: bidv" })));
  const r = await detectBrand(IMG, "");
  assert.equal(typeof r.error, "string");
});

test("Sai định dạng", async () => {
  for (const out of ['{"brand_detected": 5}', "[]", "null", "42"]) {
    __setVisionClientForTest(fakeClient(() => Promise.resolve({ output_text: out })));
    const r = await detectBrand(IMG, "");
    assert.deepEqual(r, { error: "Kết quả Gemini sai định dạng" });
  }
});

test("Client ném lỗi", async () => {
  __setVisionClientForTest(fakeClient(() => { throw new Error("hỏng đồng bộ"); }));
  let r = await detectBrand(IMG, "");
  assert.deepEqual(r, { error: "hỏng đồng bộ" });
  
  __setVisionClientForTest(fakeClient(() => Promise.reject(new Error("hỏng bất đồng bộ"))));
  r = await detectBrand(IMG, "");
  assert.deepEqual(r, { error: "hỏng bất đồng bộ" });
});

test("Timeout", async () => {
  const old = VISION_CONFIG.timeoutMs;
  VISION_CONFIG.timeoutMs = 80;
  let aborted = false;
  __setVisionClientForTest(fakeClient((params, options) => {
    return new Promise((resolve, reject) => {
      options.signal.addEventListener("abort", () => { aborted = true; });
      setTimeout(() => reject(new Error("từ chối muộn")), 150);
    });
  }));
  const start = Date.now();
  const r = await detectBrand(IMG, "");
  const time = Date.now() - start;
  VISION_CONFIG.timeoutMs = old;
  
  assert.match(r.error, /quá thời gian/);
  assert.ok(time < 1000);
  assert.equal(aborted, true);
  await new Promise(res => setTimeout(res, 200));
  assert.deepEqual(unhandled, []);
});

test("Ảnh thiếu hoặc sai kiểu", async () => {
  __setVisionClientForTest(fakeClient(() => { throw new Error("không được gọi"); }));
  let r = await detectBrand(undefined, "");
  assert.equal(r, null);
  r = await detectBrand("", "");
  assert.equal(r, null);
  r = await detectBrand(12345, "");
  assert.equal(typeof r.error, "string");
});

test("Trạng thái off và mock", async () => {
  delete process.env.GEMINI_API_KEY;
  assert.equal(visionStatus(), "off");
  let r = await detectBrand(IMG, "");
  assert.equal(r, null);
  
  process.env.VISION_MOCK = "1";
  r = await detectBrand(undefined, "Vietcombank - cập nhật gấp");
  assert.equal(r.brand_detected, "vietcombank");
  assert.equal(r.urgency_language, true);
  assert.equal(r.mock, true);
  
  delete process.env.VISION_MOCK;
  process.env.GEMINI_API_KEY = "khoa-gia-cho-test";
});

test("SDK thật với fetch giả", async () => {
  __setVisionClientForTest(null);
  const realFetch = globalThis.fetch;
  let sent;
  globalThis.fetch = async (input, init = {}) => {
    const req = input instanceof Request ? input : new Request(input, init);
    sent = { url: req.url, body: JSON.parse(await req.clone().text()) };
    const payload = { id: "x", status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: JSON.stringify(GOOD) }] }] };
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const r = await detectBrand(IMG, "");
    assert.deepEqual(r, GOOD);
    assert.match(sent.url, /\/interactions$/);
    assert.equal(sent.body.model, VISION_CONFIG.model);
    assert.equal(sent.body.input[1].mime_type, "image/png");
    assert.equal(sent.body.response_format.mime_type, "application/json");
  } finally {
    globalThis.fetch = realFetch;
    __setVisionClientForTest(null);
  }
});
