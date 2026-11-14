import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { safeBrowsing } from "../src/safebrowsing.js";

const realFetch = globalThis.fetch;

function withFetch(impl) {
  globalThis.fetch = impl;
  process.env.SAFE_BROWSING_KEY = "khoa-gia";
}

function restore() {
  globalThis.fetch = realFetch;
  delete process.env.SAFE_BROWSING_KEY;
}

test("Thiếu key", async () => {
  delete process.env.SAFE_BROWSING_KEY;
  let called = false;
  globalThis.fetch = async () => { called = true; };
  try {
    const r = await safeBrowsing("http://a.com/");
    assert.equal(r, "skipped");
    assert.equal(called, false);
  } finally {
    restore();
  }
});

test("Gửi đúng body, có matches", async () => {
  let url, body;
  withFetch(async (u, init) => {
    url = u;
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ matches: [{ threatType: "SOCIAL_ENGINEERING" }] }), { status: 200 });
  });
  try {
    const r = await safeBrowsing("http://lua-dao.top/");
    assert.equal(r, "hit");
    assert.match(url, /^https:\/\/safebrowsing\.googleapis\.com\/v4\/threatMatches:find\?key=/);
    assert.deepEqual(body.client, { clientId: "vietphish-lens", clientVersion: "1.0.0" });
    assert.deepEqual(body.threatInfo.threatEntries, [{ url: "http://lua-dao.top/" }]);
    assert.deepEqual(body.threatInfo.threatTypes, ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"]);
  } finally {
    restore();
  }
});

test("Body rỗng", async () => {
  withFetch(async () => new Response("{}", { status: 200 }));
  try {
    const r = await safeBrowsing("http://a.com/");
    assert.equal(r, "clean");
  } finally {
    restore();
  }
});

test("Ba kiểu lỗi", async () => {
  withFetch(async () => new Response("bị chặn", { status: 403 }));
  try {
    assert.equal(await safeBrowsing("http://a.com/"), "error");
  } finally {
    restore();
  }
  
  withFetch(async () => { throw new TypeError("fetch failed"); });
  try {
    assert.equal(await safeBrowsing("http://a.com/"), "error");
  } finally {
    restore();
  }
  
  withFetch(async () => new Response("<html>", { status: 200 }));
  try {
    assert.equal(await safeBrowsing("http://a.com/"), "error");
  } finally {
    restore();
  }
});

test("Timeout 3 giây", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  withFetch((u, init) => {
    return new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")));
    });
  });
  try {
    const p = safeBrowsing("http://a.com/");
    let settled = false;
    p.then(() => { settled = true; });
    mock.timers.tick(2999);
    await Promise.resolve();
    assert.equal(settled, false);
    mock.timers.tick(1);
    assert.equal(await p, "error");
  } finally {
    mock.timers.reset();
    restore();
  }
});
