---
description: A1 - Content script đọc tín hiệu trang và vẽ cảnh báo (extension)
---

# A1. Content script và overlay cảnh báo

**Người làm:** A. **Thời gian dự kiến:** 30 phút cho agent, cộng 10 phút người kiểm tay trong Chrome. **Phụ thuộc:** không. Bước này làm trước khi có server.

## Mục tiêu

Viết content script chạy trong mọi trang web. Content script làm hai việc:

1. Khi service worker hỏi, đọc trang và trả về các tín hiệu: có ô mật khẩu không, có ô OTP không, có ô số thẻ không, form gửi dữ liệu tới máy chủ nào.
2. Khi service worker gửi kết luận, vẽ cảnh báo lên trang. `DANGER` thì phủ đỏ toàn màn hình. `SUSPICIOUS` thì hiện một dải vàng cam ở mép trên. `SAFE` thì không vẽ gì.

Cảnh báo nằm trong Shadow DOM kiểu `closed`, để CSS của trang giả không sửa được giao diện cảnh báo và JavaScript của trang giả không đọc được nội dung bên trong.

## File được sửa

- Tạo `extension/content.js`
- Sửa `extension/manifest.json`: chỉ thêm khóa `content_scripts`

Không sửa `extension/background.js` ở bước này.

## Đặc tả `extension/manifest.json`

Thêm đúng một khóa, đặt sau khóa `background`. Giữ nguyên mọi khóa khác.

```json
"content_scripts": [
  { "matches": ["http://*/*", "https://*/*"], "js": ["content.js"], "run_at": "document_idle" }
],
```

Không thêm `default_popup` ở bước này. Popup thuộc bước A3.

## Đặc tả `extension/content.js`

File là script classic. Không có `import`, không có `export`. Toàn bộ code nằm trong một hàm tự gọi `(function () { ... })();` để không lộ biến ra trang.

### Khung file, theo đúng thứ tự từ trên xuống

1. Dòng đầu trong hàm tự gọi: nếu `window.__vietphishLensLoaded` đã có thì `return`. Sau đó gán `window.__vietphishLensLoaded = true`. Dòng này chống nạp hai lần.
2. Hằng số `const ROOT_ID = "vietphish-lens-root";`
3. Hàm `escapeHtml(value)`
4. Hàm `getSignals()`
5. Biến `let host = null;`
6. Hàm `clearOverlay()`
7. Hằng số `STYLE`, là một template string (chuỗi trong cặp dấu backtick) chứa toàn bộ CSS
8. Hàm `mount(html)`
9. Hàm `render(result)`
10. Lệnh `chrome.runtime.onMessage.addListener(...)` ở cuối, chạy đồng bộ, không nằm trong hàm nào khác

### `escapeHtml(value)`

Đổi `null` và `undefined` thành chuỗi rỗng, rồi `String(...)`. Sau đó thay lần lượt bằng regex có cờ `g`, **đúng thứ tự này**:

| Ký tự | Thay bằng |
| --- | --- |
| `&` | `&amp;` |
| `<` | `&lt;` |
| `>` | `&gt;` |
| `"` | `&quot;` |
| `'` | `&#39;` |

Thay `&` đầu tiên. Thay sau thì `&lt;` bị biến thành `&amp;lt;`.

### `getSignals()`

1. `inputs = [...document.querySelectorAll("input")]`
2. Hàm phụ `text(el)`: ghép `el.name`, `el.id`, `el.placeholder`, `el.getAttribute("autocomplete")`, bỏ giá trị rỗng bằng `.filter(Boolean)`, nối bằng dấu cách, rồi `.toLowerCase()`.
3. `hasPasswordField`: có ít nhất một input mà `(el.type || "").toLowerCase() === "password"`.
4. `hasOtpField`: có ít nhất một input mà `text(el)` khớp regex `/otp|one-time-code|mã xác thực|ma xac thuc/`.
5. `hasCardField`: có ít nhất một input mà `text(el)` khớp regex `/card|cc-number|cvv|số thẻ/`.
6. `formActionHost`: mặc định `null`. Lấy `form = document.querySelector("form[action]")`. Nếu có form thì trong `try`: `formActionHost = new URL(form.action, location.href).hostname || null`. Trong `catch` gán `null`.
7. Trả `{ hasPasswordField, hasOtpField, hasCardField, formActionHost }`. Đủ 4 khóa, đúng tên.

Selector là `form[action]`, không phải `form`. Form không có thuộc tính `action` thì `form.action` trả URL của chính trang, làm `formActionHost` thành tên miền trang giả. Server sẽ không cộng điểm "form gửi sang máy chủ khác", nhưng khóa cache và log bị lệch so với bản chuẩn.

### `clearOverlay()`

Shadow root kiểu `closed` nên `host.shadowRoot` luôn là `null`. Vì vậy giữ tham chiếu ở biến `host`.

1. Nếu `host` có giá trị thì `host.remove()`.
2. Tìm `document.getElementById(ROOT_ID)`, có thì `.remove()`. Bước này dọn trường hợp còn sót.
3. `host = null`.

### `mount(html)`

1. Gọi `clearOverlay()`.
2. `host = document.createElement("div")`, gán `host.id = ROOT_ID`.
3. `const shadow = host.attachShadow({ mode: "closed" })`.
4. `shadow.innerHTML = "<style>" + STYLE + "</style>" + html`.
5. Tìm `shadow.querySelector("[data-close]")`. Có thì gắn sự kiện `click` gọi `clearOverlay`.
6. `document.documentElement.appendChild(host)`. Gắn vào thẻ `<html>`, **không** gắn vào `document.body`.
7. Trả `shadow`.

### CSS trong hằng số `STYLE`

Viết các luật sau, đúng giá trị.

| Selector | Thuộc tính |
| --- | --- |
| `:host` | `all: initial` |
| `*` | `box-sizing: border-box` |
| `.overlay` | `position: fixed; inset: 0; z-index: 2147483647; background: rgba(150,20,20,.96); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); color: #fff; display: flex; align-items: center; justify-content: center; padding: 24px; font-family: "Segoe UI", Roboto, "Noto Sans", Arial, sans-serif; overflow: auto` |
| `a.primary:focus-visible, button:focus-visible` | `outline: 3px solid #ffd54a; outline-offset: 2px` |
| `.card` | `max-width: 640px; width: 100%` |
| `h1` | `margin: 0 0 12px; font-size: 30px; line-height: 1.25` |
| `.score` | `margin: 0 0 20px; font-size: 18px; opacity: .92` |
| `ul` | `margin: 0 0 28px; padding-left: 22px; font-size: 19px; line-height: 1.5` |
| `li` | `margin-bottom: 8px` |
| `.actions` | `display: flex; flex-wrap: wrap; gap: 12px; align-items: center` |
| `a.primary` | `display: inline-block; background: #fff; color: #8f1a14; font-weight: 700; font-size: 18px; padding: 14px 22px; border-radius: 8px; text-decoration: none` |
| `button` | `font: inherit; cursor: pointer` |
| `button.secondary` | `background: transparent; color: #fff; border: 1px solid rgba(255,255,255,.7); font-size: 15px; padding: 12px 18px; border-radius: 8px` |
| `.banner` | `position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647; background: #a8670f; color: #fff; display: flex; align-items: center; gap: 12px; padding: 10px 16px; font-size: 15px; line-height: 1.4; font-family: "Segoe UI", Roboto, "Noto Sans", Arial, sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,.35)` |
| `.banner .msg` | `flex: 1` |
| `.banner button` | `background: rgba(255,255,255,.18); color: #fff; border: 1px solid rgba(255,255,255,.6); border-radius: 6px; padding: 6px 14px; font-size: 14px` |

`z-index: 2147483647` là số lớn nhất trình duyệt cho phép. Giá trị nhỏ hơn thì trang giả có thể đè lên cảnh báo.

### `render(result)`

**Bước 1.** Gọi `clearOverlay()`. Nếu `result` rỗng, hoặc `result.verdict` không phải `"DANGER"` và không phải `"SUSPICIOUS"`, thì `return`. Như vậy `SAFE` không vẽ gì.

**Bước 2.** Chuẩn bị:

- `score = Math.round(Number(result.riskScore)) || 0`
- `reasons = Array.isArray(result.reasons) ? result.reasons : []`

**Bước 3. Nhánh `DANGER`.**

- `items`: lấy `reasons.slice(0, 4)`, mỗi phần tử thành `"<li>" + escapeHtml(r && r.text) + "</li>"`, nối bằng `""`. Chỉ hiện **4 lý do đầu**.
- `degraded`: nếu `result.degraded` thì là chuỗi `" · chưa có kết quả phân tích hình ảnh"` (dấu cách, dấu chấm giữa `·`, dấu cách), ngược lại là `""`.
- Nút chính `primary`, mặc định `""`. Lấy `official = result.brand && typeof result.brand.officialUrl === "string" ? result.brand.officialUrl : ""`. Chỉ khi `official` khớp regex `/^https:\/\//i` thì tạo:
  `'<a class="primary" rel="noopener noreferrer" href="' + escapeHtml(official) + '">Về trang chính thức ' + escapeHtml(result.brand.name) + "</a>"`
- Gọi `mount(...)` với HTML ghép theo đúng cấu trúc sau:

```
<div class="overlay" role="alertdialog" aria-modal="true"><div class="card">
  <h1>⚠ CẢNH BÁO: CÓ THỂ LÀ TRANG GIẢ MẠO</h1>
  <p class="score">Điểm rủi ro {score}/100{escapeHtml(degraded)}</p>
  <ul>{items}</ul>
  <div class="actions">{primary}<button class="secondary" data-close>Tôi hiểu rủi ro, vẫn tiếp tục</button></div>
</div></div>
```

- Giữ giá trị trả về của `mount` vào `shadow`. Sau đó chuyển focus ra khỏi trang giả, rồi `return`:

```js
if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
const focusTarget = shadow.querySelector("a.primary") || shadow.querySelector("[data-close]");
if (focusTarget) focusTarget.focus({ preventScroll: true });
return;
```

Lý do: trang giả thường đặt sẵn con trỏ trong ô mật khẩu. Không `blur()` thì người dùng vẫn gõ tiếp vào ô đó dù màn hình đã phủ đỏ.

**Bước 4. Nhánh `SUSPICIOUS`.**

- `first = reasons[0] && reasons[0].text ? " " + reasons[0].text : ""`
- Gọi `mount(...)` với HTML:

```
<div class="banner" role="alert"><span class="msg"><strong>Trang đáng ngờ ({score}/100):</strong>{escapeHtml(first)}</span><button data-close>Đóng</button></div>
```

Banner không chuyển focus.

### Câu chữ nguyên văn

Chép đúng từng ký tự, kể cả dấu.

| Vị trí | Chữ |
| --- | --- |
| Tiêu đề overlay | `⚠ CẢNH BÁO: CÓ THỂ LÀ TRANG GIẢ MẠO` |
| Dòng điểm | `Điểm rủi ro 100/100` |
| Đuôi dòng điểm khi `degraded` | ` · chưa có kết quả phân tích hình ảnh` |
| Nút chính | `Về trang chính thức Vietcombank` (tên lấy từ `result.brand.name`) |
| Nút phụ | `Tôi hiểu rủi ro, vẫn tiếp tục` |
| Banner | `Trang đáng ngờ (55/100):` rồi lý do đầu tiên |
| Nút đóng banner | `Đóng` |

### Lắng nghe tin nhắn

```js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === "getSignals") sendResponse(getSignals());
  else if (msg.type === "verdict") render(msg.result);
  else if (msg.type === "clear") clearOverlay();
});
```

Mọi nhánh đều trả lời đồng bộ hoặc không trả lời. Vì vậy **không** `return true`.

## Bẫy đã biết

| Bẫy | Triệu chứng nhìn thấy trong Chrome | Cách tránh |
| --- | --- | --- |
| Ghép chuỗi từ server vào `innerHTML` mà không qua `escapeHtml` | Lý do chứa `<img onerror=...>` chạy được script, tiêu đề tab bị đổi | Mọi giá trị lấy từ `result` đều qua `escapeHtml`. Chỉ `score` là số nên ghép thẳng |
| Dùng `mode: "open"` | Console của trang gõ `document.getElementById("vietphish-lens-root").shadowRoot` ra object thay vì `null` | `attachShadow({ mode: "closed" })` |
| Gỡ overlay bằng `host.shadowRoot...` | `TypeError: Cannot read properties of null`, bấm nút không tắt được overlay | Giữ tham chiếu ở biến `host`, gỡ bằng `host.remove()` |
| Gắn host vào `document.body` | Trang không có `body` hoặc trang giả thay `body` thì overlay biến mất | `document.documentElement.appendChild(host)` |
| Quên `blur()` và `focus()` | Overlay đã hiện mà gõ phím vẫn ra chữ trong ô mật khẩu bên dưới | Làm đúng 3 dòng ở cuối nhánh `DANGER` |
| Viết `return true` trong `onMessage` | Không lỗi ngay, nhưng service worker chờ một response không bao giờ tới | Không `return true` |
| Trả lời `getSignals` bằng `Promise` hoặc sau `await` | Service worker nhận `undefined`, trang giả có ô mật khẩu vẫn ra SAFE | `sendResponse(getSignals())` ngay, đồng bộ |
| Hiện hết mọi lý do | Overlay dài quá màn hình, nút bị đẩy xuống dưới | `reasons.slice(0, 4)` |
| Nhận `officialUrl` không kiểm tra | Server lỗi trả `javascript:...` thì nút chạy được script | Chỉ tạo nút khi URL bắt đầu bằng `https://` |
| Thiếu cờ chống nạp hai lần | Hai overlay chồng lên nhau, bấm "Đóng" vẫn còn một cái | Kiểm `window.__vietphishLensLoaded` ở dòng đầu |
| Dùng `import` hoặc `export` | Thẻ extension hiện lỗi đỏ `Cannot use import statement outside a module` | Script classic, mọi thứ trong một hàm tự gọi |
| Thiếu `backdrop-filter` | Chữ của trang giả xuyên qua nền đỏ, rối mắt khi quay video | Giữ cả `-webkit-backdrop-filter` và `backdrop-filter` |

## Tự kiểm trước khi báo xong

Agent tự chạy các lệnh sau ở gốc repo, dán output vào câu trả lời cuối. Các lệnh dưới đây chạy trong PowerShell 7 (`pwsh`). Nếu shell của agent là bash thì dùng `grep -nE` tương đương với `Select-String`.

```powershell
node --check extension/content.js
node -e "JSON.parse(require('fs').readFileSync('extension/manifest.json','utf8')); console.log('manifest.json hợp lệ')"
Select-String -Path extension\*.js -Pattern '^\s*(import|export)\b'
Select-String -Path extension\content.js -Pattern '^\s*return true'
```

Kết quả mong đợi: lệnh 1 không in gì. Lệnh 2 in `manifest.json hợp lệ`. Lệnh 3 và lệnh 4 không in gì.

Root `package.json` có `"type": "module"`, nên `node --check` đọc file như ES module. Content script không có `import` nên vẫn kiểm cú pháp được. Tuy nhiên `node --check` **không** báo lỗi khi có `import`, vì vậy phải chạy thêm lệnh 3.

Soát bằng mắt, đánh dấu từng dòng:

- [ ] `attachShadow({ mode: "closed" })`
- [ ] `document.documentElement.appendChild(host)`, không phải `body`
- [ ] Mọi chỗ ghép chữ từ `result` vào HTML đều có `escapeHtml`
- [ ] `escapeHtml` thay `&` đầu tiên
- [ ] Selector form là `form[action]`
- [ ] Nhánh `DANGER` có `blur()` rồi `focus({ preventScroll: true })`
- [ ] `reasons.slice(0, 4)`
- [ ] Listener `onMessage` nằm ở cấp cao nhất của hàm tự gọi, không có `return true`
- [ ] Câu chữ tiếng Việt khớp bảng "Câu chữ nguyên văn"

## Nghiệm thu

Phần này do người làm bằng tay trong Chrome. Chưa cần server. Service worker vẫn chỉ in `hello`, nên mình đóng vai service worker bằng cách dán lệnh vào console của nó.

### Chuẩn bị

1. Mở một cửa sổ PowerShell ở gốc repo, chạy trang demo và để nguyên cửa sổ đó:

   ```powershell
   node demo-sites/serve.js
   ```

2. Mở cửa sổ PowerShell thứ hai ở gốc repo, mở Chrome demo có trỏ 4 tên miền demo về máy mình:

   ```powershell
   pwsh -File scripts\chrome-demo.ps1
   ```

   Script dùng profile riêng `%TEMP%\vietphish-demo-profile`, mở sẵn `chrome://extensions`, nhận `-ChromePath "<đường dẫn chrome.exe>"` khi Chrome cài ở chỗ lạ. Máy không có pwsh 7 thì gõ tay một dòng, cùng tên profile:

   ```powershell
   & "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="$env:TEMP\vietphish-demo-profile" --host-resolver-rules="MAP vietcombank-xacthuc.top 127.0.0.1, MAP vneid-capnhat.cc 127.0.0.1, MAP xacthuc-taikhoan.com 127.0.0.1, MAP tintuc-demo.vn 127.0.0.1" chrome://extensions
   ```

3. Trong trang `chrome://extensions`: bật **Developer mode**, bấm **Load unpacked**, chọn thư mục `extension`. Nếu đã nạp từ trước thì bấm nút tải lại (mũi tên vòng) trên thẻ VietPhish Lens.
4. Mở tab mới, vào `http://vietcombank-xacthuc.top:8080/`. Nếu tab này mở **trước** khi tải lại extension thì bấm F5, vì tab cũ chưa có content script mới.
5. Quay lại `chrome://extensions`, trên thẻ VietPhish Lens bấm link **service worker**. Cửa sổ DevTools của service worker mở ra, chọn tab **Console**.

### Dán đoạn định nghĩa vào console của service worker

Dán toàn bộ khối dưới đây một lần rồi Enter. Khối này định nghĩa hai kết quả mẫu và hàm `vpSend` gửi tin nhắn tới tab web đang hiển thị.

```js
const DANGER = {
  verdict: "DANGER",
  riskScore: 100,
  brand: { id: "vietcombank", name: "Vietcombank", officialUrl: "https://vietcombank.com.vn" },
  reasons: [
    { code: "BRAND_DOMAIN_MISMATCH", text: "Trang này trông giống Vietcombank nhưng địa chỉ vietcombank-xacthuc.top không phải tên miền chính thức (vietcombank.com.vn).", weight: 40 },
    { code: "ASKS_PASSWORD", text: "Trang yêu cầu mật khẩu đăng nhập Vietcombank trên một tên miền lạ.", weight: 20 },
    { code: "BRAND_KEYWORD", text: "Tên miền vietcombank-xacthuc.top chứa tên Vietcombank nhưng không thuộc Vietcombank.", weight: 25 },
    { code: "SUSPICIOUS_TLD", text: "Đuôi .top thường bị lợi dụng trong lừa đảo.", weight: 15 },
    { code: "NO_HTTPS", text: "Trang không dùng kết nối bảo mật HTTPS.", weight: 10 },
    { code: "FORM_OTHER_HOST", text: "Dữ liệu bạn nhập sẽ được gửi sang máy chủ khác (collector.example-attacker.xyz).", weight: 10 }
  ],
  layers: { whitelist: false, safeBrowsing: "skipped", heuristics: 60, vision: { brand_detected: "vietcombank", confidence: 0.9 } },
  latencyMs: { total: 3, vision: 0 },
  degraded: false,
  cached: false
};
const SUSPICIOUS = {
  verdict: "SUSPICIOUS",
  riskScore: 55,
  brand: { id: "vietcombank", name: "Vietcombank", officialUrl: "https://vietcombank.com.vn" },
  reasons: [
    { code: "SUBDOMAIN_TRICK", text: "Tên miền thật là secure-login.xyz; phần chữ Vietcombank phía trước chỉ là phần giả.", weight: 40 },
    { code: "SUSPICIOUS_TLD", text: "Đuôi .xyz thường bị lợi dụng trong lừa đảo.", weight: 15 }
  ],
  layers: { whitelist: false, safeBrowsing: "skipped", heuristics: 55, vision: null },
  latencyMs: { total: 1, vision: 0 },
  degraded: false,
  cached: false
};
async function vpSend(msg) {
  const tabs = await chrome.tabs.query({ active: true, url: ["http://*/*", "https://*/*"] });
  if (!tabs.length) console.warn("Không có tab http hoặc https nào đang mở");
  for (const t of tabs) {
    const reply = await chrome.tabs.sendMessage(t.id, msg).catch((e) => "LỖI: " + e.message);
    console.log(msg.type, t.url, JSON.stringify(reply));
  }
}
```

Hai kết quả mẫu này lấy từ response thật của server bản tham chiếu. Riêng `layers.vision` đã rút gọn vì content script không đọc trường đó.

### Các bước kiểm và kết quả mong đợi

Mỗi lệnh dán vào console của service worker. Trước mỗi lệnh, bấm vào tab trang demo một lần để tab đó đang hiển thị.

| Bước | Làm | Phải thấy |
| --- | --- | --- |
| 1 | Ở tab `http://vietcombank-xacthuc.top:8080/`, chạy `vpSend({ type: "getSignals" })` | Console in `getSignals http://vietcombank-xacthuc.top:8080/ {"hasPasswordField":true,"hasOtpField":false,"hasCardField":false,"formActionHost":"collector.example-attacker.xyz"}` |
| 2 | Đổi tab sang `http://vneid-capnhat.cc:8080/`, chạy lại `vpSend({ type: "getSignals" })` | `{"hasPasswordField":false,"hasOtpField":true,"hasCardField":false,"formActionHost":null}` |
| 3 | Đổi tab sang `http://tintuc-demo.vn:8080/`, chạy lại | `{"hasPasswordField":false,"hasOtpField":false,"hasCardField":false,"formActionHost":null}` |
| 4 | Về trang `vietcombank-xacthuc.top`, bấm chuột vào ô mật khẩu cho con trỏ nhấp nháy ở đó. Chạy `vpSend({ type: "verdict", result: DANGER })` | Console in `verdict http://vietcombank-xacthuc.top:8080/ undefined`. Trang phủ đỏ toàn màn hình, chữ trắng, tiêu đề `⚠ CẢNH BÁO: CÓ THỂ LÀ TRANG GIẢ MẠO`, dòng `Điểm rủi ro 100/100`, đúng **4** gạch đầu dòng (từ "Trang này trông giống Vietcombank..." đến "Đuôi .top thường bị lợi dụng trong lừa đảo."), nút trắng chữ đỏ `Về trang chính thức Vietcombank` có viền vàng, nút viền trắng `Tôi hiểu rủi ro, vẫn tiếp tục` |
| 5 | Gõ thử vài chữ cái | Ô mật khẩu bên dưới **không** nhận thêm ký tự nào |
| 6 | Bấm phím Tab một lần rồi Enter | Overlay biến mất, trang vẫn ở `vietcombank-xacthuc.top` |
| 7 | Chạy `vpSend({ type: "verdict", result: { ...DANGER, degraded: true } })` | Dòng điểm thành `Điểm rủi ro 100/100 · chưa có kết quả phân tích hình ảnh` |
| 8 | Chạy `vpSend({ type: "verdict", result: SUSPICIOUS })` | Overlay đỏ biến mất. Ở mép trên có dải màu vàng cam `#a8670f`, chữ trắng: **Trang đáng ngờ (55/100):** Tên miền thật là secure-login.xyz; phần chữ Vietcombank phía trước chỉ là phần giả. Bên phải có nút `Đóng` |
| 9 | Bấm `Đóng` | Dải vàng cam biến mất |
| 10 | Chạy `vpSend({ type: "verdict", result: DANGER })` rồi `vpSend({ type: "clear" })` | Overlay hiện rồi biến mất |
| 11 | Chạy `vpSend({ type: "verdict", result: { ...SUSPICIOUS, reasons: [{ text: '<img src=x onerror="document.title=\'XSS\'">thử' }] } })` | Banner hiện nguyên văn chuỗi `<img src=x ...>thử` dưới dạng chữ. Tiêu đề tab **không** đổi thành `XSS` |
| 12 | Mở DevTools của **trang** (F12), tab Console, gõ `document.getElementById("vietphish-lens-root").shadowRoot` khi overlay đang hiện | In `null` |

Nếu console của service worker in `LỖI: Could not establish connection. Receiving end does not exist.` thì tab chưa có content script. Tải lại extension ở `chrome://extensions`, rồi F5 tab demo và chạy lại.

Toàn bộ các bước trên đã chạy thử với code tham chiếu trong Chrome for Testing 148: tín hiệu đúng như bảng, overlay gắn dưới thẻ `HTML`, `shadowRoot` là `null`, gõ phím sau khi overlay hiện thì ô mật khẩu vẫn rỗng, tiêu đề tab không bị đổi.

## Commit (người làm, agent không chạy)

```bash
git add extension/content.js extension/manifest.json
git commit -m "feat(extension): content script và overlay cảnh báo [A1]"
git pull --rebase
git push
```
