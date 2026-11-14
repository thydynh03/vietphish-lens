import test from "node:test";
import assert from "node:assert/strict";
import { reason } from "../src/reasons.js";

test('reason("BRAND_KEYWORD", { domain: "a.top", brand: "Vietcombank" })', () => {
  const result = reason("BRAND_KEYWORD", { domain: "a.top", brand: "Vietcombank" });
  assert.equal(result.text, "Tên miền a.top chứa tên Vietcombank nhưng không thuộc Vietcombank.");
});

test('reason("NO_HTTPS")', () => {
  const result = reason("NO_HTTPS");
  assert.deepEqual(result, { code: "NO_HTTPS", text: "Trang không dùng kết nối bảo mật HTTPS.", weight: 10 });
});

test('reason("SUSPICIOUS_TLD", {})', () => {
  const result = reason("SUSPICIOUS_TLD", {});
  assert.equal(result.text, "Đuôi . thường bị lợi dụng trong lừa đảo.");
});

test('assert.throws(() => reason("toString"))', () => {
  assert.throws(() => reason("toString"));
});
