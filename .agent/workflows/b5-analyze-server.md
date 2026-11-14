---
description: B5 - Điều phối phân tích và HTTP server /analyze (server)
---

# B5. Điều phối và server `/analyze`

**Người làm:** B. **Thời gian dự kiến:** 40 phút. **Phụ thuộc:** B1, B2, B3, B4 đã xong.

## Mục tiêu

Nối các lớp đã viết thành một endpoint chạy được:

- `analyze.js` nhận một request đã đọc xong, kiểm whitelist, chấm heuristic, gọi Safe Browsing và Gemini song song, rồi gộp điểm.
- `index.js` là HTTP server thuần `node:http`: `GET /health`, `POST /analyze`, CORS, giới hạn body 8 MB, cache 10 phút, giới hạn 60 request mỗi phút cho mỗi IP.
- `smoke.js` gọi một server đang chạy với 6 kịch bản trong `test/vectors/api.json`. Người làm extension và người deploy dùng script này để kiểm server.

## File được sửa

- Tạo `server/src/analyze.js`
- Viết lại toàn bộ `server/src/index.js` (thay khung rỗng hiện có)
- Tạo `server/test/analyze.test.js`
- Tạo `server/test/server.test.js`
- Tạo `server/test/smoke.js`

Không sửa `server/package.json`. Script `test` trong đó đã là `node --test "test/*.test.js"`, nên `smoke.js` và `try-gemini.js` không bị chạy chung.

## Đặc tả `server/src/analyze.js`

Import:

```js
import { parse } from "tldts";
import { isWhitelisted } from "./official.js";
import { reason } from "./reasons.js";
import { domainHeuristics } from "./heuristics.js";
import { safeBrowsing } from "./safebrowsing.js";
import { detectBrand } from "./vision.js";
import { fuse } from "./fusion.js";
```

Export:

```js
export async function analyze({ url, title = "", screenshot, signals = {}, mode = "full" })
```

Thuật toán, làm đúng thứ tự:

1. `t0 = Date.now()`.
2. Nếu `!signals || typeof signals !== "object"` thì gán `signals = {}`. Giá trị mặc định của tham số chỉ áp cho `undefined`, nên `null` hay chuỗi vẫn lọt vào nếu thiếu dòng này.
3. `hostname = new URL(url).hostname`. URL sai thì dòng này ném lỗi, nơi gọi tự xử lý.
4. Nếu `isWhitelisted(hostname)` thì trả ngay, không gọi mạng:

```js
{
  verdict: "SAFE",
  riskScore: 0,
  brand: null,
  reasons: [reason("WHITELIST", { domain: parse(hostname).domain })],
  layers: { whitelist: true },
  latencyMs: { total: Date.now() - t0 },
  degraded: false,
}
```

5. `h = domainHeuristics(url, signals)`.
6. `let visionMs = 0`. Chạy song song bằng `Promise.all` hai việc:
   - `safeBrowsing(url)`.
   - Nếu `mode === "full"`: một hàm async tự gọi, ghi `t1 = Date.now()`, `v = await detectBrand(screenshot, title)`, gán `visionMs = Date.now() - t1`, trả `v`. Mode khác thì dùng `Promise.resolve(null)`.
   - Lấy kết quả thành `[sb, vision]`.
7. `f = fuse({ h, sb, vision, signals, mode })`.
8. Trả:

```js
{
  ...f,
  layers: { whitelist: false, safeBrowsing: sb, heuristics: h.score, vision },
  latencyMs: { total: Date.now() - t0, vision: visionMs },
}
```

## Đặc tả `server/src/index.js`

Import:

```js
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { analyze } from "./analyze.js";
import { visionStatus, VISION_CONFIG } from "./vision.js";
```

Hằng số:

```js
const MAX_BODY = 8 * 1024 * 1024;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;
const RATE_MAX = 60;
const RATE_WINDOW_MS = 60 * 1000;
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};
```

Hai `Map` cấp module: `cache` (khóa sang `{ at, result }`) và `hits` (IP sang `{ start, count }`).

Export duy nhất: `export async function handler(req, res)`. Test dựng server riêng bằng `http.createServer(handler)`.

### Hàm phụ, không export

**`send(res, status, obj)`.** `res.writeHead(status, { ...CORS, "content-type": "application/json; charset=utf-8" })`, rồi `res.end(JSON.stringify(obj))`.

**`readBody(req)`** trả `Promise` của chuỗi UTF-8. Làm đúng các bước:

1. Biến `chunks = []`, `size = 0`, `over = false`.
2. Hàm `tooLarge()`: đặt `over = true`, xóa `chunks` (`chunks.length = 0`), tạo `err = new Error("Body quá lớn")`, gán `err.status = 413`, rồi `reject(err)`.
3. Nếu `Number(req.headers["content-length"]) > MAX_BODY` thì gọi `tooLarge()`, gọi `req.resume()` để đọc bỏ phần còn lại, rồi `return`.
4. `req.on("data", c => ...)`: nếu `over` thì bỏ qua. Ngược lại cộng `size += c.length`. Nếu `size > MAX_BODY` thì gọi `tooLarge()`, không thì `chunks.push(c)`.
5. `req.on("end", ...)`: chỉ khi `!over` thì `resolve(Buffer.concat(chunks).toString("utf8"))`.
6. `req.on("error", reject)`.

**Tuyệt đối không gọi `req.destroy()`.** Hủy socket thì client nhận `ECONNRESET` thay vì đọc được response 413.

**`rateLimited(ip)`** trả `true` khi vượt giới hạn:

1. `now = Date.now()`.
2. Nếu `hits.size > 10000` thì duyệt `hits`, xóa mục nào có `now - v.start >= RATE_WINDOW_MS`.
3. `e = hits.get(ip)`. Nếu chưa có hoặc `now - e.start >= RATE_WINDOW_MS` thì `hits.set(ip, { start: now, count: 1 })` và trả `false`.
4. Ngược lại `e.count++` và trả `e.count > RATE_MAX`.

**`cacheGet(key)`**: không có mục thì trả `null`. Có mà `Date.now() - e.at > CACHE_TTL_MS` thì xóa mục và trả `null`. Còn lại trả `e.result`.

**`cacheSet(key, result)`**: nếu `result.degraded` thì `return`, không cache. Nếu `cache.size >= CACHE_MAX` thì xóa mục cũ nhất `cache.delete(cache.keys().next().value)`. Rồi `cache.set(key, { at: Date.now(), result })`.

**`logLine(result, url, screenshot)`** in một dòng bằng `console.log`, không in nội dung ảnh:

1. `img` là `"ảnh " + Math.round(screenshot.length / 1024) + "KB"` khi có `screenshot`, còn lại `"không ảnh"`.
2. `l = result.layers || {}`.
3. `layers` là chuỗi `wl=${l.whitelist} sb=${l.safeBrowsing ?? "-"} h=${l.heuristics ?? "-"} v=${l.vision?.brand_detected ?? (l.vision?.error ? "lỗi" : "-")}`.
4. In `[${result.verdict} ${result.riskScore}] ${url} (${img}) ${layers} ${result.latencyMs?.total ?? 0}ms`, thêm `" cache"` ở cuối khi `result.cached`.

### `handler(req, res)`, làm đúng thứ tự

Bọc toàn bộ trong `try`.

1. `path = new URL(req.url, "http://x").pathname`. So đường dẫn bằng `path`, nên `/health?x=1` vẫn khớp `/health`.
2. `req.method === "OPTIONS"`: `res.writeHead(204, CORS)`, `res.end()`, `return`. Áp cho mọi đường dẫn.
3. `GET /health`: `send(res, 200, { ok: true, vision: visionStatus(), safeBrowsing: process.env.SAFE_BROWSING_KEY ? "on" : "off", model: VISION_CONFIG.model })`.
4. `POST /analyze`, theo thứ tự:
   1. `ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?"`. Cloud Run đặt IP thật của client ở phần tử đầu của header này.
   2. `rateLimited(ip)` đúng thì `send(res, 429, { error: "Quá nhiều yêu cầu, thử lại sau." })`.
   3. `body = JSON.parse(await readBody(req))` trong `try` riêng. Bắt lỗi: `e.status === 413` thì `send(res, 413, { error: "Body quá lớn" })`; lỗi khác thì `send(res, 400, { error: "Body không phải JSON hợp lệ" })`.
   4. Nếu `!body || typeof body !== "object" || typeof body.url !== "string"` thì `send(res, 400, { error: "Thiếu trường url" })`.
   5. `parsed = new URL(body.url)` trong `try` riêng. Ném lỗi thì `send(res, 400, { error: "url không hợp lệ" })`.
   6. Nếu `parsed.protocol !== "http:" && parsed.protocol !== "https:"` thì `send(res, 400, { error: "Chỉ hỗ trợ url http hoặc https" })`. Bước này chặn `ftp:`, `javascript:`, `file:`, `data:`, `chrome:`, `mailto:`. `new URL` tự đổi `HTTP:` thành `http:` nên URL viết hoa vẫn qua.
   7. `mode = ["full", "no_vision", "blacklist_only"].includes(body.mode) ? body.mode : "full"`. Mode lạ hay thiếu đều thành `full`.
   8. `signals = body.signals && typeof body.signals === "object" ? body.signals : {}`.
   9. Khóa cache: `key = [mode, body.url, JSON.stringify(signals), body.screenshot ? "1" : "0"].join("|")`.
   10. `hit = cacheGet(key)`. Có thì `out = { ...hit, cached: true }`, gọi `logLine(out, body.url, body.screenshot)`, rồi `send(res, 200, out)`.
   11. Không có thì `result = { ...(await analyze({ ...body, mode, signals })), cached: false }`, rồi `cacheSet(key, result)`, `logLine(result, body.url, body.screenshot)`, `send(res, 200, result)`.
5. Còn lại: `send(res, 404, { error: "Not found" })`. Câu này khớp `docs/API.md`.

`catch (e)` ngoài cùng: `console.error("Lỗi:", e)`. Nếu `!res.headersSent` thì `send(res, 500, { error: String(e?.message || e) })`, không thì `res.end()`.

Mỗi nhánh gọi `send` xong phải `return` ngay, để không gửi response hai lần.

### Khởi động server

Server chỉ mở cổng khi file được chạy trực tiếp bằng `node src/index.js`. Khi test import file thì không mở cổng. Trên Windows `import.meta.url` có dạng `file:///D:/...` còn `process.argv[1]` có dạng `D:\...`, nên **không được so hai chuỗi này trực tiếp**. Viết đúng như sau, dùng đúng `realpathSync.native`, chép nguyên hàm này, không tự viết lại:

```js
function isMain() {
  if (!process.argv[1]) return false;
  try {
    const self = realpathSync.native(fileURLToPath(import.meta.url));
    const arg = resolvePath(process.argv[1]);
    for (const cand of [arg, arg + ".js"]) {
      try { if (realpathSync.native(cand) === self) return true; } catch {}
    }
  } catch {}
  return false;
}
```

Nếu `isMain()` thì:

1. `port = Number(process.env.PORT) || 8787`. Cloud Run tự đặt `PORT`.
2. `createServer(handler).listen(port, "0.0.0.0", ...)`. Phải nghe `0.0.0.0`, Cloud Run không gọi được nếu nghe `127.0.0.1`.
3. Trong callback in đúng hai dòng:
   - `VietPhish Lens server: cổng ${port}`
   - `  vision: ${visionStatus()} | safeBrowsing: ${process.env.SAFE_BROWSING_KEY ? "on" : "off"} | model: ${VISION_CONFIG.model}` (hai dấu cách đầu dòng)

## Đặc tả `server/test/smoke.js`

Script chạy tay, không dùng `node:test`.

1. `base = (process.argv[2] || "http://127.0.0.1:8787").replace(/\/$/, "")`.
2. Đọc `vectors/api.json` bằng `readFileSync(new URL("./vectors/api.json", import.meta.url), "utf8")`.
3. `health = await (await fetch(base + "/health")).json()`. In `health: ` cùng `JSON.stringify(health)`.
4. `exact = health.vision === "mock"`. Với mock thì so cả điểm; với Gemini thật thì điểm thay đổi theo lần gọi nên chỉ so verdict.
5. Với mỗi vector `v`: `POST base + "/analyze"`, header `content-type: application/json`, body `JSON.stringify(v.body)`. `ok = res.status === 200 && r.verdict === v.expect.verdict && (!exact || r.riskScore === v.expect.riskScore)`. Đếm `bad` khi không `ok`. In một dòng:
   `${ok ? "ĐẠT" : "SAI "} | ${v.name} | mong đợi ${v.expect.verdict} ${v.expect.riskScore} | nhận ${r.verdict} ${r.riskScore}${exact ? "" : " (tham khảo)"} | degraded=${r.degraded}`
6. Cuối cùng in `Tất cả đạt` nếu `bad === 0`, ngược lại in `${bad} mục sai`. Thoát bằng `process.exit(bad ? 1 : 0)`.

**Lưu ý khi server bật Gemini thật** (`vision: on`): smoke không gửi ảnh, nên lớp nhìn ảnh trả `null` và kết quả `degraded=true`. Khi đó kịch bản 3, 4, 6 ra SAI (SUSPICIOUS 60, SUSPICIOUS 50, SAFE 20) là **đúng thiết kế**, không phải lỗi. Muốn smoke đạt 6/6 thì chạy server với `VISION_MOCK=1`.

## Tính tay sáu kịch bản (vision mock)

| # | URL, mode | `h.score` | Vision mock (từ tiêu đề) | Kết quả |
| --- | --- | --- | --- | --- |
| 1 | `https://vietcombank.com.vn/`, full | không tính | không gọi | Whitelist: SAFE 0 |
| 2 | `http://vietcombank-xacthuc.top:8080/`, no_vision | 25 + 15 + 10 + 10 = 60 | không gọi | SUSPICIOUS 60 |
| 3 | như trên, full | 60 | `vietcombank`, conf 0,9, có ô mật khẩu | V = 40 × 0,9 + 20 = 56. Tổng 116, chặn 100: DANGER 100 |
| 4 | `http://vneid-capnhat.cc:8080/`, full | 25 + 15 + 10 = 50 | `vneid`, conf 0,9, tiêu đề có "cập nhật", có ô OTP | V = 36 + 20 + 5 = 61, chặn 60. Tổng 110, chặn 100: DANGER 100 |
| 5 | `http://tintuc-demo.vn:8080/`, full | 10 | `vietcombank`, conf 0,9, không có ô nào | V = 10 × 0,9 = 9. SAFE 19 |
| 6 | `http://xacthuc-taikhoan.com:8080/`, full | 10 + 10 = 20 | `vietcombank`, conf 0,9, có ô mật khẩu | V = 56. Tổng 76, luật cứng nâng lên 85: DANGER 85 |

## Bẫy đã biết

| Bẫy | Hậu quả | Cách tránh |
| --- | --- | --- |
| So `import.meta.url` với `process.argv[1]` bằng chuỗi | Trên Windows không bao giờ bằng, `node src/index.js` chạy xong thoát im lặng, không mở cổng | Dùng hàm `isMain()` như đặc tả |
| Gọi `server.listen` ở cấp module không qua `isMain()` | Test import `index.js` thì mở cổng 8787, đụng server đang chạy, test treo | Chỉ `listen` bên trong `if (isMain())` |
| Gọi `req.destroy()` khi body quá lớn | Client nhận `ECONNRESET` thay vì 413, test 413 fail | Đọc bỏ phần thừa như bước `readBody` |
| Khóa cache chỉ có `mode|url` | Lần gọi đầu thiếu `signals` ra SAFE, bị cache 10 phút, lần gọi đủ tín hiệu cũng ra SAFE | Khóa gồm mode, url, `JSON.stringify(signals)`, có ảnh hay không |
| Cache kết quả `degraded` | Gemini lỗi một lần là trang giả bị coi là kém nguy hiểm 10 phút | `cacheSet` bỏ qua khi `result.degraded` |
| Mode lạ trả 400 hoặc chạy như `no_vision` | Test "mode lạ" fail | Mode ngoài danh sách thì thành `full` |
| Thiếu bước 2 của `analyze` | `signals: null` làm `domainHeuristics` đọc `null.formActionHost`, request thành 500 | Không phải object thì gán `{}` |
| Không chặn protocol | URL `javascript:` hay `chrome://` đi vào heuristic, ra kết quả vô nghĩa | Bước 4.6 của handler |
| Gọi `send` mà quên `return` | Lỗi `ERR_HTTP_HEADERS_SENT`, server in lỗi | `return send(...)` |
| Giới hạn tần suất áp cho cả `/health` | Theo dõi sức khỏe server bị chặn | Chỉ đếm trong nhánh `POST /analyze` |
| Lấy IP bằng `req.socket.remoteAddress` trước | Trên Cloud Run mọi request cùng IP proxy, cả đội bị chặn chung | Ưu tiên phần tử đầu của `x-forwarded-for` |
| Nghe `localhost` hoặc `127.0.0.1` | Cloud Run báo container không mở cổng | `listen(port, "0.0.0.0")` |
| Gọi thử bằng `http://localhost:8787` | PowerShell thử IPv6 `::1` trước, mỗi lần chậm khoảng 1 giây | Dùng `http://127.0.0.1:8787` |
| Gọi thử bằng `curl.exe -d '{"url":...}'` trong PowerShell | PowerShell làm hỏng dấu nháy, server trả 400 | Dùng `node test/smoke.js` hoặc `Invoke-RestMethod` |
| Đặt env sau khi `import` tĩnh trong test | `VISION_CONFIG.model` đã đọc lúc import, trạng thái vision sai | Đặt env trước rồi `await import(...)` |

## Test

Cả hai file dùng `node:test` và `node:assert/strict`.

### `server/test/analyze.test.js`, 8 test

Đầu file, trước khi import:

```js
process.env.VISION_MOCK = "1";
delete process.env.SAFE_BROWSING_KEY;
delete process.env.GEMINI_API_KEY;
const { analyze } = await import("../src/analyze.js");
```

1 đến 6. Đọc `vectors/api.json`. Mỗi vector `v` tạo một test tên `` `analyze: ${v.name}` ``: `r = await analyze(v.body)`, kiểm `r.verdict` bằng `v.expect.verdict` và `r.riskScore` bằng `v.expect.riskScore`.

7. **signals sai kiểu.** Với từng `signals` trong `[null, "abc", 5]`: `analyze({ url: "http://a-b.example/", signals })` có `riskScore` bằng 10 (chỉ có `NO_HTTPS`).

8. **Whitelist trả ngay.** `analyze({ url: "https://vcbdigibank.vietcombank.com.vn/x", mode: "full" })`. Kiểm: `r.layers` `deepEqual` với `{ whitelist: true }`; mảng code lý do là `["WHITELIST"]`; `r.reasons[0].text` bằng `Tên miền vietcombank.com.vn nằm trong danh sách chính thức.`; `r.degraded` là `false`.

### `server/test/server.test.js`, 11 test

Đầu file, trước khi import:

```js
process.env.VISION_MOCK = "1";
delete process.env.SAFE_BROWSING_KEY;
delete process.env.GEMINI_API_KEY;
const { handler } = await import("../src/index.js");
```

Chuẩn bị:

- `before`: tắt log bằng `mock.method(console, "log", () => {})` và `mock.method(console, "error", () => {})`. Tạo `server = http.createServer(handler)`, nghe cổng `0` trên `127.0.0.1` (hệ điều hành tự chọn cổng trống). `base = "http://127.0.0.1:" + server.address().port`.
- `after`: đóng server.
- `freshIp()` trả `10.1.0.1`, `10.1.0.2`, ... tăng dần. Mỗi request mặc định gửi header `x-forwarded-for: freshIp()` để không chạm giới hạn 60 request.
- `req(method, path, body, headers = {})` gửi bằng `http.request`, header mặc định `content-type: application/json` và `x-forwarded-for`, ghi đè bằng `headers`. Trả `{ status, headers, json }`, với `json` là `null` nếu body không phải JSON.
- `post(obj, headers)` gửi `POST /analyze`. `obj` là chuỗi thì gửi nguyên, không thì `JSON.stringify(obj)`.

Các test:

1. **`/health` và CORS.** `GET /health?x=1` trả 200, `json` `deepEqual` với `{ ok: true, vision: "mock", safeBrowsing: "off", model: r.json.model }`. Ba header CORS đúng giá trị.
2. **OPTIONS và 404.** `OPTIONS /analyze` trả 204 và có `access-control-allow-origin: *`. `GET /khong-co`, `GET /analyze`, `POST /health` (body `"{}"`) đều trả 404.
3. **Input xấu trả 400.** Với từng body chuỗi `""`, `"khong-phai-json"`, `"null"`, `"[]"`, `"5"`, `'"chuoi"'`, `"{}"`, `'{"url":""}'`, `'{"url":5}'`, `'{"url":"khong co scheme"}'`: status 400 và `json.error` là chuỗi. Sau đó `GET /health` vẫn 200.
4. **Kiểu lạ vẫn 200.** Bảy body sau đều trả 200 và `verdict` là `"SAFE"`: `{ url: "http://thu-1.example/", signals: "abc" }`, `{ url: "http://thu-2.example/", signals: null }`, `{ url: "http://thu-3.example/", signals: [1, 2] }`, `{ url: "http://thu-4.example/", mode: "lạ" }`, `{ url: "http://thu-5.example/", mode: { a: 1 } }`, `{ url: "http://thu-6.example/", title: { a: 1 }, screenshot: 123 }`, `{ url: "http://thu-7.example/", signals: { formActionHost: 123 } }`.
5. **Quá 8 MB trả 413.** `big = Buffer.alloc(8 * 1024 * 1024 + 10, 120)`. Gửi `big` bằng `req` (có `content-length`): 413. Gửi lại bằng `http.request` không đặt `content-length`, ghi từng khối 1 MB (`1 << 20`) rồi `end()`: status 413. Sau đó `GET /health` vẫn 200.
6. **Gần 8 MB vẫn đọc được.** `post({ url: "https://vietcombank.com.vn/", title: "x".repeat(7 * 1024 * 1024) })` trả 200, verdict `"SAFE"`.
7. **Khóa cache.** `body = { url: "http://vietcombank-xacthuc.top:8080/cache-test", title: "Vietcombank", mode: "full" }`. Lần 1 `cached: false`, lần 2 `cached: true` và cùng `riskScore`. Đổi `mode: "no_vision"` thì `cached: false`. Với `s1 = { url: "http://cache-signals.example/", title: "Vietcombank", mode: "full", signals: { hasPasswordField: true } }` (nghĩa là `title` và `mode` giữ nguyên như `body`, chỉ đổi `url` và thêm `signals`): gửi `s1` ra `false`; gửi `{ ...s1, signals: {} }` ra `false`; gửi lại `s1` ra `true`; gửi `{ ...s1, signals: "abc" }` ra `true` (chuỗi được chuẩn hóa thành `{}`, trùng khóa với lượt `signals: {}`). Với `img = { url: "http://cache-image.example/", title: "x" }`: gửi `img` ra `false`; gửi `{ ...img, screenshot: "AAAA" }` ra `false`; gửi lại `img` ra `true`; gửi lại bản có ảnh ra `true`.
8. **Chỉ http và https.** Mỗi URL `"ftp://vietcombank.com.vn/"`, `"javascript:alert(1)"`, `"file:///C:/x"`, `"data:text/html,hi"`, `"chrome://extensions"`, `"mailto:a@b.vn"` trả 400 với `json.error` đúng bằng `"Chỉ hỗ trợ url http hoặc https"`. `"HTTP://thu-proto.example/"` và `"https://thu-proto.example/"` trả 200.
9. **Mode lạ là full.** `body = { url: "http://vietcombank-xacthuc.top:8080/mode-la", title: "Vietcombank" }`. Gửi với `mode: "lạ"`: 200, `cached: false`, `layers.vision` có giá trị. Gửi với `mode: "full"`: `cached: true` và cùng `riskScore`. Gửi `{ ...body, url: body.url + "2", mode: "no_vision" }`: `layers.vision` là `null`.
10. **Không cache kết quả degraded.** Xóa `VISION_MOCK` (vision thành `off`, mode full nên degraded). Gửi hai lần `{ url: "http://degraded-test.example/", mode: "full" }`: lần 1 `degraded: true`, lần 2 `cached: false`. Trong `finally` đặt lại `VISION_MOCK = "1"`.
11. **Giới hạn 60 request mỗi phút.** `ip = "203.0.113.7"`, body `{ url: "https://vietcombank.com.vn/" }`. Gửi 60 lần với header `x-forwarded-for: "203.0.113.7, 10.0.0.<i>"`, lần nào cũng 200. Lần 61 với `"203.0.113.7, 10.9.9.9"` trả 429, `json` `deepEqual` với `{ error: "Quá nhiều yêu cầu, thử lại sau." }`, có header `access-control-allow-origin: *`. IP `"203.0.113.8"` vẫn 200. `GET /health` với IP đã bị chặn vẫn 200.

## Nghiệm thu

Chạy trong thư mục `server/` bằng PowerShell.

**Bước 1. Unit test của bước này.**

```powershell
node --test test/analyze.test.js test/server.test.js
```

Phải có `# pass 19` và `# fail 0` (8 test analyze, 11 test server). Test 413 gửi 8 MB nên cả lượt mất vài giây.

**Bước 2. Toàn bộ unit test.**

```powershell
npm test
```

Phải có `# pass 96` và `# fail 0` (B1 có 22, B2 có 24, B3 có 15, B4 có 16, B5 có 19). Không dùng `node --test test/`, lệnh đó hỏng trên Node 22.

**Bước 3. Chạy server mock.** Mở một cửa sổ PowerShell riêng:

```powershell
cd D:\vietphish-lens\server
Remove-Item Env:SAFE_BROWSING_KEY -ErrorAction SilentlyContinue
Remove-Item Env:GEMINI_MODEL -ErrorAction SilentlyContinue
$env:VISION_MOCK="1"
$env:PORT="8787"
node src/index.js
```

Phải in đúng hai dòng:

```text
VietPhish Lens server: cổng 8787
  vision: mock | safeBrowsing: off | model: gemini-3.5-flash-lite
```

Nếu lệnh thoát ngay mà không in gì, xem lại hàm `isMain()`.

**Bước 4. Smoke 6 kịch bản.** Ở cửa sổ PowerShell khác, trong `server/`:

```powershell
node test/smoke.js http://127.0.0.1:8787
```

Output phải đúng là:

```text
health: {"ok":true,"vision":"mock","safeBrowsing":"off","model":"gemini-3.5-flash-lite"}
ĐẠT | 1. Trang thật vietcombank.com.vn | mong đợi SAFE 0 | nhận SAFE 0 | degraded=false
ĐẠT | 2. VCB giả, chỉ heuristic | mong đợi SUSPICIOUS 60 | nhận SUSPICIOUS 60 | degraded=false
ĐẠT | 3. VCB giả, đầy đủ | mong đợi DANGER 100 | nhận DANGER 100 | degraded=false
ĐẠT | 4. VNeID giả đòi OTP | mong đợi DANGER 100 | nhận DANGER 100 | degraded=false
ĐẠT | 5. Bài báo nhắc Vietcombank | mong đợi SAFE 19 | nhận SAFE 19 | degraded=false
ĐẠT | 6. Tên miền trung lập giả giao diện VCB | mong đợi DANGER 85 | nhận DANGER 85 | degraded=false
Tất cả đạt
```

Cửa sổ server đồng thời in 6 dòng log, số mili giây có thể khác:

```text
[SAFE 0] https://vietcombank.com.vn/ (không ảnh) wl=true sb=- h=- v=- 0ms
[SUSPICIOUS 60] http://vietcombank-xacthuc.top:8080/ (không ảnh) wl=false sb=skipped h=60 v=- 1ms
[DANGER 100] http://vietcombank-xacthuc.top:8080/ (không ảnh) wl=false sb=skipped h=60 v=vietcombank 0ms
[DANGER 100] http://vneid-capnhat.cc:8080/ (không ảnh) wl=false sb=skipped h=50 v=vneid 1ms
[SAFE 19] http://tintuc-demo.vn:8080/ (không ảnh) wl=false sb=skipped h=10 v=vietcombank 0ms
[DANGER 85] http://xacthuc-taikhoan.com:8080/ (không ảnh) wl=false sb=skipped h=20 v=vietcombank 0ms
```

Chạy smoke lần thứ hai trong vòng 10 phút thì các dòng log có thêm chữ ` cache` ở cuối. Kết quả smoke vẫn y hệt.

Xong thì bấm `Ctrl+C` ở cửa sổ server.

## Commit (người làm, agent không chạy)

```powershell
git add server/src/analyze.js server/src/index.js server/test/analyze.test.js server/test/server.test.js server/test/smoke.js
git commit -m "feat(server): điều phối phân tích và endpoint /analyze [B5]"
git pull --rebase
git push
```
