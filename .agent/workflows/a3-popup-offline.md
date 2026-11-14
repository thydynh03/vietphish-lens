---
description: A3 - Popup và chế độ demo offline (extension, TÙY CHỌN)
---

# A3. Popup và chế độ demo offline

**Người làm:** A. **Thời gian dự kiến:** 30 phút cho agent, cộng 10 phút người kiểm. **Phụ thuộc:** A1, A2 và A5 đã xong và đã commit (A5 cũng sửa `background.js`, không chạy cùng lúc). Lịch: 10:00–10:40, theo `docs/TASKS.md`. Server chạy được (local hoặc đã deploy) để sinh `demo-cache.json`.

> **Bước tùy chọn.** Đây là bước bị cắt **đầu tiên** khi thiếu giờ. Luật của đội: đến 09:55 chưa có sản phẩm demo tối thiểu (cả 3 kịch bản chạy với server) thì bỏ hẳn bước này. Overlay đỏ và huy hiệu đã đủ cho video. Không bắt đầu A3 khi A2 chưa nghiệm thu đạt.

## Mục tiêu

1. Popup khi bấm icon extension: hiện tên miền, kết luận, điểm, danh sách lý do, nút "Kiểm tra lại", nút "Báo nhầm", ô tích "Chế độ demo offline".
2. Chế độ demo offline: khi ô tích bật, service worker tra kết quả có sẵn trong `demo-cache.json` theo tên miền, không gọi server. Dùng khi WiFi hỏng lúc demo trước giám khảo.
3. Message `recheck` từ popup để kiểm tra lại tab hiện tại.

## File được sửa

- Tạo `extension/popup.html`
- Tạo `extension/popup.js`
- Tạo `extension/demo-cache.json`
- Sửa `extension/manifest.json`: chỉ thêm `default_popup` vào khóa `action`
- Sửa `extension/background.js`: chỉ thêm 4 chỗ ghi ở mục "Sửa `background.js`". Không sửa dòng nào khác

## Sửa `extension/manifest.json`

Khóa `action` thành đúng như sau, các khóa khác giữ nguyên:

```json
"action": { "default_title": "VietPhish Lens", "default_popup": "popup.html" }
```

## Sửa `extension/background.js`

Chỉ thêm, không đổi tên hay thứ tự những gì A2 đã viết. Chỉ chèn đúng 4 chỗ được liệt kê dưới đây, không viết lại cả file `background.js`.

**Chỗ 1.** Ngay dưới dòng `const loadOfficial = lazyJson("official_domains.json");`, thêm:

```js
const loadDemoCache = lazyJson("demo-cache.json");
```

**Chỗ 2.** Ngay dưới hàm `hostnameHasBrandKeyword`, thêm hàm `async isDemoOffline()`: trong `try`, `const { DEMO_OFFLINE } = await chrome.storage.local.get("DEMO_OFFLINE");` rồi `return Boolean(DEMO_OFFLINE)`. `catch` thì `return false`. Cờ nằm ở `chrome.storage.local` (còn sau khi tắt Chrome), không phải `storage.session`.

**Chỗ 3.** Trong `check`, thay dòng comment `// A3 chèn nhánh DEMO_OFFLINE ở đây` bằng:

```js
// Chế độ demo offline: tra cache theo hostname, không có thì đi tiếp bình thường.
if (await isDemoOffline()) {
  try {
    const cache = await loadDemoCache();
    if (cache && cache[url.hostname]) result = cache[url.hostname];
  } catch (e) {
    console.warn("VietPhish: không đọc được demo-cache", e);
  }
}
```

Tra theo `url.hostname` (không có cổng), ví dụ `vneid-capnhat.cc`. Không tìm thấy thì `result` vẫn là `null`, khối `if (!result)` của A2 chạy tiếp và gọi server như thường. Kết quả từ cache vẫn đi qua lần kiểm lại `stillHere()` và các bước lưu, huy hiệu, gửi `verdict` của A2.

**Chỗ 4.** Cuối file, sau `onRemoved`, ở cấp cao nhất, thêm listener cho popup:

```js
// Tin từ popup. Trả lời đồng bộ nên KHÔNG return true.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "recheck" && typeof msg.tabId === "number") {
    chrome.tabs.get(msg.tabId).then((tab) => check(tab)).catch((e) => console.warn("VietPhish: recheck lỗi", e));
    sendResponse({ ok: true });
  }
});
```

## Đặc tả `extension/popup.html`

HTML tĩnh, `lang="vi"`, `<meta charset="utf-8">`, `<title>VietPhish Lens</title>`. Không có script nội tuyến: Chrome chặn script viết thẳng trong thẻ `<script>` của trang extension.

Thân trang theo đúng thứ tự, đúng `id`:

| Phần tử | Thuộc tính | Nội dung ban đầu |
| --- | --- | --- |
| `h1` | | `VietPhish Lens` |
| `div` | `class="host" id="host"` | rỗng |
| `div` chứa hai `span` | `span class="badge" id="badge"`, `span class="score" id="score"` | `Chưa kiểm tra`, rỗng |
| `div` | `class="note" id="degraded" hidden` | `Chưa có kết quả phân tích hình ảnh.` |
| `div` | `class="note" id="whitelisted" hidden` | `Tên miền chính thức, không gửi dữ liệu lên máy chủ.` |
| `div` | `class="err" id="error" hidden` | rỗng |
| `ul` | `id="reasons"` | rỗng |
| `div class="row"` chứa hai nút | `button id="recheck"`, `button id="report"` | `Kiểm tra lại`, `Báo nhầm` |
| `label` chứa `input type="checkbox" id="demo"` | | ` Chế độ demo offline` |
| `div` | `class="server" id="server"` | rỗng |
| `script` | `src="config.js"` | |
| `script` | `src="popup.js"` | |

Thẻ `config.js` phải đứng **trước** `popup.js`.

CSS trong thẻ `<style>` ở `<head>`:

| Selector | Thuộc tính |
| --- | --- |
| `*` | `box-sizing: border-box` |
| `body` | `width: 340px; margin: 0; padding: 14px; font: 14px/1.45 "Segoe UI", Roboto, Arial, sans-serif; color: #1c2430; background: #fff` |
| `h1` | `font-size: 15px; margin: 0 0 10px; color: #566576; letter-spacing: .02em` |
| `.host` | `font-weight: 600; word-break: break-all; margin-bottom: 8px` |
| `.badge` | `display: inline-block; padding: 4px 12px; border-radius: 999px; color: #fff; font-weight: 700; background: #566576` |
| `.badge.SAFE` | `background: #26734a` |
| `.badge.SUSPICIOUS` | `background: #a8670f` |
| `.badge.DANGER` | `background: #c0322b` |
| `.score` | `margin-left: 8px; color: #566576` |
| `ul` | `margin: 10px 0 0; padding-left: 18px` |
| `li` | `margin-bottom: 6px` |
| `.note` | `margin: 10px 0 0; color: #566576` |
| `.err` | `margin: 10px 0 0; color: #c0322b; word-break: break-word` |
| `.row` | `display: flex; gap: 8px; margin-top: 14px` |
| `button` | `flex: 1; font: inherit; padding: 8px 10px; border-radius: 6px; border: 1px solid #c4ccd6; background: #f4f6f9; cursor: pointer` |
| `button:disabled` | `opacity: .6; cursor: default` |
| `label` | `display: block; margin-top: 12px; cursor: pointer` |
| `.server` | `margin-top: 12px; font-size: 12px; color: #7a8796; word-break: break-all` |

## Đặc tả `extension/popup.js`

Script classic, toàn bộ trong một hàm tự gọi. Chỉ hiển thị bằng `textContent`, **không** dùng `innerHTML`.

Hằng số nhãn:

```js
const LABELS = { SAFE: "An toàn", SUSPICIOUS: "Đáng ngờ", DANGER: "Nguy hiểm", CHECKING: "Đang kiểm tra", NONE: "Chưa kiểm tra" };
```

Hàm phụ `$ = (id) => document.getElementById(id)`.

`showBadge(kind)`: `$("badge").textContent = LABELS[kind] || LABELS.NONE`, và `className = "badge " + (LABELS[kind] ? kind : "")`.

`async init()`, làm đúng thứ tự:

1. `$("server").textContent = "Máy chủ: " + self.VP_CONFIG.API_BASE`.
2. Ô tích demo: trong `try`, đọc `DEMO_OFFLINE` từ `chrome.storage.local`, gán `demo.checked = Boolean(DEMO_OFFLINE)`. Gắn sự kiện `change`: `chrome.storage.local.set({ DEMO_OFFLINE: demo.checked }).catch(() => {})`.
3. `const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });`
4. Nếu có `tab.url`: trong `try`, `u = new URL(tab.url)`, `hostname = u.hostname || u.protocol`, `isWeb = u.protocol === "http:" || u.protocol === "https:"`. Gán `$("host").textContent = hostname`.
5. Đọc kết quả, chỉ khi `tab && isWeb`: `key = "tab:" + tab.id`, `result = (await chrome.storage.session.get(key))[key] || null`. Nếu `result && result.pageUrl && result.pageUrl !== tab.url` thì `result = null`, vì kết quả đó thuộc trang trước của tab.
6. Hiển thị:
   - `!result`: `showBadge("NONE")`.
   - `result.checking`: `showBadge("CHECKING")`.
   - `result.error`: `showBadge("NONE")`, `$("error").textContent = "Lỗi: " + result.error`, bỏ `hidden`.
   - Còn lại: `showBadge(result.verdict)`. `$("score").textContent = "Điểm rủi ro " + (Math.round(Number(result.riskScore)) || 0) + "/100"`. Bỏ `hidden` của `#whitelisted` nếu `result.whitelisted`, của `#degraded` nếu `result.degraded`. Mỗi lý do trong `result.reasons` (kiểm `Array.isArray`) tạo một `li` với `textContent = r && r.text ? r.text : ""`, hiện **tất cả** lý do.
7. Nút `#recheck`, sự kiện `click`: không có `tab` thì `window.close()`. Có thì `chrome.runtime.sendMessage({ type: "recheck", tabId: tab.id }).catch(() => {}).finally(() => window.close())`.
8. Nút `#report`: nếu `!tab || !isWeb` thì `disabled = true`. Sự kiện `click`, trong `try`: đọc mảng `reports` từ `chrome.storage.local` (không phải mảng thì dùng `[]`), `push({ url: tab.url, verdict: result && result.verdict ? result.verdict : null, riskScore: result && typeof result.riskScore === "number" ? result.riskScore : null, at: new Date().toISOString() })`, lưu lại. Thành công thì nút đổi chữ thành `Đã ghi nhận` và `disabled = true`. `catch` thì chữ thành `Lỗi, thử lại`.

Cuối hàm tự gọi: `init().catch((e) => { $("error").textContent = "Lỗi: " + ((e && e.message) || e); $("error").hidden = false; });`

## Sinh `extension/demo-cache.json`

File là một object JSON. Khóa là hostname không có cổng, giá trị là **nguyên văn** response của `POST /analyze` cho trang đó. Bốn khóa: `vietcombank-xacthuc.top`, `vneid-capnhat.cc`, `xacthuc-taikhoan.com`, `tintuc-demo.vn`. Không tự viết tay nội dung. Phải lấy từ response thật của server.

### Cách 1, agent làm: gọi server mock bằng PowerShell

Server phải đang chạy ở chế độ mock: `$env:VISION_MOCK="1"; node server/src/index.js`. Kiểm `Invoke-RestMethod http://127.0.0.1:8787/health` ra `vision : mock`.

Dán khối dưới đây **thẳng vào terminal** PowerShell ở gốc repo. Không lưu thành file `.ps1`, vì PowerShell 5.1 đọc file `.ps1` UTF-8 không BOM sai dấu tiếng Việt. Bốn bộ `signals` dưới đây đúng bằng những gì content script đọc được từ 4 trang demo.

```powershell
$vcb = @{ hasPasswordField = $true; hasOtpField = $false; hasCardField = $false; formActionHost = "collector.example-attacker.xyz" }
$none = @{ hasPasswordField = $false; hasOtpField = $false; hasCardField = $false; formActionHost = $null }
$pages = [ordered]@{
  "vietcombank-xacthuc.top" = @{ title = "Vietcombank - Đăng nhập VCB Digibank"; signals = $vcb }
  "vneid-capnhat.cc"        = @{ title = "VNeID - Cập nhật định danh mức 2 - Nhập mã OTP"; signals = @{ hasPasswordField = $false; hasOtpField = $true; hasCardField = $false; formActionHost = $null } }
  "xacthuc-taikhoan.com"    = @{ title = "Vietcombank - Đăng nhập VCB Digibank"; signals = $vcb }
  "tintuc-demo.vn"          = @{ title = "Vietcombank điều chỉnh lãi suất tiết kiệm - Tin tức demo"; signals = $none }
}
$cache = [ordered]@{}
foreach ($h in $pages.Keys) {
  $body = @{ url = "http://${h}:8080/"; title = $pages[$h].title; signals = $pages[$h].signals; mode = "full" } | ConvertTo-Json -Depth 5
  $cache[$h] = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8787/analyze" -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($body))
}
[IO.File]::WriteAllText((Join-Path $PWD "extension\demo-cache.json"), ($cache | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding $false))
```

Ba chỗ dễ sai trong khối trên:

- `"http://${h}:8080/"` phải có ngoặc nhọn. Viết `$h:8080` thì PowerShell hiểu `$h:` là tên ổ đĩa.
- `-Body` truyền mảng byte UTF-8. Truyền chuỗi thì PowerShell 5.1 gửi sai dấu tiếng Việt trong `title`, trang VNeID mất lý do `URGENCY`.
- Ghi file bằng `UTF8Encoding $false` để không có BOM. `Set-Content -Encoding utf8` của PowerShell 5.1 thêm BOM.

Kiểm file vừa sinh:

```powershell
node -e "const c=JSON.parse(require('fs').readFileSync('extension/demo-cache.json','utf8')); for (const [h,r] of Object.entries(c)) console.log(h, r.verdict, r.riskScore, r.reasons.map(x=>x.code).join(','))"
```

Phải in đúng 4 dòng:

```
vietcombank-xacthuc.top DANGER 100 BRAND_DOMAIN_MISMATCH,ASKS_PASSWORD,BRAND_KEYWORD,SUSPICIOUS_TLD,NO_HTTPS,FORM_OTHER_HOST
vneid-capnhat.cc DANGER 100 BRAND_DOMAIN_MISMATCH,ASKS_OTP,VNEID_OFFLINE,URGENCY,BRAND_KEYWORD,SUSPICIOUS_TLD,NO_HTTPS
xacthuc-taikhoan.com DANGER 85 BRAND_DOMAIN_MISMATCH,ASKS_PASSWORD,NO_HTTPS,FORM_OTHER_HOST
tintuc-demo.vn SAFE 19 BRAND_DOMAIN_MISMATCH,NO_HTTPS
```

Dòng VNeID thiếu `URGENCY` nghĩa là tiêu đề bị hỏng dấu. Chạy lại khối trên trong `pwsh` (PowerShell 7).

### Cách 2, người làm: lấy từ chính extension khi server dùng Gemini thật

Cách 1 không gửi ảnh, nên chỉ đúng với server mock. Muốn cache chứa kết quả Gemini thật thì lấy từ storage của extension:

1. Tắt chế độ demo offline. Mở 4 trang demo ở **4 tab riêng**, mỗi tab chờ tới khi có kết quả. Không mở chung một tab, vì tab chuyển trang thì kết quả cũ bị xóa.
2. Mở console của service worker, dán:

```js
(async () => {
  const all = await chrome.storage.session.get(null);
  const cache = {};
  for (const v of Object.values(all)) {
    if (!v || !v.pageUrl || !v.verdict || v.whitelisted) continue;
    const { pageUrl, ...response } = v;
    cache[new URL(pageUrl).hostname] = response;
  }
  console.log(Object.keys(cache).length + " trang");
  console.log(JSON.stringify(cache, null, 2));
})();
```

3. Console phải in `4 trang`. Chuột phải vào khối JSON in ra, chọn **Copy string contents**, dán đè vào `extension/demo-cache.json`, lưu UTF-8.

Trường `pageUrl` là trường nội bộ của extension nên đoạn trên bỏ nó đi.

## Bẫy đã biết

| Bẫy | Triệu chứng nhìn thấy trong Chrome | Cách tránh |
| --- | --- | --- |
| Popup đọc `tab:<id>` mà không so `pageUrl` | Trang tin mở trong cùng tab với trang giả, bấm icon thấy "Nguy hiểm" | Bỏ kết quả khi `pageUrl` khác `tab.url` |
| Script nội tuyến trong `popup.html` | Popup trắng, console popup báo `Refused to execute inline script` | Chỉ dùng `<script src=...>` |
| Nạp `popup.js` trước `config.js` | Popup báo `Lỗi: Cannot read properties of undefined (reading 'API_BASE')` | `config.js` đứng trước |
| Dùng `innerHTML` cho lý do | Lý do chứa thẻ HTML chạy được trong popup | `textContent` |
| `return true` trong listener `recheck` mà vẫn gọi `sendResponse` đồng bộ | Không lỗi rõ ràng, nhưng sai hợp đồng message | Không `return true` |
| Lưu cờ `DEMO_OFFLINE` vào `storage.session` | Tắt mở Chrome xong cờ mất, demo offline không chạy | `chrome.storage.local` |
| Khóa cache có cổng, ví dụ `vneid-capnhat.cc:8080` | Bật offline mà vẫn gọi server, tắt WiFi thì huy hiệu trống | Khóa là `url.hostname`, không có cổng |
| Viết tay `demo-cache.json` | Lý do lệch câu chữ so với server, giám khảo thấy hai kiểu chữ | Sinh từ response thật theo Cách 1 hoặc Cách 2 |
| File cache có BOM | `Không đọc được demo-cache` hoặc lỗi `Unexpected token` trong console service worker | Ghi bằng `UTF8Encoding $false` |
| Nhánh offline đặt trước kiểm whitelist hoặc sau `callAnalyze` | Trang chính thức bị tra cache, hoặc vẫn gọi server khi offline | Thay đúng dòng comment `// A3 chèn...` |
| Quên `.catch` khi popup gửi `recheck` | Đóng popup lúc service worker đang ngủ thì console popup có lỗi đỏ | `.catch(() => {}).finally(() => window.close())` |

## Tự kiểm trước khi báo xong

Agent tự chạy các lệnh sau ở gốc repo, dán output vào câu trả lời cuối. Các lệnh dưới đây chạy trong PowerShell 7 (`pwsh`). Nếu shell của agent là bash thì dùng `grep -nE` tương đương với `Select-String`, còn khối sinh cache ở trên phải chạy bằng `pwsh`.

```powershell
node --check extension/popup.js
node --check extension/background.js
node -e "const m=JSON.parse(require('fs').readFileSync('extension/manifest.json','utf8')); console.log(m.action.default_popup)"
node -e "const c=JSON.parse(require('fs').readFileSync('extension/demo-cache.json','utf8')); console.log(Object.keys(c).join(','))"
Select-String -Path extension\*.js -Pattern '^\s*(import|export)\b'
Select-String -Path extension\popup.js -Pattern 'innerHTML'
Select-String -Path extension\popup.html -Pattern '<script'
(Select-String -Path extension\background.js -Pattern 'stillHere\(\)').Count   # nhánh demo offline không thêm lần gọi stillHere() nào
Select-String -Path extension\background.js -Pattern 'addListener'
```

| Lệnh | Phải ra |
| --- | --- |
| 1, 2 | Không in gì |
| 3 | `popup.html` |
| 4 | `vietcombank-xacthuc.top,vneid-capnhat.cc,xacthuc-taikhoan.com,tintuc-demo.vn` |
| 5, 6 | Không in gì |
| 7 | Đúng 2 dòng, `config.js` trước `popup.js` |
| 8 | Vẫn là `4`, như sau A2 |
| 9 | Đúng 3 dòng: `onUpdated`, `onRemoved`, `onMessage` |

Soát bằng mắt:

- [ ] `background.js` chỉ thêm đúng 4 chỗ, không đổi dòng nào khác của A2
- [ ] `isDemoOffline` đọc `chrome.storage.local`
- [ ] Popup bỏ kết quả khi `pageUrl !== tab.url`
- [ ] Mọi chữ hiển thị trong popup dùng `textContent`
- [ ] `demo-cache.json` sinh từ server, kiểm bằng lệnh `node -e` ra đúng 4 dòng ở trên

## Nghiệm thu

Phần này do người làm bằng tay. Chuẩn bị server mock, trang demo và Chrome demo giống bước A2. Sau khi sửa code: tải lại extension ở `chrome://extensions` **rồi F5 các tab demo**.

| Bước | Làm | Phải thấy |
| --- | --- | --- |
| 1 | Mở `http://vietcombank-xacthuc.top:8080/`, chờ phủ đỏ, bấm icon VietPhish Lens trên thanh công cụ | Popup rộng 340 px. Dòng `vietcombank-xacthuc.top` in đậm. Viên thuốc đỏ `Nguy hiểm` và chữ xám `Điểm rủi ro 100/100`. Danh sách đủ **6** lý do. Hai nút `Kiểm tra lại`, `Báo nhầm`. Ô tích `Chế độ demo offline` chưa tích. Dòng nhỏ `Máy chủ: http://localhost:8787` |
| 2 | Trong cùng tab, mở `http://tintuc-demo.vn:8080/`, bấm icon | Viên thuốc xanh `An toàn`, `Điểm rủi ro 19/100`. **Không** còn chữ "Nguy hiểm" của trang trước |
| 3 | Mở `chrome://extensions` trong tab đó, bấm icon | Dòng tên là `extensions`, viên thuốc xám `Chưa kiểm tra`, nút `Báo nhầm` bị mờ |
| 4 | Về trang `vneid-capnhat.cc`, bấm icon, bấm `Kiểm tra lại` | Popup đóng. Log server có thêm một dòng `vneid-capnhat.cc`, cuối dòng có `cache` |
| 5 | Bấm icon, bấm `Báo nhầm` | Nút đổi thành `Đã ghi nhận` và bị mờ |
| 6 | Bấm icon, tích `Chế độ demo offline`. Bấm Ctrl+C ở cửa sổ server để tắt server. F5 trang `vneid-capnhat.cc` | Vẫn phủ đỏ với 4 lý do VNeID, huy hiệu `✕`. Cửa sổ server đã tắt nên không có log |
| 7 | Vẫn bật offline, mở `http://tintuc-demo.vn:8080/` | Huy hiệu `✓`, không overlay |
| 8 | Bỏ tích offline, F5 `vietcombank-xacthuc.top` (server vẫn tắt) | Có A5: dải vàng "Không kết nối được máy chủ kiểm tra…", huy hiệu `!`. Bấm icon thấy `Đáng ngờ`, `Điểm rủi ro 50/100` và lý do chế độ cơ bản. Mở `xacthuc-taikhoan.com` (không chứa tên ngân hàng) rồi bấm icon thì thấy `Chưa kiểm tra` và dòng đỏ `Lỗi: Failed to fetch` |
| 9 | Bật lại server, F5 | Phủ đỏ trở lại |

Bước 1, 2, 4, 6, 7, 8 đã chạy thử với bản tham chiếu trong Chrome for Testing 148: popup mở bằng `chrome.action.openPopup()` hiện đúng 6 lý do; `recheck` trả `{ ok: true }` và server nhận thêm một request; offline với server tắt vẫn ra DANGER cho VNeID và SAFE cho trang tin; server tắt và không offline thì lưu `error: "Failed to fetch"` sau khoảng 3 giây.

## Commit (người làm, agent không chạy)

```bash
git add extension/popup.html extension/popup.js extension/demo-cache.json extension/manifest.json extension/background.js
git commit -m "feat(extension): popup và chế độ demo offline [A3]"
git pull --rebase
git push
```
