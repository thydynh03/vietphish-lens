---
description: B1 - Nạp whitelist và mẫu lý do tiếng Việt (server)
---

# B1. Whitelist và mẫu lý do

**Người làm:** B. **Thời gian dự kiến:** 10 phút. **Phụ thuộc:** không.

## Mục tiêu

Tạo hai module nền của server: một module nạp danh sách tên miền chính thức và trả lời câu hỏi "hostname này có thuộc whitelist không", một module sinh câu lý do tiếng Việt từ mã lý do.

## File được sửa

- Tạo `server/src/official.js`
- Tạo `server/src/reasons.js`
- Tạo `server/test/official.test.js`
- Tạo `server/test/reasons.test.js`

Không sửa file nào khác. Không sửa `server/data/` và `server/test/vectors/`.

## Đặc tả `server/src/official.js`

```js
export const OFFICIAL            // object đọc từ ../data/official_domains.json
export const brandById           // Map<string, brand>, khóa là brand.id
export function isWhitelisted(hostname)   // trả boolean
```

1. Đọc file bằng đúng cách này: `JSON.parse(readFileSync(new URL("../data/official_domains.json", import.meta.url), "utf8"))`. `readFileSync` lấy từ `node:fs`.
2. `brandById = new Map(OFFICIAL.brands.map((b) => [b.id, b]))`.
3. `isWhitelisted(hostname)`:
   - Chuyển `hostname` về chữ thường.
   - Nếu có `s` trong `OFFICIAL.trustedSuffixes` mà `hostname === s` hoặc `hostname.endsWith("." + s)` thì trả `true`.
   - `domain = parse(hostname).domain`, với `parse` lấy từ gói `tldts`.
   - Trả `true` nếu có brand mà `brand.domains.includes(domain)`. Ngược lại trả `false`.

File dữ liệu có dạng:

```json
{
  "trustedSuffixes": ["gov.vn"],
  "brands": [
    { "id": "vietcombank", "name": "Vietcombank", "domains": ["vietcombank.com.vn"], "keywords": ["vietcombank", "vcbdigibank"] }
  ]
}
```

Ví dụ kiểm chứng: `vcbdigibank.vietcombank.com.vn` có `parse(...).domain` là `vietcombank.com.vn` nên được whitelist. `vietcombank.com.vn.secure-login.xyz` có `domain` là `secure-login.xyz` nên không.

## Đặc tả `server/src/reasons.js`

```js
export function reason(code, vars = {})   // trả { code, text, weight }
```

Bảng mẫu. Chép **nguyên văn từng chữ**, kể cả dấu câu:

| code | weight | text |
| --- | --- | --- |
| `WHITELIST` | 0 | `Tên miền {domain} nằm trong danh sách chính thức.` |
| `SAFE_BROWSING_HIT` | 100 | `Google Safe Browsing đã xác định trang này là lừa đảo.` |
| `BRAND_DOMAIN_MISMATCH` | 40 | `Trang này trông giống {brand} nhưng địa chỉ {domain} không phải tên miền chính thức ({official}).` |
| `ASKS_OTP` | 20 | `Trang yêu cầu nhập mã OTP. Ngân hàng và cơ quan nhà nước không bao giờ hỏi OTP trên trang lạ.` |
| `ASKS_PASSWORD` | 20 | `Trang yêu cầu mật khẩu đăng nhập {brand} trên một tên miền lạ.` |
| `ASKS_CARD` | 20 | `Trang yêu cầu số thẻ hoặc CVV, dấu hiệu đánh cắp thông tin thẻ.` |
| `LOOKALIKE_DOMAIN` | 40 | `Tên miền {domain} gần giống {official} (chỉ khác {n} ký tự).` |
| `HOMOGLYPH` | 40 | `Tên miền dùng ký tự đánh lừa thị giác: {uni} (thực chất là {puny}).` |
| `SUBDOMAIN_TRICK` | 40 | `Tên miền thật là {registrable}; phần chữ {brand} phía trước chỉ là phần giả.` |
| `BRAND_KEYWORD` | 25 | `Tên miền {domain} chứa tên {brand} nhưng không thuộc {brand}.` |
| `SUSPICIOUS_TLD` | 15 | `Đuôi .{tld} thường bị lợi dụng trong lừa đảo.` |
| `NO_HTTPS` | 10 | `Trang không dùng kết nối bảo mật HTTPS.` |
| `FORM_OTHER_HOST` | 10 | `Dữ liệu bạn nhập sẽ được gửi sang máy chủ khác ({host}).` |
| `URGENCY` | 5 | `Trang dùng lời lẽ hối thúc (khóa tài khoản, cập nhật gấp…).` |
| `VNEID_OFFLINE` | 0 | `VNeID chỉ xác thực qua ứng dụng chính thức và vneid.gov.vn, không qua website lạ.` |

Quy tắc:

- Thay `{key}` bằng `String(vars[key] ?? "")`. Thiếu biến thì ra chuỗi rỗng, không được ra chữ `undefined`.
- Thay **mọi** lần xuất hiện. Dùng regex có cờ `g`: `text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""))`.
- `code` không có trong bảng thì `throw new Error("Mã lý do không tồn tại: " + code)`. Kiểm tra bằng `Object.hasOwn(TEMPLATES, code)`.

## Bẫy đã biết

| Bẫy | Hậu quả | Cách tránh |
| --- | --- | --- |
| Dùng `text.replace("{brand}", ...)` với chuỗi thường | Chỉ thay lần đầu. `BRAND_KEYWORD` có `{brand}` hai lần nên câu ra sai | Dùng regex có cờ `g` như trên |
| Kiểm tra mã bằng `if (!TEMPLATES[code])` | `reason("toString")` không ném lỗi vì object kế thừa `toString` | Dùng `Object.hasOwn` |
| Dùng `__dirname` hoặc đường dẫn tương đối kiểu `"./data/..."` | ES module không có `__dirname`; đường dẫn tương đối phụ thuộc thư mục đang đứng | Dùng `new URL("../data/official_domains.json", import.meta.url)` |
| Import thiếu đuôi `.js` | `ERR_MODULE_NOT_FOUND` | Luôn ghi `"./reasons.js"` |
| Đọc `shared/official_domains.json` | Khi deploy chỉ thư mục `server/` được đóng gói, file không tồn tại | Chỉ đọc `server/data/official_domains.json` |

## Test

`server/test/official.test.js`: dùng `node:test` và `node:assert/strict`. Đọc `test/vectors/whitelist.json` bằng `readFileSync(new URL("./vectors/whitelist.json", import.meta.url), "utf8")`. Mỗi phần tử `{ hostname, expected }` tạo một `test(...)` riêng, so `isWhitelisted(hostname)` với `expected` bằng `assert.equal`.

`server/test/reasons.test.js`, bốn test:

1. `reason("BRAND_KEYWORD", { domain: "a.top", brand: "Vietcombank" }).text` bằng đúng `Tên miền a.top chứa tên Vietcombank nhưng không thuộc Vietcombank.`
2. `reason("NO_HTTPS")` trả `{ code: "NO_HTTPS", text: "Trang không dùng kết nối bảo mật HTTPS.", weight: 10 }`.
3. `reason("SUSPICIOUS_TLD", {}).text` bằng `Đuôi . thường bị lợi dụng trong lừa đảo.` (thiếu biến thì ra chuỗi rỗng).
4. `assert.throws(() => reason("toString"))`.

## Nghiệm thu

Chạy trong thư mục `server/` bằng PowerShell. Nếu chưa có thư mục `server/node_modules` (ví dụ máy vừa clone repo) thì chạy `npm ci` một lần trước. Lệnh này chỉ cài 3 gói đã khai trong `package-lock.json`, không thêm gói mới.

```powershell
node --test test/official.test.js test/reasons.test.js
```

Kết quả phải có `# pass 22` và `# fail 0`. Con số 22 gồm 18 dòng whitelist và 4 test lý do.

Lỗi `Cannot find package 'tldts'` nghĩa là chưa chạy `npm ci`. Không dùng `node --test test/`: trên Node 22 lệnh đó coi `test/` là một module và báo `Cannot find module`.

## Commit (người làm, agent không chạy)

```bash
git add server/src/official.js server/src/reasons.js server/test/official.test.js server/test/reasons.test.js
git commit -m "feat(server): whitelist và mẫu lý do tiếng Việt [B1]"
git pull --rebase
git push
```
