---
description: A2 - Service worker kiểm tra trang, chụp ảnh, gọi server, huy hiệu (extension)
---

# A2. Service worker và luồng kiểm tra

**Người làm:** A. **Thời gian dự kiến:** 45 phút cho agent, cộng 10 phút người tự kiểm. **Phụ thuộc:** A1 đã xong. Phần nghiệm thu cần server chạy được `/analyze` (bước B5). Viết code trước, khi B push B5 (khoảng 09:25) thì A `git pull` rồi tự chạy server mock trên máy mình như mục "Nghiệm thu".

## Mục tiêu

Viết service worker của extension. Mỗi khi tab đang hiển thị tải xong một trang web, service worker:

1. Kiểm whitelist cục bộ. Trang chính thức thì gắn huy hiệu xanh và dừng, không gửi gì lên server.
2. Hỏi content script các tín hiệu của trang.
3. Chỉ khi trang có ô nhập nhạy cảm hoặc tên miền chứa tên thương hiệu thì chụp màn hình và thu nhỏ ảnh.
4. Gọi `POST /analyze`, lưu kết quả theo tab, đổi huy hiệu, gửi kết luận cho content script vẽ cảnh báo.

Đây là file nhiều bẫy nhất của dự án. Phần lớn bẫy chỉ lộ ra trong trình duyệt thật, khi người dùng đổi trang nhanh. Làm **đúng thứ tự** từng bước trong đặc tả, kể cả những lần kiểm lại URL trông có vẻ thừa.

## File được sửa

- Tạo `extension/config.js`
- Viết lại toàn bộ `extension/background.js` (xóa dòng `console.log("VietPhish Lens: hello")`)

Không sửa `manifest.json`, `content.js`. Không tạo popup ở bước này.

## Đặc tả `extension/config.js`

Một câu lệnh duy nhất, gán vào `self` để cả service worker lẫn popup (bước A3) đọc được:

```js
// Cấu hình dùng chung cho service worker (importScripts) và popup (thẻ script).
self.VP_CONFIG = {
  API_BASE: "http://localhost:8787", // đổi thành URL Cloud Run sau khi deploy
  REQUEST_TIMEOUT_MS: 10000,
  SCREENSHOT_MAX_WIDTH: 1024,
  SCREENSHOT_QUALITY: 0.6,
};
```

`API_BASE` không có dấu `/` ở cuối.

## Đặc tả `extension/background.js`

Script classic, không `import`, không `export`. Trong service worker không có `document`, `window`, `Image`, `<canvas>`, `localStorage`.

### Phần đầu file

1. **Dòng code đầu tiên** của file: `importScripts("config.js");`
2. `const CFG = self.VP_CONFIG;`
3. Hằng số huy hiệu:

```js
const BADGES = {
  SAFE: { text: "✓", color: "#26734a" },
  SUSPICIOUS: { text: "!", color: "#a8670f" },
  DANGER: { text: "✕", color: "#c0322b" },
  CHECKING: { text: "…", color: "#566576" },
};
```

4. `const inFlight = new Map();` Map từ `tabId` sang URL đang kiểm tra. Dùng `Map`, không dùng `Set`.

### Hàm tiện ích nhỏ

| Hàm | Làm gì |
| --- | --- |
| `tabKey(tabId)` | Trả `"tab:" + tabId` |
| `async setBadge(tabId, kind)` | Toàn bộ thân trong `try`, `catch` bỏ qua vì tab có thể đã đóng. Nếu `kind` rỗng: `await chrome.action.setBadgeText({ tabId, text: "" })` rồi `return`. Ngược lại `b = BADGES[kind]`, không có thì `return`. Có thì `await chrome.action.setBadgeBackgroundColor({ tabId, color: b.color })` rồi `await chrome.action.setBadgeText({ tabId, text: b.text })` |
| `async saveTabResult(tabId, value)` | Trong `try`: `await chrome.storage.session.set({ [tabKey(tabId)]: value })`. `catch` thì `console.warn("VietPhish: không lưu được kết quả tab", e)` |
| `sendToTab(tabId, message)` | Trả `chrome.tabs.sendMessage(tabId, message).catch(() => undefined)`. Không có `async`, không `await` bên trong |

### Nạp file JSON đóng gói trong extension

`lazyJson(fileName)` trả về một hàm `load()`. Lần gọi đầu, `load()` tạo promise `fetch(chrome.runtime.getURL(fileName))`, nếu `!r.ok` thì ném `new Error("Không đọc được " + fileName)`, ngược lại `r.json()`. Promise được giữ trong biến đóng gói để lần sau dùng lại. Nếu lỗi thì gán lại biến về `null` rồi ném tiếp, để lần sau thử lại. Code mẫu:

```js
function lazyJson(fileName) {
  let cached = null;
  return function load() {
    if (!cached) {
      cached = fetch(chrome.runtime.getURL(fileName))
        .then((r) => {
          if (!r.ok) throw new Error("Không đọc được " + fileName);
          return r.json();
        })
        .catch((e) => {
          cached = null;
          throw e;
        });
    }
    return cached;
  };
}
```

```js
const loadOfficial = lazyJson("official_domains.json");
```

### Whitelist và từ khóa thương hiệu

File `official_domains.json` có `trustedSuffixes` (ví dụ `"gov.vn"`) và `brands`, mỗi brand có `domains` và `keywords`.

- `hostMatches(hostname, d)`: trả `hostname === d || hostname.endsWith("." + d)`. Phải có dấu chấm trước `d`, nếu không thì `fakevietcombank.com.vn` khớp nhầm.
- `isWhitelisted(official, hostname)`: `true` nếu `hostMatches` với một phần tử của `official.trustedSuffixes || []`, hoặc với một domain trong `b.domains || []` của một brand bất kỳ trong `official.brands || []`.
- `hostnameHasBrandKeyword(official, hostname)`: `true` nếu có brand có keyword `k` mà `hostname.includes(k)`.

### Chụp và thu nhỏ ảnh

**`bytesToBase64(bytes)`** đổi `Uint8Array` sang base64 theo từng khối `0x8000` byte. Gọi `String.fromCharCode(...bytes)` cho cả ảnh thì tràn stack.

```js
function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}
```

**`async shrinkScreenshot(dataUrl)`** thu nhỏ về rộng tối đa `CFG.SCREENSHOT_MAX_WIDTH`, nén JPEG chất lượng `CFG.SCREENSHOT_QUALITY`. Service worker không có `Image` hay `<canvas>`, nên dùng `createImageBitmap` và `OffscreenCanvas`:

```js
const blob = await (await fetch(dataUrl)).blob();
const bitmap = await createImageBitmap(blob);
try {
  const scale = Math.min(1, CFG.SCREENSHOT_MAX_WIDTH / bitmap.width);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
  const out = await canvas.convertToBlob({ type: "image/jpeg", quality: CFG.SCREENSHOT_QUALITY });
  return "data:image/jpeg;base64," + bytesToBase64(new Uint8Array(await out.arrayBuffer()));
} finally { if (bitmap.close) bitmap.close(); }
```

**`async captureScreenshot(tab)`** trả data URL, hoặc `null` khi chụp lỗi.

1. Trong `try`, chụp có giới hạn 3 giây, vì `captureVisibleTab` có thể treo khi cửa sổ bị thu nhỏ:

```js
raw = await Promise.race([
  chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 70 }),
  new Promise((_, reject) => setTimeout(() => reject(new Error("Chụp màn hình quá 3 giây")), 3000)),
]);
```

2. `catch` thì `console.warn("VietPhish: không chụp được màn hình", e)` và `return null`.
3. Trong `try` thứ hai: `return await shrinkScreenshot(raw)`. `catch` thì `console.warn("VietPhish: không thu nhỏ được ảnh, dùng ảnh gốc", e)` và `return raw`. Thu nhỏ lỗi thì dùng ảnh gốc, không bỏ ảnh.

### Gọi server: `async callAnalyze(payload)`

1. `ctrl = new AbortController()`, `timer = setTimeout(() => ctrl.abort(), CFG.REQUEST_TIMEOUT_MS)`.
2. Trong `try`: `fetch(CFG.API_BASE + "/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: ctrl.signal })`.
3. `!res.ok` thì ném `new Error("Server trả HTTP " + res.status)`.
4. `data = await res.json()`. Nếu `!data || typeof data.verdict !== "string"` thì ném `new Error("Phản hồi server sai định dạng")`. Ngược lại `return data`.
5. `catch (e)`: nếu `e && e.name === "AbortError"` thì ném `new Error("Server không phản hồi trong " + CFG.REQUEST_TIMEOUT_MS / 1000 + " giây")`. Lỗi khác ném lại nguyên `e`.
6. `finally`: `clearTimeout(timer)`.

### Luồng chính: `async check(tab)`

Vấn đề cốt lõi: hàm này có nhiều `await`. Trong lúc chờ, người dùng có thể đã chuyển tab sang trang khác. `chrome.tabs.sendMessage` gửi theo **tab**, không theo trang, nên có thể nhận tín hiệu của trang mới. `captureVisibleTab` chụp **tab đang hiển thị** của cửa sổ, không theo `tab.id`, nên có thể chụp nhầm trang khác. Vì vậy sau mỗi `await` quan trọng phải kiểm lại tab còn đúng URL ban đầu không. Sai URL thì bỏ ngang, không gửi gì, không ghi gì.

Làm đúng thứ tự:

**Bước 1.** Nếu `!tab || !tab.url || typeof tab.id !== "number"` thì `return`.

**Bước 2.** `url = new URL(tab.url)` trong `try`. Lỗi thì `return`.

**Bước 3.** Nếu `url.protocol` không phải `"http:"` và không phải `"https:"` (ví dụ `chrome://extensions`):
- `await setBadge(tab.id, null)`
- Trong `try` riêng: `await chrome.storage.session.remove(tabKey(tab.id))`, `catch` bỏ qua
- `return`

**Bước 4.** Nếu `inFlight.get(tab.id) === tab.url` thì `return`. Cùng tab, cùng URL đang kiểm dở thì không chạy lần thứ hai.

**Bước 5.** `const myUrl = tab.url;` rồi `inFlight.set(tab.id, myUrl)`.

**Bước 6.** Định nghĩa hàm kiểm lại, đặt **bên trong** `check`:

```js
const stillHere = async () => {
  const now = await chrome.tabs.get(tab.id).catch(() => null);
  return Boolean(now && now.url === myUrl);
};
```

**Bước 7.** Mở `try { ... } catch (e) { ... } finally { ... }`. Toàn bộ các bước 7a đến 7h nằm trong `try`.

- **7a.** `const official = await loadOfficial();`
- **7b. Whitelist.** Nếu `isWhitelisted(official, url.hostname)`:
  - `await setBadge(tab.id, "SAFE")`
  - `await saveTabResult(tab.id, { verdict: "SAFE", riskScore: 0, whitelisted: true, pageUrl: myUrl })`
  - `await sendToTab(tab.id, { type: "clear" })`
  - `return`. Khối `finally` vẫn chạy nên `inFlight` vẫn được gỡ.
- **7c.** `await setBadge(tab.id, "CHECKING")` rồi `await saveTabResult(tab.id, { checking: true, pageUrl: myUrl })`.
- **7d.** `let result = null;` rồi viết một dòng comment `// A3 chèn nhánh DEMO_OFFLINE ở đây`.
- **7e.** Mở khối `if (!result) { ... }`. Các dòng 7e1 đến 7e4 nằm trong khối này.
  - **7e1.** `const signals = (await sendToTab(tab.id, { type: "getSignals" })) || {};`
  - **7e2.** `if (!(await stillHere())) return;` **(lần kiểm lại thứ 1)**
  - **7e3.** Chụp ảnh có điều kiện:
    - `const sensitive = signals.hasPasswordField || signals.hasOtpField || signals.hasCardField;`
    - `let screenshot;` (để `undefined`)
    - Nếu `sensitive || hostnameHasBrandKeyword(official, url.hostname)`:
      - `const fresh = await chrome.tabs.get(tab.id).catch(() => null);`
      - Nếu `fresh && fresh.active && fresh.url === myUrl` thì `screenshot = (await captureScreenshot(fresh)) || undefined;`
      - `if (!(await stillHere())) return;` **(lần kiểm lại thứ 2, vẫn nằm trong `if` chụp ảnh)**. Chụp mất vài trăm mili giây, tab có thể đã đổi trang trong lúc chụp.
  - **7e4.** Gọi server:

```js
result = await callAnalyze({ url: tab.url, title: tab.title || "", screenshot, signals, mode: "full" });
```

- **7f.** Sau khi đóng khối `if (!result)`: `if (!(await stillHere())) return;` **(lần kiểm lại thứ 3)**. Bỏ kết quả, **không** xóa huy hiệu, vì huy hiệu lúc này thuộc lượt kiểm tra của trang mới.
- **7g.** `await setBadge(tab.id, BADGES[result.verdict] ? result.verdict : null)` rồi `await saveTabResult(tab.id, { ...result, pageUrl: myUrl })`.
- **7h.** Nếu `result.verdict !== "SAFE"` thì `await sendToTab(tab.id, { type: "verdict", result })`. Ngược lại `await sendToTab(tab.id, { type: "clear" })` để gỡ overlay cũ nếu có.

**Bước 8. `catch (e)`:**
- `console.warn("VietPhish: lỗi khi kiểm tra", e)`
- Nếu `await stillHere()` **(lần kiểm lại thứ 4)**: `await setBadge(tab.id, null)` rồi `await saveTabResult(tab.id, { error: String((e && e.message) || e), pageUrl: myUrl })`.

**Bước 9. `finally`:** `if (inFlight.get(tab.id) === myUrl) inFlight.delete(tab.id);` Chỉ xóa khi mục đó còn là của lượt này. Tab đã sang trang khác thì lượt mới đã ghi đè URL mới, không được xóa nhầm.

Trường `pageUrl` lưu kèm mọi kết quả, để popup ở bước A3 nhận ra kết quả của trang cũ.

### Listener, đăng ký đồng bộ ở cấp cao nhất của file

Đặt ở cuối file, không nằm trong hàm nào, không đứng sau `await` nào. Service worker bị Chrome tắt khi rảnh. Sự kiện đánh thức worker chỉ tới được listener đã đăng ký ngay lúc file chạy.

**`chrome.tabs.onUpdated.addListener((tabId, info, tab) => { ... })`**

1. Nếu `info.status === "loading"`: `chrome.storage.session.remove(tabKey(tabId)).catch(() => {})` rồi `return`. Tab bắt đầu tải trang mới thì xóa kết quả của trang cũ.
2. Nếu `info.status === "complete" && tab.active && tab.url`: chờ 300 ms để trang vẽ xong rồi lấy lại tab mới nhất, không dùng object `tab` cũ:

```js
setTimeout(() => {
  chrome.tabs.get(tabId)
    .then((fresh) => { if (fresh && fresh.active && fresh.url === tab.url) return check(fresh); })
    .catch(() => {});
}, 300);
```

**`chrome.tabs.onRemoved.addListener((tabId) => { ... })`**: `inFlight.delete(tabId)` và `chrome.storage.session.remove(tabKey(tabId)).catch(() => {})`.

Bước này **không** có `chrome.runtime.onMessage`. Message `recheck` thuộc bước A3.

### Lưu kết quả ở đâu

Kết quả theo tab lưu ở `chrome.storage.session`, khóa `"tab:" + tabId`. Không lưu vào biến toàn cục, vì Chrome tắt service worker sau khoảng 30 giây rảnh và biến mất theo. Biến `inFlight` là ngoại lệ: nó chỉ chống chạy trùng, mất cũng không sao.

| Trường hợp | Giá trị lưu |
| --- | --- |
| Whitelist | `{ verdict: "SAFE", riskScore: 0, whitelisted: true, pageUrl }` |
| Đang kiểm | `{ checking: true, pageUrl }` |
| Có kết quả | toàn bộ response của server, thêm `pageUrl` |
| Lỗi | `{ error: "<thông điệp>", pageUrl }` |

## Bẫy đã biết

| Bẫy | Triệu chứng nhìn thấy trong Chrome | Cách tránh |
| --- | --- | --- |
| Thiếu lần kiểm lại sau `getSignals` | Đổi trang nhanh thì log server có dòng URL trang giả mà điểm thấp, ví dụ `[SAFE 19] http://xacthuc-taikhoan.com:8080/`. Server còn cache kết quả sai đó 10 phút | Gọi `stillHere()` ngay sau `sendToTab(... getSignals)` |
| Chụp màn hình không kiểm `active` và URL | Ảnh của tab khác bị gửi lên server (lộ dữ liệu riêng tư) | Lấy lại tab bằng `chrome.tabs.get`, chỉ chụp khi `active` và đúng `myUrl`, kiểm lại `stillHere()` sau khi chụp |
| `inFlight` là `Set` theo tabId | Đang kiểm trang giả mà chuyển sang trang tin cùng tab thì trang tin bị bỏ qua, huy hiệu kẹt ở `…` | `Map` tabId sang URL, chỉ bỏ qua khi trùng URL |
| Gỡ `inFlight` ngoài `finally` | Nhánh whitelist hoặc nhánh lỗi trả sớm làm tab đó không bao giờ được kiểm lại | Gỡ trong `finally`, có so URL |
| `String.fromCharCode(...bytes)` cho cả ảnh | Console service worker báo `RangeError: Maximum call stack size exceeded`, log server ghi `không ảnh` cho trang giả | Ghép theo khối `0x8000` |
| Dùng `document`, `Image`, `canvas` | `ReferenceError: document is not defined` trong console service worker | `createImageBitmap` và `OffscreenCanvas` |
| Thu nhỏ lỗi thì bỏ ảnh | Trang giả không có tên thương hiệu trong tên miền (`xacthuc-taikhoan.com`) ra SAFE | Thu nhỏ lỗi thì trả ảnh gốc |
| Không giới hạn thời gian `captureVisibleTab` | Huy hiệu kẹt ở `…` mãi, console từng có `image readback failed` | `Promise.race` với 3 giây |
| Chụp màn hình mọi trang | Log server có `(ảnh ...KB)` cho `tintuc-demo.vn` | Chỉ chụp khi có ô nhạy cảm hoặc tên miền chứa keyword |
| `sendToTab` thiếu `.catch` | Console báo `Uncaught (in promise) Error: Could not establish connection. Receiving end does not exist.` ở tab mở trước khi cài extension | `.catch(() => undefined)` trong `sendToTab` |
| Lưu kết quả vào biến toàn cục | Để yên 30 giây rồi đọc lại thì không còn kết quả | `chrome.storage.session` |
| Đăng ký listener sau `await` hoặc trong hàm | Thỉnh thoảng mở trang mà không có gì xảy ra, huy hiệu trống | Mọi `addListener` ở cấp cao nhất của file |
| `importScripts` không ở dòng đầu, hoặc dùng `"type": "module"` | `CFG` là `undefined`, lỗi `Cannot read properties of undefined (reading 'API_BASE')` | `importScripts("config.js");` là dòng code đầu tiên. Không sửa manifest |
| Dùng object `tab` cũ sau `setTimeout` | Tiêu đề trang gửi lên server rỗng hoặc của trang trước | Gọi lại `chrome.tabs.get(tabId)` sau 300 ms |
| Kết quả SAFE mà không gửi `clear` | Bấm kiểm tra lại ra SAFE nhưng overlay đỏ cũ vẫn còn | Nhánh SAFE gửi `{ type: "clear" }` |
| Không xóa khóa khi `status === "loading"` | Trang tin mở trong cùng tab với trang giả vẫn còn kết quả "Nguy hiểm" cũ trong storage | Xóa khóa ở nhánh `loading` |
| Gửi `url.href` thay cho `tab.url` | Không đổi gì thấy được, nhưng lệch khóa cache của server so với bản chuẩn | Gửi đúng `tab.url` |

## Tự kiểm trước khi báo xong

Agent tự chạy các lệnh sau ở gốc repo, dán output vào câu trả lời cuối. Các lệnh dưới đây chạy trong PowerShell 7 (`pwsh`). Nếu shell của agent là bash thì dùng `grep -nE` tương đương với `Select-String`.

```powershell
node --check extension/config.js
node --check extension/background.js
Get-Content extension/background.js -TotalCount 3
Select-String -Path extension\*.js -Pattern '^\s*(import|export)\b'
Select-String -Path extension\background.js -Pattern 'document\.|new Image|localStorage|\.\.\.bytes'
(Select-String -Path extension\background.js -Pattern 'stillHere\(\)').Count
Select-String -Path extension\background.js -Pattern 'addListener'
```

Kết quả mong đợi:

| Lệnh | Phải ra |
| --- | --- |
| 1, 2 | Không in gì |
| 3 | Dòng code đầu tiên là `importScripts("config.js");` (cho phép một dòng comment đứng trước) |
| 4, 5 | Không in gì |
| 6 | `4` (sau `getSignals`, sau khi chụp, trước khi lưu kết quả, trong `catch`) |
| 7 | Đúng 2 dòng: `chrome.tabs.onUpdated.addListener` và `chrome.tabs.onRemoved.addListener`, cả hai không thụt lề |

Root `package.json` có `"type": "module"`, nên `node --check` đọc file như ES module. Hai file này không có `import` nên kiểm cú pháp vẫn đúng. `node --check` không phát hiện `import`, vì vậy cần lệnh 4.

Soát bằng mắt, đánh dấu từng dòng:

- [ ] `inFlight` là `new Map()`, được gỡ trong `finally` có so `=== myUrl`
- [ ] Nhánh whitelist nằm trong `try` và trước mọi `fetch` tới server
- [ ] Chỉ chụp ảnh khi `sensitive || hostnameHasBrandKeyword(...)`, và khi `fresh.active && fresh.url === myUrl`
- [ ] `captureScreenshot` có `Promise.race` 3 giây, thu nhỏ lỗi thì trả ảnh gốc
- [ ] `bytesToBase64` ghép theo khối `0x8000`
- [ ] `callAnalyze` có `AbortController`, `clearTimeout` trong `finally`
- [ ] Payload gửi lên có đủ `url`, `title`, `screenshot`, `signals`, `mode: "full"`
- [ ] Mọi kết quả lưu có `pageUrl: myUrl`
- [ ] Nhánh SAFE gửi `clear`, nhánh khác gửi `verdict`
- [ ] Có dòng comment `// A3 chèn nhánh DEMO_OFFLINE ở đây` ngay sau `let result = null;`

## Nghiệm thu

Phần này do người làm bằng tay trong Chrome.

### Chuẩn bị

Ba cửa sổ PowerShell ở gốc repo, để nguyên cả ba.

```powershell
# Cửa sổ 1: server của B, chế độ mock (đoán thương hiệu từ tiêu đề, không gọi Gemini)
$env:VISION_MOCK="1"; node server/src/index.js
```

```powershell
# Cửa sổ 2: trang demo
node demo-sites/serve.js
```

```powershell
# Cửa sổ 3: kiểm server rồi mở Chrome demo
Invoke-RestMethod http://127.0.0.1:8787/health
pwsh -File scripts\chrome-demo.ps1
```

Script dùng profile riêng `%TEMP%\vietphish-demo-profile`, mở sẵn `chrome://extensions`, nhận `-ChromePath "<đường dẫn chrome.exe>"` khi Chrome cài ở chỗ lạ. Máy không có pwsh 7 thì gõ tay một dòng, cùng tên profile:

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="$env:TEMP\vietphish-demo-profile" --host-resolver-rules="MAP vietcombank-xacthuc.top 127.0.0.1, MAP vneid-capnhat.cc 127.0.0.1, MAP xacthuc-taikhoan.com 127.0.0.1, MAP tintuc-demo.vn 127.0.0.1" chrome://extensions
```

`/health` phải trả `ok : True` và `vision : mock`.

Trong `chrome://extensions`: bật Developer mode, Load unpacked thư mục `extension`, hoặc bấm nút tải lại nếu đã nạp. Bấm link **service worker** để mở console của nó. Chờ khoảng 3 giây sau khi nạp rồi mới mở trang đầu tiên.

Mở từng URL dưới đây **trong cùng một tab**, gõ vào thanh địa chỉ rồi Enter. Tab mở từ trước khi tải lại extension thì phải F5.

### Kết quả mong đợi

| Trang | Huy hiệu trên icon extension | Trên trang | Dòng log ở cửa sổ server |
| --- | --- | --- | --- |
| `http://vietcombank-xacthuc.top:8080/` | `✕` nền đỏ | Phủ đỏ trong khoảng 1 giây. `Điểm rủi ro 100/100`. 4 lý do: trông giống Vietcombank nhưng địa chỉ không chính thức; yêu cầu mật khẩu; tên miền chứa tên Vietcombank; đuôi .top. Nút `Về trang chính thức Vietcombank` | `[DANGER 100] http://vietcombank-xacthuc.top:8080/ (ảnh 25KB) wl=false sb=skipped h=60 v=vietcombank 3ms` |
| `http://vneid-capnhat.cc:8080/` | `✕` nền đỏ | Phủ đỏ, `Điểm rủi ro 100/100`. 4 lý do theo thứ tự: trông giống VNeID; yêu cầu nhập mã OTP; VNeID chỉ xác thực qua ứng dụng chính thức; lời lẽ hối thúc. Nút `Về trang chính thức VNeID` | `[DANGER 100] http://vneid-capnhat.cc:8080/ (ảnh 29KB) wl=false sb=skipped h=50 v=vneid 0ms` |
| `http://xacthuc-taikhoan.com:8080/` | `✕` nền đỏ | Phủ đỏ, `Điểm rủi ro 85/100`. Lý do đầu: trông giống Vietcombank nhưng địa chỉ xacthuc-taikhoan.com không phải tên miền chính thức | `[DANGER 85] http://xacthuc-taikhoan.com:8080/ (ảnh 25KB) wl=false sb=skipped h=20 v=vietcombank 0ms` |
| `http://tintuc-demo.vn:8080/` | `✓` nền xanh | Không có overlay, không có banner | `[SAFE 19] http://tintuc-demo.vn:8080/ (không ảnh) wl=false sb=skipped h=10 v=vietcombank 0ms` |
| `https://vietcombank.com.vn/` (cần Internet) | `✓` nền xanh | Không có gì | **Không** có dòng log nào. Trang whitelist không gửi lên server |

Cách đọc log: số KB của ảnh thay đổi theo kích thước cửa sổ, thường vài chục KB. Điều bắt buộc là 3 trang giả có `(ảnh ...KB)`, còn trang tin có `(không ảnh)`. Số mili giây cuối dòng không quan trọng. Mở lại một trang lần thứ hai thì cuối dòng có thêm chữ `cache`.

Trong lúc trang đang kiểm, huy hiệu là `…` nền xám, rất ngắn.

### Kiểm thêm

1. **Dữ liệu đã lưu.** Ở trang `vietcombank-xacthuc.top`, gõ vào console service worker: `chrome.storage.session.get(null)`. Phải thấy một khóa `tab:<số>` có `verdict: "DANGER"`, `riskScore: 100` và `pageUrl: "http://vietcombank-xacthuc.top:8080/"`.
2. **Đổi trang nhanh.** Mở `http://xacthuc-taikhoan.com:8080/?a=1`, ngay khi trang vừa hiện (chưa kịp phủ đỏ) thì gõ `http://tintuc-demo.vn:8080/` rồi Enter. Kết quả cuối: huy hiệu `✓`, không overlay. Log server **không được** có dòng nào bắt đầu bằng `[SAFE` mà chứa `xacthuc-taikhoan.com`. Mọi dòng của `xacthuc-taikhoan.com` phải là `[DANGER 85]`.
3. **Server tắt.** Bấm Ctrl+C ở cửa sổ 1, F5 trang `vietcombank-xacthuc.top`. Sau khoảng 3 giây huy hiệu trở về trống. `chrome.storage.session.get(null)` cho `error: "Failed to fetch"`. Bật lại server rồi F5 thì trang lại phủ đỏ.
4. **Console service worker sạch.** Sau tất cả các bước trên, console không có dòng đỏ nào. Dòng vàng `VietPhish: lỗi khi kiểm tra TypeError: Failed to fetch` ở bước 3 là bình thường.

Bảng kết quả trên lấy từ lượt chạy E2E bản tham chiếu ngày 11/11/2026 trong Chrome for Testing 148, server mock. Kiểm thêm 1 và 3 cũng đã chạy thử trên bản tham chiếu.

## Commit (người làm, agent không chạy)

```bash
git add extension/config.js extension/background.js
git commit -m "feat(extension): service worker kiểm tra trang và gọi server [A2]"
git pull --rebase
git push
```
