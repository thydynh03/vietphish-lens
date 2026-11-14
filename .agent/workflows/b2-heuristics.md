---
description: B2 - Heuristic chấm điểm tên miền (server)
---

# B2. Heuristic tên miền

**Người làm:** B. **Thời gian dự kiến:** 25 phút. **Phụ thuộc:** B1 đã xong.

## Mục tiêu

Viết hàm chấm điểm một URL dựa trên tên miền: punycode, tên gần giống tên chính thức, subdomain đánh lừa, chứa tên thương hiệu, đuôi rủi ro, không HTTPS, form gửi sang máy chủ khác. Điểm tối đa 60.

## File được sửa

- Tạo `server/src/heuristics.js`
- Tạo `server/test/heuristics.test.js`

## Đặc tả `server/src/heuristics.js`

Import cần có:

```js
import { domainToUnicode } from "node:url";
import { parse } from "tldts";
import { distance } from "fastest-levenshtein";
import { OFFICIAL } from "./official.js";
import { reason } from "./reasons.js";
```

Export:

```js
export const WEIGHTS = { homoglyph: 40, lookalike: 40, subdomainTrick: 40, brandKeyword: 25, suspiciousTld: 15, noHttps: 10, formOtherHost: 10 };
export const SUSPICIOUS_TLDS = new Set(["top", "xyz", "cc", "icu", "vip", "shop", "online", "click", "info", "live"]);
export function domainHeuristics(url, signals = {})
// trả { score, reasons, suspectedBrand, registrable }
```

Hàm phụ không export: `skeleton(s)` thay lần lượt `rn` thành `m`, `vv` thành `w`, `0` thành `o`, `1` thành `l`. Mỗi phép thay dùng regex có cờ `g`.

### Thuật toán, làm đúng thứ tự từng bước

**Bước 1. Chuẩn bị.**

- `u = new URL(url)`
- `hostname = u.hostname` (đã là chữ thường và không gồm cổng)
- `p = parse(hostname)`
- `label = p.domainWithoutSuffix || ""`
- `score = 0`, `reasons = []`, `suspectedBrand = null`

**Bước 2. Punycode.** Nếu `hostname.split(".").some((part) => part.startsWith("xn--"))` thì cộng `WEIGHTS.homoglyph` và thêm `reason("HOMOGLYPH", { puny: hostname, uni: domainToUnicode(hostname) })`.

**Bước 3. Vòng lặp ngoài: duyệt từng brand `b` trong `OFFICIAL.brands`, theo thứ tự trong file.** Trong thân vòng lặp này có hai phần, 3a rồi tới 3b/3c.

- **3a. Vòng lặp trong: duyệt từng `off` trong `b.domains`.**
  - `offLabel = parse(off).domainWithoutSuffix`
  - Nếu `!offLabel` hoặc `offLabel === label` thì `continue` (bỏ qua domain này, sang domain kế).
  - `d = distance(label, offLabel)`
  - Nếu `(d > 0 && d <= 2 && offLabel.length >= 5)` **hoặc** `skeleton(label) === offLabel`:
    - cộng `WEIGHTS.lookalike`
    - `suspectedBrand ??= b`
    - thêm `reason("LOOKALIKE_DOMAIN", { domain: p.domain, official: off, n: Math.max(d, 1) })`
    - `break` khỏi vòng lặp trong. Mỗi brand chỉ cộng điểm này một lần.
- **3b. Sau vòng lặp trong, vẫn ở trong vòng lặp ngoài.** `sub = p.subdomain || ""`. Nếu `b.domains.some((off) => sub.includes(off))`:
  - cộng `WEIGHTS.subdomainTrick`
  - `suspectedBrand ??= b`
  - thêm `reason("SUBDOMAIN_TRICK", { registrable: p.domain, brand: b.name })`
- **3c. `else if`, nối liền với `if` của 3b.** Nếu `b.keywords.some((k) => hostname.includes(k))`:
  - cộng `WEIGHTS.brandKeyword`
  - `suspectedBrand ??= b`
  - thêm `reason("BRAND_KEYWORD", { domain: p.domain, brand: b.name })`

**Bước 4. Đuôi rủi ro.** Nếu `SUSPICIOUS_TLDS.has(p.publicSuffix)` thì cộng `WEIGHTS.suspiciousTld`, thêm `reason("SUSPICIOUS_TLD", { tld: p.publicSuffix })`.

**Bước 5. Không HTTPS.** Nếu `u.protocol !== "https:"` thì cộng `WEIGHTS.noHttps`, thêm `reason("NO_HTTPS")`.

**Bước 6. Form gửi sang máy chủ khác.** Nếu `signals.formActionHost` có giá trị **và** `parse(signals.formActionHost).domain !== p.domain` thì cộng `WEIGHTS.formOtherHost`, thêm `reason("FORM_OTHER_HOST", { host: signals.formActionHost })`.

**Bước 7.** Trả `{ score: Math.min(score, 60), reasons, suspectedBrand, registrable: p.domain }`.

Hàm này **không** kiểm tra whitelist. Nơi gọi kiểm tra `isWhitelisted` trước.

### Tính tay ba ví dụ để tự đối chiếu

| URL | Diễn giải | Điểm |
| --- | --- | --- |
| `https://vietcombank.com.vn.secure-login.xyz/` | `label` là `secure-login`, `subdomain` là `vietcombank.com.vn`. Bước 3b đúng nên cộng 40. Bước 3c **không chạy** vì là `else if`. Bước 4 cộng 15 vì đuôi `xyz`. | 55 |
| `https://vietcornbank.com.vn/login` | `label` là `vietcornbank`. So với `vietcombank`: khoảng cách 2 (đổi `r` thành `m`, bỏ `n`), và độ dài `vietcombank` là 11, lớn hơn 5. Bước 3a cộng 40. Hostname không chứa chuỗi `vietcombank` nên 3c không cộng. | 40 |
| `http://vietcombank-xacthuc.top:8080/` kèm `formActionHost: "collector.example-attacker.xyz"` | 3c cộng 25. Đuôi `top` cộng 15. HTTP cộng 10. Form sang máy chủ khác cộng 10. | 60 |

## Bẫy đã biết

| Bẫy | Hậu quả | Cách tránh |
| --- | --- | --- |
| Đặt 3b và 3c **bên trong** vòng lặp domain của 3a | Brand có 2 domain (Techcombank, BHXH) bị cộng điểm keyword 2 lần | 3b và 3c nằm sau khi vòng lặp domain kết thúc, nhưng vẫn trong vòng lặp brand |
| Viết 3c thành `if` riêng thay vì `else if` | `vietcombank.com.vn.secure-login.xyz` ra 60 thay vì 55, mảng lý do thừa `BRAND_KEYWORD` | Viết `if (...) {...} else if (...) {...}` |
| Quên `break` ở 3a | Techcombank có 2 domain nên `techcornbank.com` bị cộng 80 | `break` ngay sau khi thêm lý do |
| Dùng `return` hoặc `break` ở chỗ `offLabel === label` | Bỏ luôn các domain còn lại của brand | Dùng `continue` |
| Bỏ điều kiện `offLabel.length >= 5` | Tên ngắn như `acb`, `tpb`, `momo` khớp nhầm hàng loạt tên miền thường | Giữ nguyên điều kiện |
| Dùng `u.host` thay vì `u.hostname` | `host` có cả cổng `:8080`, làm sai `parse` | Dùng `u.hostname` |
| So đuôi bằng `hostname.endsWith(".top")` | Sai với đuôi nhiều phần | Dùng `p.publicSuffix` |
| Quên giới hạn 60 | Điểm vượt 60, lệch với công thức gộp ở bước B3 | `Math.min(score, 60)` ở lệnh `return` |
| Gọi `isWhitelisted` trong hàm này | Test vector chạy thẳng hàm này sẽ sai | Không kiểm tra whitelist ở đây |

## Test

`server/test/heuristics.test.js`: đọc `test/vectors/heuristics.json`. Mỗi phần tử có dạng `{ url, signals?, score, codes }`. Với mỗi phần tử tạo một `test(url, ...)`:

```js
const r = domainHeuristics(v.url, v.signals || {});
assert.equal(r.score, v.score);
assert.deepEqual(r.reasons.map((x) => x.code), v.codes);
```

Thêm một test riêng: `domainHeuristics("https://vietcombank-xacthuc.top/").suspectedBrand.id` bằng `"vietcombank"`, và `.registrable` bằng `"vietcombank-xacthuc.top"`.

## Nghiệm thu

Chạy trong thư mục `server/`:

```bash
node --test test/heuristics.test.js
```

Kết quả phải có `# pass 24` và `# fail 0`. Con số 24 gồm 23 vector và 1 test riêng về `suspectedBrand`.

Nếu B1 đã xong thì `npm test` phải có `# pass 46` (22 của B1, 24 của B2). Không dùng `node --test test/`, lệnh đó hỏng trên Node 22.

Nếu có vector fail, xem tên URL bị fail rồi đối chiếu với bảng "Bẫy đã biết". Hầu hết lỗi nằm ở bước 3.

## Commit (người làm, agent không chạy)

```bash
git add server/src/heuristics.js server/test/heuristics.test.js
git commit -m "feat(server): heuristic tên miền [B2]"
git pull --rebase
git push
```
