---
description: B3 - Công thức gộp điểm và luật cứng (server)
---

# B3. Gộp điểm

**Người làm:** B. **Thời gian dự kiến:** 25 phút. **Phụ thuộc:** B1, B2 đã xong.

## Mục tiêu

Viết hàm thuần gộp kết quả của ba lớp (Safe Browsing, heuristic tên miền, nhìn ảnh) thành điểm 0 đến 100, kết luận, và danh sách lý do xếp đúng thứ tự. Hàm này không gọi mạng nên test được hoàn toàn bằng vector.

Nguyên tắc sản phẩm phải thể hiện đúng trong công thức: trang chỉ ra DANGER khi **trông giống thương hiệu X**, **tên miền không thuộc X**, và **đòi dữ liệu nhạy cảm**. Thiếu điều kiện thứ ba thì chỉ cộng rất ít điểm, để bài báo nhắc tên ngân hàng không bị báo nhầm.

## File được sửa

- Tạo `server/src/fusion.js`
- Tạo `server/test/fusion.test.js`

## Đặc tả `server/src/fusion.js`

Import: `brandById` từ `./official.js`, `reason` từ `./reasons.js`.

```js
export const THRESHOLDS = { danger: 70, suspicious: 40 };
export function verdictOf(score)   // >= 70 "DANGER", >= 40 "SUSPICIOUS", còn lại "SAFE"
export function fuse({ h, sb, vision, signals = {}, mode = "full" })
// trả { verdict, riskScore, brand, reasons, degraded }
```

Tham số:

- `h`: kết quả của `domainHeuristics`, gồm `{ score, reasons, suspectedBrand, registrable }`.
- `sb`: chuỗi `"hit"`, `"clean"`, `"skipped"` hoặc `"error"`.
- `vision`: object kết quả nhìn ảnh, hoặc `null`, hoặc `{ error: "..." }`.
- `signals`: tín hiệu từ content script, có thể có `hasPasswordField`, `hasOtpField`, `hasCardField`.
- `mode`: `"full"`, `"no_vision"` hoặc `"blacklist_only"`.

Hằng số trong file: `const SENSITIVE = new Set(["password", "otp", "card_number", "cvv", "pin"]);`

### Thuật toán, làm đúng thứ tự

**Bước 1.** Nếu `sb === "hit"`: trả ngay `{ verdict: "DANGER", riskScore: 100, brand: null, reasons: [reason("SAFE_BROWSING_HIT")], degraded: false }`.

**Bước 2.** Nếu `mode === "blacklist_only"`: trả ngay `{ verdict: "SAFE", riskScore: 0, brand: null, reasons: [], degraded: false }`.

**Bước 3.** Khởi tạo: `reasons = [...h.reasons]`, `V = 0`, `hardRule = false`, `brand = h.suspectedBrand`.

**Bước 4.** `visionOk = Boolean(vision) && !vision.error`. `degraded = mode === "full" && !visionOk`.

**Bước 5.** Chỉ khi `visionOk && vision.brand_detected !== "none"`:

- `vb = brandById.get(vision.brand_detected)`
- `mismatch = Boolean(vb) && !vb.domains.includes(h.registrable)`
- `asks = (Array.isArray(vision.asks_sensitive_data) ? vision.asks_sensitive_data : []).filter((x) => SENSITIVE.has(x))`. Gemini có thể trả sai kiểu (chuỗi, `null`, object), nên phải kiểm `Array.isArray` trước khi gọi `.filter`.
- Gộp tín hiệu thật từ trang, mỗi dòng chỉ thêm khi chưa có:
  - `signals.hasOtpField` thì thêm `"otp"`
  - `signals.hasPasswordField` thì thêm `"password"`
  - `signals.hasCardField` thì thêm `"card_number"`
- `conf = Math.max(0, Math.min(1, Number(vision.confidence) || 0))`
- Nếu `mismatch`:
  - `brand = vb`
  - Nếu `asks.length > 0`: `V = 40 * conf + 20 + (vision.urgency_language ? 5 : 0)`. Ngược lại: `V = 10 * conf`.
  - Tạo mảng `top`, thêm theo **đúng thứ tự này**:
    1. `reason("BRAND_DOMAIN_MISMATCH", { brand: vb.name, domain: h.registrable, official: vb.domains[0] })`, luôn thêm
    2. `reason("ASKS_OTP")` nếu `asks.includes("otp")`
    3. `reason("ASKS_PASSWORD", { brand: vb.name })` nếu `asks.includes("password")`
    4. `reason("ASKS_CARD")` nếu `asks` có `"card_number"` hoặc `"cvv"`
    5. `reason("VNEID_OFFLINE")` nếu `vb.id === "vneid"`
    6. `reason("URGENCY")` nếu `vision.urgency_language`
  - `reasons.unshift(...top)`. Lý do từ lớp nhìn ảnh đứng **trước** lý do tên miền, vì overlay chỉ hiện 4 lý do đầu.
  - `hardRule = conf >= 0.7 && asks.length > 0`
- `V = Math.min(V, 60)`

**Bước 6.** `score = Math.min(100, Math.round(h.score + V))`. Nếu `hardRule` thì `score = Math.max(score, 85)`.

**Bước 7.** Trả:

```js
{
  verdict: verdictOf(score),
  riskScore: score,
  brand: brand ? { id: brand.id, name: brand.name, officialUrl: "https://" + brand.domains[0] } : null,
  reasons,
  degraded,
}
```

### Tính tay bốn ví dụ để tự đối chiếu

| Trường hợp | Tính | Kết quả |
| --- | --- | --- |
| Bài báo `http://tintuc-demo.vn:8080/` nhắc Vietcombank, không có ô nhập. `h.score = 10`, vision `vietcombank`, `conf = 0,9`, `asks` rỗng | `V = 10 × 0,9 = 9`. Điểm `10 + 9 = 19`. Không áp luật cứng vì `asks` rỗng | SAFE 19 |
| `http://xacthuc-taikhoan.com:8080/` có ô mật khẩu. `h.score = 10`, vision `vietcombank`, `conf = 0,9` | `V = 40 × 0,9 + 20 = 56`. Tổng 66. Luật cứng đúng vì `0,9 >= 0,7` và có `password`, nên nâng lên 85 | DANGER 85 |
| `http://vietcombank-xacthuc.top:8080/` có ô mật khẩu. `h.score = 60`, vision `vietcombank`, `conf = 0,9` | `V = 56`. Tổng 116, chặn ở 100 | DANGER 100 |
| `http://vneid-capnhat.cc:8080/` có ô OTP, lời hối thúc. `h.score = 50`, vision `vneid`, `conf = 0,9` | `V = 36 + 20 + 5 = 61`, chặn ở 60. Tổng 110, chặn ở 100 | DANGER 100 |

## Bẫy đã biết

| Bẫy | Hậu quả | Cách tránh |
| --- | --- | --- |
| Cộng 40 điểm chỉ vì "trông giống thương hiệu" dù không đòi dữ liệu | Bài báo nhắc tên ngân hàng bị SUSPICIOUS hoặc DANGER | `asks` rỗng thì `V = 10 * conf`, không hơn |
| Dùng `reasons.push(...top)` | Lý do OTP và mật khẩu xếp sau lý do tên miền, overlay cắt mất | Dùng `reasons.unshift(...top)` |
| Sửa trực tiếp `h.reasons` | Lần gọi sau bị dính lý do cũ | Sao chép bằng `[...h.reasons]` |
| Áp luật cứng trước khi `Math.min(100, ...)` rồi quên áp lại | Điểm sai ở trường hợp tổng nhỏ hơn 85 | Làm đúng thứ tự bước 6: chặn 100 trước, rồi `Math.max(score, 85)` |
| Không lọc `asks` qua `SENSITIVE` | `cccd` và `none` được tính là dữ liệu nhạy cảm | Lọc như đặc tả |
| Viết `(vision.asks_sensitive_data \|\| []).filter(...)` | Gemini trả chuỗi `"password"` hoặc object thì `.filter` ném `TypeError`, request thành lỗi 500 | Dùng `Array.isArray(...) ? ... : []` như đặc tả |
| Quên gộp `signals` vào `asks` | Trang demo có ô mật khẩu thật nhưng không ra `ASKS_PASSWORD` khi Gemini không liệt kê | Gộp 3 tín hiệu như đặc tả |
| Tính `degraded` khi mode là `no_vision` | Eval báo sai trạng thái | `degraded` chỉ `true` khi `mode === "full"` |
| Coi `{ error: "..." }` là kết quả hợp lệ | `vision.brand_detected` là `undefined`, khác `"none"`, code chạy tiếp rồi lỗi | Kiểm tra `visionOk` trước |
| Quên `Math.round` | Điểm ra số lẻ như 18.999999 | `Math.round(h.score + V)` |

## Test

`server/test/fusion.test.js` có 15 test: 13 test từ vector và 2 test viết tay.

Dùng `import { test } from "node:test"` và `import assert from "node:assert/strict"`. Import `domainHeuristics` từ `../src/heuristics.js` và `fuse` từ `../src/fusion.js`.

**13 test từ vector.** Đọc `test/vectors/fusion.json` bằng `readFileSync(new URL("./vectors/fusion.json", import.meta.url), "utf8")`. Mỗi phần tử có `{ name, url, signals, mode, sb, vision, expect }`. Với mỗi phần tử tạo một `test(v.name, ...)`:

```js
const h = domainHeuristics(v.url, v.signals || {});
const r = fuse({ h, sb: v.sb, vision: v.vision, signals: v.signals || {}, mode: v.mode });
assert.equal(r.verdict, v.expect.verdict);
assert.equal(r.riskScore, v.expect.riskScore);
assert.equal(r.degraded, v.expect.degraded);
assert.deepEqual(r.reasons.map((x) => x.code), v.expect.codes);
assert.equal(r.brand?.id ?? null, v.expect.brandId);
```

**Test 14. `asks_sensitive_data` sai kiểu không làm sập.** `h = domainHeuristics("http://xacthuc-taikhoan.com/", {})`. Với từng `asks` trong `["password", null, { a: 1 }]`, gọi `fuse({ h, sb: "clean", vision: { brand_detected: "vietcombank", confidence: 0.9, asks_sensitive_data: asks }, signals: {}, mode: "full" })`. Kiểm `riskScore` bằng 19 (là `10 + 9`) và mảng code lý do là `["BRAND_DOMAIN_MISMATCH", "NO_HTTPS"]`. Chuỗi `"password"` không được tính là đòi mật khẩu.

**Test 15. Ngưỡng luật cứng và trần của V.** `h = domainHeuristics("https://xacthuc-taikhoan.com/", {})`, nên `h.score = 0`. `base = { brand_detected: "vietcombank", asks_sensitive_data: ["otp"], urgency_language: true }`. Gọi `fuse({ h, sb: "clean", vision: {...}, mode: "full" })` và kiểm `riskScore`:

| `vision` | Tính | `riskScore` |
| --- | --- | --- |
| `{ ...base, confidence: 0.7 }` | V = 28 + 20 + 5 = 53. Luật cứng đúng vì `0.7 >= 0.7` | 85 |
| `{ ...base, confidence: 0.69 }` | V = 27,6 + 20 + 5 = 52,6, làm tròn 53. Không có luật cứng | 53 |
| `{ ...base, confidence: 5 }` | `conf` bị kẹp về 1, V = 65, chặn 60. Luật cứng nâng lên 85 | 85 |
| `{ ...base, brand_detected: "khong-co", confidence: 1 }` | `brandById` không có id này nên `mismatch` sai, không cộng gì | 0 |

## Nghiệm thu

Chạy trong thư mục `server/` bằng PowerShell:

```powershell
node --test test/fusion.test.js
```

Kết quả phải có `# pass 15` và `# fail 0`. Con số 15 gồm 13 vector và 2 test viết tay.

Nếu B1 và B2 đã xong thì `npm test` phải có `# pass 61` (22 của B1, 24 của B2, 15 của B3). Không dùng `node --test test/`, lệnh đó hỏng trên Node 22.

## Commit (người làm, agent không chạy)

```bash
git add server/src/fusion.js server/test/fusion.test.js
git commit -m "feat(server): gộp điểm và luật cứng [B3]"
git pull --rebase
git push
```
