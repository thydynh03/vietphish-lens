import { test, describe, before, after, mock } from "node:test";
import { deepEqual, equal } from "node:assert/strict";
import http from "node:http";

process.env.VISION_MOCK = "1";
delete process.env.SAFE_BROWSING_KEY;
delete process.env.GEMINI_API_KEY;
const { handler } = await import("../src/index.js");

describe("server endpoint", () => {
  let server;
  let base;
  let ipCounter = 1;

  before(async () => {
    mock.method(console, "log", () => {});
    mock.method(console, "error", () => {});
    server = http.createServer(handler);
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    base = "http://127.0.0.1:" + server.address().port;
  });

  after(() => {
    server.close();
  });

  function freshIp() {
    return `10.1.0.${ipCounter++}`;
  }

  function req(method, path, body, headers = {}) {
    return new Promise((resolve, reject) => {
      const opts = {
        method,
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": freshIp(),
          ...headers,
        },
      };
      const url = base + path;
      const request = http.request(url, opts, (res) => {
        let data = "";
        res.on("data", c => data += c);
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch (e) {}
          resolve({ status: res.statusCode, headers: res.headers, json });
        });
      });
      request.on("error", reject);
      if (body) {
        request.write(body);
      }
      request.end();
    });
  }

  function post(obj, headers) {
    const body = typeof obj === "string" ? obj : JSON.stringify(obj);
    return req("POST", "/analyze", body, headers);
  }

  test("1. /health và CORS", async () => {
    const r = await req("GET", "/health?x=1");
    equal(r.status, 200);
    deepEqual(r.json, { ok: true, vision: "mock", safeBrowsing: "off", model: r.json.model });
    equal(r.headers["access-control-allow-origin"], "*");
    equal(r.headers["access-control-allow-headers"], "content-type");
    equal(r.headers["access-control-allow-methods"], "GET,POST,OPTIONS");
  });

  test("2. OPTIONS và 404", async () => {
    let r = await req("OPTIONS", "/analyze");
    equal(r.status, 204);
    equal(r.headers["access-control-allow-origin"], "*");

    r = await req("GET", "/khong-co");
    equal(r.status, 404);
    r = await req("GET", "/analyze");
    equal(r.status, 404);
    r = await req("POST", "/health", "{}");
    equal(r.status, 404);
  });

  test("3. Input xấu trả 400", async () => {
    const bad = ["", "khong-phai-json", "null", "[]", "5", '"chuoi"', "{}", '{"url":""}', '{"url":5}', '{"url":"khong co scheme"}'];
    for (const b of bad) {
      const r = await post(b);
      equal(r.status, 400);
      equal(typeof r.json.error, "string");
    }
    const r2 = await req("GET", "/health");
    equal(r2.status, 200);
  });

  test("4. Kiểu lạ vẫn 200", async () => {
    const bodies = [
      { url: "http://thu-1.example/", signals: "abc" },
      { url: "http://thu-2.example/", signals: null },
      { url: "http://thu-3.example/", signals: [1, 2] },
      { url: "http://thu-4.example/", mode: "lạ" },
      { url: "http://thu-5.example/", mode: { a: 1 } },
      { url: "http://thu-6.example/", title: { a: 1 }, screenshot: 123 },
      { url: "http://thu-7.example/", signals: { formActionHost: 123 } },
    ];
    for (const b of bodies) {
      const r = await post(b);
      equal(r.status, 200);
      equal(r.json.verdict, "SAFE");
    }
  });

  test("5. Quá 8 MB trả 413", async () => {
    const big = Buffer.alloc(8 * 1024 * 1024 + 10, 120);
    const r = await req("POST", "/analyze", big);
    equal(r.status, 413);

    const r2 = await new Promise((resolve, reject) => {
      const request = http.request(base + "/analyze", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": freshIp(),
        }
      }, (res) => {
        let data = "";
        res.on("data", c => data += c);
        res.on("end", () => {
          let json = null;
          try { json = JSON.parse(data); } catch (e) {}
          resolve({ status: res.statusCode, headers: res.headers, json });
        });
      });
      request.on("error", reject);
      const chunk = Buffer.alloc(1 << 20, 120);
      for (let i = 0; i < 9; i++) {
        request.write(chunk);
      }
      request.end();
    });
    equal(r2.status, 413);

    const r3 = await req("GET", "/health");
    equal(r3.status, 200);
  });

  test("6. Gần 8 MB vẫn đọc được", async () => {
    const r = await post({ url: "https://vietcombank.com.vn/", title: "x".repeat(7 * 1024 * 1024) });
    equal(r.status, 200);
    equal(r.json.verdict, "SAFE");
  });

  test("7. Khóa cache", async () => {
    const body = { url: "http://vietcombank-xacthuc.top:8080/cache-test", title: "Vietcombank", mode: "full" };
    let r = await post(body);
    equal(r.json.cached, false);
    const firstScore = r.json.riskScore;

    r = await post(body);
    equal(r.json.cached, true);
    equal(r.json.riskScore, firstScore);

    r = await post({ ...body, mode: "no_vision" });
    equal(r.json.cached, false);

    const s1 = { url: "http://cache-signals.example/", title: "Vietcombank", mode: "full", signals: { hasPasswordField: true } };
    r = await post(s1);
    equal(r.json.cached, false);

    r = await post({ ...s1, signals: {} });
    equal(r.json.cached, false);

    r = await post(s1);
    equal(r.json.cached, true);

    r = await post({ ...s1, signals: "abc" });
    equal(r.json.cached, true);

    const img = { url: "http://cache-image.example/", title: "x" };
    r = await post(img);
    equal(r.json.cached, false);

    r = await post({ ...img, screenshot: "AAAA" });
    equal(r.json.cached, false);

    r = await post(img);
    equal(r.json.cached, true);

    r = await post({ ...img, screenshot: "AAAA" });
    equal(r.json.cached, true);
  });

  test("8. Chỉ http và https", async () => {
    const bad = ["ftp://vietcombank.com.vn/", "javascript:alert(1)", "file:///C:/x", "data:text/html,hi", "chrome://extensions", "mailto:a@b.vn"];
    for (const url of bad) {
      const r = await post({ url });
      equal(r.status, 400);
      equal(r.json.error, "Chỉ hỗ trợ url http hoặc https");
    }
    let r = await post({ url: "HTTP://thu-proto.example/" });
    equal(r.status, 200);
    r = await post({ url: "https://thu-proto.example/" });
    equal(r.status, 200);
  });

  test("9. Mode lạ là full", async () => {
    const body = { url: "http://vietcombank-xacthuc.top:8080/mode-la", title: "Vietcombank" };
    let r = await post({ ...body, mode: "lạ" });
    equal(r.status, 200);
    equal(r.json.cached, false);
    equal(r.json.layers.vision !== undefined && r.json.layers.vision !== null, true);
    const firstScore = r.json.riskScore;

    r = await post({ ...body, mode: "full" });
    equal(r.json.cached, true);
    equal(r.json.riskScore, firstScore);

    r = await post({ ...body, url: body.url + "2", mode: "no_vision" });
    equal(r.json.layers.vision, null);
  });

  test("10. Không cache kết quả degraded", async () => {
    delete process.env.VISION_MOCK;
    try {
      const body = { url: "http://degraded-test.example/", mode: "full" };
      let r = await post(body);
      equal(r.json.degraded, true);
      r = await post(body);
      equal(r.json.cached, false);
    } finally {
      process.env.VISION_MOCK = "1";
    }
  });

  test("11. Giới hạn 60 request mỗi phút", async () => {
    const ip = "203.0.113.7";
    const body = { url: "https://vietcombank.com.vn/" };
    for (let i = 1; i <= 60; i++) {
      const r = await post(body, { "x-forwarded-for": `${ip}, 10.0.0.${i}` });
      equal(r.status, 200);
    }
    const r61 = await post(body, { "x-forwarded-for": `${ip}, 10.9.9.9` });
    equal(r61.status, 429);
    deepEqual(r61.json, { error: "Quá nhiều yêu cầu, thử lại sau." });
    equal(r61.headers["access-control-allow-origin"], "*");

    const rOther = await post(body, { "x-forwarded-for": "203.0.113.8" });
    equal(rOther.status, 200);

    const rHealth = await req("GET", "/health", null, { "x-forwarded-for": ip });
    equal(rHealth.status, 200);
  });
});