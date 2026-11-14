---
description: A4 - Khóa gửi biểu mẫu trong lúc kiểm tra và hỏi lại trước khi gõ bí mật (extension, content.js)
---

# A4. Khóa ô nhập và hỏi lại

**Người làm:** C, lúc 09:20–09:55, trên Chrome demo đã dựng ở C1. **Thời gian dự kiến:** 25 phút cho agent, cộng 10 phút người kiểm. **Phụ thuộc:** A1 đã push (`git pull` trước khi bắt đầu). Sau A1, chỉ bước này sửa `extension/content.js`. A làm A2, A5, A3 ở các file khác nên chạy song song được. Đây là ngoại lệ duy nhất của bảng phân vùng trong `AGENTS.md`: C chỉ được sửa `extension/content.js`, và chỉ trong bước này. Lịch đầy đủ ở `docs/TASKS.md`.

Đây là điểm khác biệt K1 và K2 trong `docs/KHAC-BIET.md`. Bản tham chiếu chạy đạt 8 ca e2e ngày 14/11/2026.

## Mục tiêu

1. **K1. Khóa gửi khi đang kiểm tra.** Khi service worker gửi tin `{ type: "lock" }`, trang không gửi được biểu mẫu cho tới khi có kết luận: chặn sự kiện `submit`, phím Enter trong ô nhập, và click vào nút. **Không** chặn gõ phím. Hiện một chip nhỏ ở đáy màn hình. Sau 15 giây chưa có kết luận thì tự mở khóa.
2. **K2. Hỏi lại trước khi gõ bí mật.** Khi kết luận là `SUSPICIOUS`, lần đầu người dùng bấm vào ô mật khẩu, OTP hoặc số thẻ thì hiện hộp hỏi lại, có hai nút "Rời trang" và "Tôi hiểu rủi ro, vẫn nhập".

Chỉ service worker được bật khóa. Content script **không bao giờ** tự khóa, vì service worker đã loại trang thuộc whitelist trước khi gửi `lock`. Nhờ vậy trang ngân hàng thật không bao giờ bị khóa.

## File được sửa

- Sửa `extension/content.js`: chỉ sửa đúng 3 chỗ ghi dưới đây. Không sửa `getSignals`, `render`, `STYLE` hay câu chữ của A1.

Không sửa `background.js`, `manifest.json` hay file nào khác.

## Chỗ 1. `mount(html)`, bước 5

Thay dòng gắn sự kiện của nút `[data-close]` bằng:

```js
if (close)
  close.addEventListener("click", () => {
    clearOverlay();
    onUserDismiss();
  });
```

`onUserDismiss` là function declaration ở Chỗ 2. Nằm trong cùng hàm tự gọi nên gọi trước khi khai báo vẫn được.

## Chỗ 2. Khối mới, đặt ngay **sau** hàm `render` và **trước** `chrome.runtime.onMessage.addListener`

Bắt đầu khối bằng comment `// ---------- A4: khóa ô nhập (K1) và hỏi lại (K2) ----------`.

### Hằng số và biến

```js
const LOCK_TIMEOUT_MS = 15000; // dài hơn REQUEST_TIMEOUT_MS 10 giây của config.js cộng thời gian chụp ảnh
const CHIP_ID = "vietphish-lens-chip";
const ASK_ID = "vietphish-lens-ask";
const UI_FONT = 'font-family: "Segoe UI", Roboto, "Noto Sans", Arial, sans-serif;';
const SUBMIT_LIKE = 'button, input[type="submit"], input[type="button"], input[type="image"], [role="button"]';
let lockState = "off"; // "off" | "checking" | "danger" | "suspicious"
let lockTimer = null;
let lockBrand = null; // { name, officialUrl } hoặc null
const confirmed = new WeakSet(); // ô người dùng đã chọn "vẫn nhập"
let chipHost = null;
let askHost = null;
```

### `sensitiveKind(el)`

Trả `"password"`, `"otp"`, `"card"` hoặc `null`. Dùng **đúng** luật của `getSignals` để hai nơi luôn khớp:

1. `!el || el.tagName !== "INPUT"` thì `null`.
2. `(el.type || "").toLowerCase() === "password"` thì `"password"`.
3. `t = [el.name, el.id, el.placeholder, el.getAttribute("autocomplete")].filter(Boolean).join(" ").toLowerCase()`.
4. `t` khớp `/otp|one-time-code|mã xác thực|ma xac thuc/` thì `"otp"`.
5. `t` khớp `/card|cc-number|cvv|số thẻ/` thì `"card"`.
6. Còn lại `null`.

`pageHasSensitive()` trả `[...document.querySelectorAll("input")].some((el) => sensitiveKind(el))`.

### `ownUi(e)`

`true` nếu `e.composedPath()` chứa `host`, `chipHost` hoặc `askHost` (bỏ qua giá trị `null`). Dùng để không chặn chính nút của extension. Shadow root là `closed` nên `e.target` của click trong hộp chỉ là host, phải dùng `composedPath()`.

### Chip

- `showChip(text)`: gọi `hideChip()`, tạo `div` id `CHIP_ID`, `attachShadow({ mode: "closed" })`, `innerHTML` là thẻ `<style>` và `<div class="chip" role="status">` + `escapeHtml(text)` + `</div>`. CSS `.chip`: `position:fixed; left:50%; bottom:20px; transform:translateX(-50%); z-index:2147483647; background:#26323f; color:#fff; padding:10px 16px; border-radius:999px; font-size:14px; line-height:1.4; box-shadow:0 4px 14px rgba(0,0,0,.35)` cộng `UI_FONT`. `:host{all:initial}`. Gắn vào `document.documentElement`.
- `hideChip()`: `chipHost.remove()` nếu có, rồi `chipHost = null`.

### `setLock(state, brand)`

1. `lockState = state`. Nếu `brand !== undefined` thì `lockBrand = brand`.
2. `clearTimeout(lockTimer)`, `lockTimer = null`.
3. `state === "checking"`: `showChip("VietPhish đang kiểm tra trang này. Tạm khóa gửi biểu mẫu.")`, rồi `lockTimer = setTimeout(..., LOCK_TIMEOUT_MS)`. Trong hàm hẹn giờ: nếu `lockState !== "checking"` thì `return`. Ngược lại `lockState = "off"`, `showChip("Chưa kiểm tra xong. Hãy tự kiểm tra địa chỉ trang trước khi nhập mật khẩu hoặc OTP.")`, `setTimeout(hideChip, 6000)`.
4. State khác thì `hideChip()`.
5. `state !== "suspicious"` thì `closeAsk()`.

### `lockFromVerdict(result)`

- `brand` = `result.brand` nếu `result && result.brand && typeof result.brand.officialUrl === "string"`, ngược lại `null`.
- Không có `result`, hoặc `result.verdict === "SAFE"`: `setLock("off", null)`.
- `"DANGER"`: `setLock("danger", brand)`.
- Còn lại, tức `"SUSPICIOUS"`: `setLock("suspicious", brand)`.

### `onUserDismiss()`

Nếu `lockState === "danger"` thì `lockState = "suspicious"`. Người dùng tự đóng overlay đỏ thì vẫn bị hỏi lại khi bấm vào ô mật khẩu. Đóng dải vàng SUSPICIOUS cũng **không** gỡ việc hỏi lại.

### Bốn listener, gắn trên `window` ở pha capture (đối số thứ ba `true`)

`blocking()` trả `lockState === "checking" || lockState === "danger"`.

`stop(e)`: `e.preventDefault()`, `e.stopImmediatePropagation()`, rồi nếu `lockState === "checking"` thì `showChip("Đợi VietPhish kiểm tra xong trang này rồi hãy gửi.")`.

| Sự kiện | Điều kiện | Làm |
| --- | --- | --- |
| `submit` | `blocking() && !ownUi(e)` | `stop(e)` |
| `keydown` | `blocking()`, `!ownUi(e)`, `e.key === "Enter"`, `e.target.tagName === "INPUT"` | `stop(e)` |
| `click` | `blocking()`, `!ownUi(e)`, `e.target.closest(SUBMIT_LIKE)` có giá trị, và `pageHasSensitive()` | `stop(e)`. Link vẫn bấm được để người dùng thoát trang |
| `focusin` | `lockState === "suspicious"`, `!ownUi(e)`, `sensitiveKind(e.target)` có giá trị, ô chưa nằm trong `confirmed` | `e.target.blur()` rồi `ask(e.target, kind)` |

Gắn trên `window`, không trên `document`: listener capture của `window` chạy trước listener của trang trên `document`, form và nút. Thuộc tính `onsubmit` của form demo cũng bị chặn.

### `closeAsk()` và `ask(el, kind)`

`closeAsk()`: `askHost.remove()` nếu có, `askHost = null`.

`ask(el, kind)`:

1. `closeAsk()`.
2. `what` = `{ password: "mật khẩu", otp: "mã OTP", card: "số thẻ" }[kind]`.
3. `official` = `lockBrand.officialUrl` nếu `lockBrand` có và URL khớp `/^https:\/\//i`, ngược lại `""`.
4. `leaveLabel` = `official ? "Rời trang, về trang chính thức " + (lockBrand.name || "") : "Rời trang này"`.
5. Tạo `div` id `ASK_ID`, shadow `closed`, gắn vào `document.documentElement`. HTML, mọi chữ động qua `escapeHtml`:

```html
<div class="back"><div class="card" role="alertdialog" aria-modal="true" aria-labelledby="t">
  <h2 id="t">Trang này đáng ngờ. Bạn chắc muốn nhập {what}?</h2>
  <p>VietPhish thấy dấu hiệu giả mạo trên trang này. Ngân hàng và cơ quan nhà nước không bao giờ yêu cầu {what} qua một trang lạ.</p>
  <div class="row"><button class="leave" data-leave>{leaveLabel}</button><button class="stay" data-stay>Tôi hiểu rủi ro, vẫn nhập</button></div>
</div></div>
```

CSS: `.back` phủ kín (`position:fixed; inset:0; z-index:2147483647; background:rgba(20,24,30,.55); display:flex; align-items:center; justify-content:center; padding:16px` cộng `UI_FONT`). `.card` nền trắng, chữ `#1d2733`, `max-width:460px`, `border-radius:12px`, `padding:22px`, `border-top:6px solid #a8670f`. `.leave` nền `#a8670f`, chữ trắng, đậm. `.stay` nền trong, viền `#9aa5b1`. `button:focus-visible{outline:3px solid #1d63c8}`.

6. `[data-leave]` click: `closeAsk()`. Có `official` thì `location.href = official`. Không có thì `history.length > 1 ? history.back() : location.replace("about:blank")`.
7. `[data-stay]` click: `closeAsk()`, `confirmed.add(el)`, `el.focus({ preventScroll: true })` trong `try`.
8. Cuối cùng focus nút `[data-leave]`.

## Chỗ 3. `chrome.runtime.onMessage.addListener`

Thêm vào các nhánh hiện có, vẫn trả lời đồng bộ, vẫn **không** `return true`:

```js
} else if (msg.type === "verdict") {
  render(msg.result);
  lockFromVerdict(msg.result);
} else if (msg.type === "clear") {
  clearOverlay();
  setLock("off", null);
} else if (msg.type === "lock") {
  if (lockState === "off") setLock("checking");
} else if (msg.type === "unlock") {
  if (lockState === "checking") setLock("off");
}
```

`lock` chỉ có tác dụng khi đang `"off"`: trang đã bị kết luận đáng ngờ thì lượt kiểm lại không làm mất việc hỏi lại.

## Bẫy đã biết

| Bẫy | Triệu chứng | Cách tránh |
| --- | --- | --- |
| Content script tự bật khóa khi thấy ô mật khẩu | Trang đăng nhập Vietcombank thật bị khóa, vì whitelist chỉ nằm ở service worker | Chỉ khóa khi nhận tin `lock` |
| Không có hạn tự mở | Server chết thì người dùng không bao giờ gửi được form, kể cả trên trang lạ hợp lệ | `LOCK_TIMEOUT_MS` 15 giây |
| Hạn tự mở ngắn hơn 10 giây | Khóa mở trước khi chế độ cơ bản của A5 kịp kết luận | Giữ đúng 15000 |
| Chặn mọi click | Người dùng không bấm được link để thoát trang | Chỉ chặn `SUBMIT_LIKE` và chỉ khi trang có ô nhạy cảm |
| Listener gắn trên `document` | `onsubmit` hoặc listener của trang trên `document` vẫn chạy trước | Gắn trên `window`, pha capture |
| Kiểm `e.target` thay vì `composedPath()` | Bấm "vẫn nhập" trong hộp hỏi lại bị chặn hoặc tự mở lại hộp | `ownUi(e)` dùng `composedPath()` |
| Viết lại `getSignals` để dùng `sensitiveKind` | Lệch output của A1, hỏng nghiệm thu A1 | Không đụng `getSignals`, chỉ chép đúng regex |
| Chặn cả gõ phím | Người dùng tưởng extension làm hỏng trang | Chỉ chặn Enter, `submit`, click nút |

## Tự kiểm trước khi báo xong

- [ ] `node --check extension/content.js` không lỗi
- [ ] Không có `import`, `export`, `return true`
- [ ] Chỉ 3 chỗ được sửa, `git diff --stat` chỉ có `extension/content.js`
- [ ] Mọi chuỗi động trong `innerHTML` đều qua `escapeHtml`
- [ ] Ba shadow root đều `mode: "closed"`

## Nghiệm thu

Người làm bằng tay, không cần server. Dùng `vpSend`, `DANGER`, `SUSPICIOUS` của bước A1 trong console service worker. Tải lại extension rồi F5 trang demo.

| Bước | Làm | Phải thấy |
| --- | --- | --- |
| 1 | Ở `http://vietcombank-xacthuc.top:8080/`, chạy `vpSend({ type: "lock" })` | Chip tối ở đáy màn hình: "VietPhish đang kiểm tra trang này. Tạm khóa gửi biểu mẫu." |
| 2 | Bấm `Đăng nhập` | **Không** có hộp alert "Trang DEMO…". Chip đổi thành "Đợi VietPhish kiểm tra xong…" |
| 3 | Bấm vào ô mật khẩu, gõ `abc`, bấm Enter | Gõ được chữ. Enter không gửi form |
| 4 | Chạy `vpSend({ type: "verdict", result: SUSPICIOUS })` | Chip biến mất, dải vàng hiện |
| 5 | Bấm ra ngoài, rồi bấm lại vào ô mật khẩu | Hộp hỏi lại hiện: "Trang này đáng ngờ. Bạn chắc muốn nhập mật khẩu?". Con trỏ không ở ô mật khẩu |
| 6 | Bấm "Tôi hiểu rủi ro, vẫn nhập" | Hộp đóng, con trỏ về ô mật khẩu, gõ được. Bấm ra rồi bấm lại: không hỏi nữa |
| 7 | Bấm `Đăng nhập` | Có alert "Trang DEMO…" (SUSPICIOUS không chặn gửi) |
| 8 | F5, chạy `vpSend({ type: "lock" })`, chờ 16 giây | Chip đổi thành "Chưa kiểm tra xong…", bấm `Đăng nhập` thì có alert |
| 9 | F5, chạy `vpSend({ type: "verdict", result: DANGER })`, bấm "Tôi hiểu rủi ro, vẫn tiếp tục", bấm vào ô mật khẩu | Overlay đỏ đóng, hộp hỏi lại hiện |
| 10 | F5, chạy `vpSend({ type: "lock" })` rồi `vpSend({ type: "clear" })`, bấm `Đăng nhập` | Chip biến mất, có alert |
| 11 | Ở `http://tintuc-demo.vn:8080/` không chạy gì | Không có chip, không có hộp |

Bước 1 đến 7 và 9 đã có ca e2e tương ứng ở bản tham chiếu (`VietPhish_Demo/tools/e2e/run_khac_biet.js`).

## Commit (người làm, agent không chạy)

```bash
git add extension/content.js
git commit -m "feat(extension): khóa gửi khi đang kiểm tra và hỏi lại trước khi gõ bí mật [A4]"
git pull --rebase
git push
```
