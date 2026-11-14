# Kiểm tra và gỡ lỗi extension trong Chrome

Tài liệu cho người, không phải cho agent. Dùng khi cần tự tay kiểm extension hoặc khi thấy extension "không làm gì". Tra theo mục, không cần đọc từ đầu.

## 1. Quy tắc vàng

> **Sửa code xong: bấm tải lại extension, rồi F5 mọi tab demo.**

Nút tải lại chỉ nạp lại service worker. Tab đã mở từ trước vẫn giữ content script cũ, hoặc không có content script nào. Quên F5 là nguyên nhân số một của lỗi "mọi trang đều SAFE" và lỗi `Receiving end does not exist`.

Hai quy tắc phụ:

- Gọi server từ PowerShell thì dùng `http://127.0.0.1:8787`, không dùng `localhost`. Server chỉ nghe IPv4, PowerShell thử IPv6 trước nên chậm thêm khoảng 1 giây.
- Kết quả sai mà sửa code rồi vẫn sai y nguyên: server đang cache kết quả 10 phút. Tắt server (Ctrl+C) rồi bật lại.

## 2. Chuẩn bị một lần

Mở ba cửa sổ PowerShell ở gốc repo.

```powershell
# Cửa sổ 1: server, chế độ mock
$env:VISION_MOCK="1"; node server/src/index.js
```

```powershell
# Cửa sổ 2: 4 trang demo, cổng 8080
node demo-sites/serve.js
```

```powershell
# Cửa sổ 3: kiểm server rồi mở Chrome riêng cho demo
Invoke-RestMethod http://127.0.0.1:8787/health
pwsh -File scripts\chrome-demo.ps1
```

Script dùng profile riêng `%TEMP%\vietphish-demo-profile`, mở sẵn `chrome://extensions`, nhận `-ChromePath "<đường dẫn chrome.exe>"` khi Chrome cài ở chỗ lạ. Máy không có pwsh 7 thì gõ tay một dòng, cùng tên profile:

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="$env:TEMP\vietphish-demo-profile" --host-resolver-rules="MAP vietcombank-xacthuc.top 127.0.0.1, MAP vneid-capnhat.cc 127.0.0.1, MAP xacthuc-taikhoan.com 127.0.0.1, MAP tintuc-demo.vn 127.0.0.1" chrome://extensions
```

Cờ `--host-resolver-rules` trỏ 4 tên miền giả về máy mình, không cần sửa file hosts. Cờ `--user-data-dir` tạo một profile riêng, không đụng Chrome hằng ngày.

> **Lưu ý:** nếu một cửa sổ Chrome dùng profile `vietphish-demo-profile` đang mở sẵn thì Chrome **bỏ qua** cờ mới. Đóng hết cửa sổ của profile đó rồi chạy lại lệnh.

Trong `chrome://extensions`:

1. Bật **Developer mode** ở góc trên bên phải.
2. Bấm **Load unpacked**, chọn thư mục `extension` của repo.
3. Ghim icon VietPhish Lens ra thanh công cụ (biểu tượng mảnh ghép, bấm hình ghim) để nhìn thấy huy hiệu.
4. Chờ khoảng 3 giây rồi mới mở trang demo đầu tiên.

Chrome bản thường từ bản 137 bỏ qua cờ `--load-extension`, nên phải Load unpacked bằng tay như trên. Cách này **chưa được thử trên máy demo**. Thử ngay khi tới nơi. Nếu không được, cài Chrome for Testing bằng `npx @puppeteer/browsers install chrome@stable` rồi chạy `pwsh -File scripts\chrome-demo.ps1 -ChromePath "<đường dẫn lệnh đó in ra>"`.

## 3. Mở đúng console

| Muốn xem | Cách mở |
| --- | --- |
| Console của service worker (`background.js`) | `chrome://extensions`, trên thẻ VietPhish Lens bấm link **service worker**. Nếu link ghi "Inactive" thì vẫn bấm được, worker sẽ thức dậy |
| Tất cả lỗi của extension | Nút **Errors** màu đỏ trên thẻ extension. Gom lỗi của cả service worker lẫn content script. Bấm **Clear all** sau khi sửa xong |
| Console của content script (`content.js`) | Ở trang demo bấm F12, tab Console. Đổi ô chọn **top** ở góc trên sang **VietPhish Lens** |
| Console của popup | Chuột phải vào icon extension, chọn **Inspect popup** |

## 4. Lệnh hay dùng trong console service worker

```js
chrome.storage.session.get(null)          // kết quả đã lưu của mọi tab, khóa "tab:<số>"
chrome.storage.local.get(null)            // cờ DEMO_OFFLINE và danh sách "Báo nhầm"
chrome.storage.local.set({ DEMO_OFFLINE: false })   // tắt chế độ demo offline khi popup chưa có
chrome.tabs.query({ active: true, url: ["http://*/*", "https://*/*"] })   // tab web đang hiển thị
```

Đọc kết quả đã lưu:

| Giá trị trong `tab:<số>` | Nghĩa |
| --- | --- |
| `{ verdict, riskScore, reasons, ..., pageUrl }` | Kiểm xong, có kết quả từ server |
| `{ verdict: "SAFE", riskScore: 0, whitelisted: true, pageUrl }` | Tên miền chính thức, không gọi server |
| `{ checking: true, pageUrl }` | Đang kiểm, hoặc kẹt giữa chừng nếu để lâu |
| `{ error: "...", pageUrl }` | Lỗi, đọc chuỗi `error` rồi tra mục 5 |
| Không có khóa của tab | Tab chưa được kiểm. Thường do quên F5 hoặc tab mở ở nền |

Muốn thử overlay mà không cần server: dán đoạn định nghĩa `DANGER`, `SUSPICIOUS`, `vpSend` ở mục Nghiệm thu của `.agent/workflows/a1-content-overlay.md`, rồi chạy `vpSend({ type: "verdict", result: DANGER })`.

## 5. Triệu chứng, nguyên nhân, cách sửa

### Trang không mở được

| Triệu chứng | Nguyên nhân | Cách sửa |
| --- | --- | --- |
| `ERR_NAME_NOT_RESOLVED` hoặc `This site can't be reached` | Chrome mở không có `--host-resolver-rules`, hoặc profile đã mở sẵn nên cờ bị bỏ qua | Đóng hết cửa sổ profile demo, chạy lại lệnh ở mục 2 |
| `ERR_CONNECTION_REFUSED` ở cổng 8080 | Chưa chạy trang demo | `node demo-sites/serve.js` |
| Trang hiện `Không có trang demo cho 127.0.0.1` | Mở bằng IP thay vì tên miền | Mở đúng `http://vietcombank-xacthuc.top:8080/` |

### Huy hiệu và kết quả

| Triệu chứng | Nguyên nhân | Cách sửa |
| --- | --- | --- |
| Không có huy hiệu ở mọi trang, nút Errors đỏ | Service worker lỗi ngay khi nạp | Bấm Errors, đọc dòng đầu tiên, tra các dòng bên dưới |
| Không có huy hiệu ở mọi trang, không có lỗi | Tab mở trước khi tải lại extension, hoặc trang đầu tiên ngay sau khi cài | F5 tab. Sau khi cài chờ vài giây rồi mới mở trang |
| Không có huy hiệu ở một tab mở bằng chuột giữa hoặc Ctrl+click | Extension chỉ kiểm tab đang hiển thị lúc tải xong. Tab mở ở nền rồi chuyển sang thì không được kiểm | Chuyển sang tab đó rồi F5 |
| Huy hiệu hiện `…` rồi trống, `error: "Failed to fetch"` | Server chưa chạy hoặc sai `API_BASE` | Kiểm `Invoke-RestMethod http://127.0.0.1:8787/health`. Kiểm `API_BASE` trong `extension/config.js` |
| `error: "Server không phản hồi trong 10 giây"` | Server treo hoặc Gemini quá chậm | Xem cửa sổ server. Thử lại với `VISION_MOCK=1` |
| `error: "Server trả HTTP 429"` | Quá 60 request mỗi phút | Chờ 1 phút |
| `error: "Server trả HTTP 400"` hoặc `500` | Server không đọc được request | Xem dòng lỗi ở cửa sổ server, báo B |
| Huy hiệu kẹt `…` rất lâu, storage có `checking: true` | Chụp màn hình treo (cửa sổ bị thu nhỏ), hoặc lượt kiểm bị kẹt | Đưa cửa sổ Chrome lên trước, không thu nhỏ. F5 tab |
| Mọi trang ra `✓`, kể cả trang giả | Content script không trả tín hiệu, server nhận `signals` rỗng | F5 tab. Vẫn bị thì xem console content script. `xacthuc-taikhoan.com` ra `SAFE 19` thay vì `DANGER 85` là dấu hiệu rõ nhất |
| Console service worker có `Could not establish connection. Receiving end does not exist.` | Tab không có content script | F5 tab. Nếu đây là lỗi đỏ "Uncaught" thì `sendToTab` thiếu `.catch` |
| Kết quả sai lặp lại dù đã sửa code | Server cache 10 phút | Tắt server rồi bật lại |
| Log server có dòng `[SAFE ...]` cho `xacthuc-taikhoan.com` | Đổi trang nhanh làm lẫn tín hiệu của trang khác. Thiếu `stillHere()` sau `getSignals` | Sửa `background.js` theo bước A2, rồi khởi động lại server để xóa cache sai |
| Trang chính thức `vietcombank.com.vn` có dòng log ở server | Thiếu nhánh whitelist hoặc whitelist đặt sau khi gọi server | Sửa theo bước A2 mục 7b |

### Ảnh chụp màn hình

| Triệu chứng | Nguyên nhân | Cách sửa |
| --- | --- | --- |
| Log server ghi `không ảnh` cho 3 trang giả | Chụp lỗi. Xem console service worker có `không chụp được màn hình` hay không | Không thu nhỏ cửa sổ, không chuyển tab trong lúc trang đang kiểm |
| Console service worker có `RangeError: Maximum call stack size exceeded` | Đổi ảnh sang base64 bằng `String.fromCharCode(...bytes)` | Ghép theo khối `0x8000` như bước A2 |
| Console service worker có `ReferenceError: document is not defined` | Dùng `document`, `Image` hay `canvas` trong service worker | Dùng `createImageBitmap` và `OffscreenCanvas` |
| Log server ghi `(ảnh ...KB)` cho `tintuc-demo.vn` | Chụp mọi trang | Chỉ chụp khi có ô nhạy cảm hoặc tên miền chứa tên thương hiệu |

### Overlay và popup

| Triệu chứng | Nguyên nhân | Cách sửa |
| --- | --- | --- |
| Huy hiệu `✕` nhưng không có overlay | Content script cũ, hoặc lỗi trong `render` | F5 tab. Xem console content script |
| Overlay hiện mà gõ phím vẫn vào ô mật khẩu | Thiếu `blur()` và `focus()` | Sửa theo bước A1 |
| Hai overlay chồng nhau | Content script nạp hai lần, thiếu cờ `__vietphishLensLoaded` | Sửa theo bước A1 |
| Kiểm tra lại ra SAFE nhưng overlay đỏ vẫn còn | Nhánh SAFE không gửi `{ type: "clear" }` | Sửa theo bước A2 mục 7h |
| Popup hiện "Nguy hiểm" ở trang tin | Popup không so `pageUrl` | Sửa theo bước A3 |
| Popup hiện "Chưa kiểm tra" dù huy hiệu đã đổi | Kết quả lưu vào biến thay vì `chrome.storage.session`, service worker đã ngủ | Sửa theo bước A2 |
| Popup trắng trơn | Lỗi trong `popup.js` hoặc script nội tuyến | Inspect popup, đọc lỗi |
| Popup báo `Lỗi: Cannot read properties of undefined (reading 'API_BASE')` | `popup.html` nạp `popup.js` trước `config.js` | Đổi thứ tự hai thẻ `<script>` |

### Lỗi khi nạp extension

| Triệu chứng | Nguyên nhân | Cách sửa |
| --- | --- | --- |
| `Manifest file is missing or unreadable` | Chọn sai thư mục, hoặc `manifest.json` sai cú pháp | Chọn đúng thư mục `extension`. Chạy `node -e "JSON.parse(require('fs').readFileSync('extension/manifest.json','utf8'))"` |
| `Could not load javascript 'content.js' for script` | Thiếu file hoặc sai tên trong manifest | Kiểm tên file khớp với `content_scripts` |
| `Cannot use import statement outside a module` | File extension có `import` | Bỏ `import`, extension là script classic |
| `Cannot read properties of undefined (reading 'API_BASE')` trong service worker | `importScripts("config.js")` không ở đầu file hoặc thiếu `config.js` | Đặt `importScripts` ở dòng code đầu tiên |
| Service worker ghi "Inactive" | Chrome cho worker ngủ khi rảnh, bình thường | Không cần làm gì |

## 6. Danh sách kiểm 4 trang demo

Mở lần lượt trong **cùng một tab**. Bên cạnh mỗi trang, xem cả huy hiệu, màn hình và dòng log ở cửa sổ server.

| | Trang | Huy hiệu | Màn hình | Log server |
| --- | --- | --- | --- | --- |
| [ ] | `http://vietcombank-xacthuc.top:8080/` | `✕` đỏ | Phủ đỏ, `Điểm rủi ro 100/100`, nút `Về trang chính thức Vietcombank` | `[DANGER 100] ... (ảnh ...KB)` |
| [ ] | `http://vneid-capnhat.cc:8080/` | `✕` đỏ | Phủ đỏ, `100/100`, có lý do OTP và lý do "VNeID chỉ xác thực qua ứng dụng chính thức" | `[DANGER 100] ... (ảnh ...KB)` |
| [ ] | `http://xacthuc-taikhoan.com:8080/` | `✕` đỏ | Phủ đỏ, `85/100` | `[DANGER 85] ... (ảnh ...KB)` |
| [ ] | `http://tintuc-demo.vn:8080/` | `✓` xanh | Không có gì | `[SAFE 19] ... (không ảnh)` |
| [ ] | `https://vietcombank.com.vn/` (cần Internet) | `✓` xanh | Không có gì | Không có dòng nào |

Kiểm thêm khi có thời gian:

- [ ] Ở trang giả, bấm Tab rồi Enter: overlay biến mất, vẫn ở trang giả.
- [ ] Bấm `Về trang chính thức ...`: sang đúng trang chính thức.
- [ ] Popup (nếu đã làm A3): đúng kết luận, đúng điểm, đủ lý do.
- [ ] Chế độ demo offline (nếu đã làm A3): tích ô trong popup, tắt server, F5 trang VNeID vẫn phủ đỏ.
- [ ] Nút Errors trên thẻ extension không đỏ.

## 7. Trước khi quay video

- [ ] Đổi `API_BASE` trong `extension/config.js` nếu dùng server đã deploy. Tải lại extension, F5 các tab.
- [ ] Mở `<API_BASE>/health` trong trình duyệt, thấy `"ok":true`.
- [ ] Chạy hết danh sách ở mục 6 một lượt.
- [ ] Tắt chế độ demo offline, trừ khi đang chủ động dùng nó. Nếu dùng thì nói rõ trong video.
- [ ] Phóng to trình duyệt 125%, đóng tab không liên quan, tắt thông báo hệ thống.
- [ ] Khởi động lại server ngay trước khi quay nếu đã sửa code server, để xóa cache cũ.
