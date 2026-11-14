---
description: C2 - Script đo precision, recall, tỷ lệ báo nhầm (eval)
---

# C2. Script đo

**Người làm:** C. **Thời gian dự kiến:** 20 phút. **Phụ thuộc:** chế độ cục bộ cần B1 và B2 đã xong. Chế độ `--api` cần B5 đã xong.

## Mục tiêu

Viết script đọc bộ URL có nhãn, chấm từng URL, rồi in bảng TP, FP, TN, FN, precision, recall, tỷ lệ báo nhầm. Có hai chế độ: chạy cục bộ chỉ với heuristic, và gọi server với 3 cấu hình.

## File được sửa

- Tạo `eval/run_eval.js`

Không sửa `eval/domains.csv` và không sửa gì trong `server/`.

## Đặc tả

Chỉ dùng module có sẵn của Node: `node:fs`, `node:path`. Không thêm dependency.

### Đọc dữ liệu

- Đọc `eval/domains.csv` bằng `readFileSync(new URL("./domains.csv", import.meta.url), "utf8")`.
- Tách dòng bằng `/\r?\n/`, bỏ dòng đầu (tiêu đề) và bỏ dòng trống.
- Mỗi dòng tách theo dấu phẩy: phần tử 0 là `url`, phần tử 1 là `label` (`legit` hoặc `phish`), các phần tử còn lại ghép lại bằng dấu phẩy thành `note`.

### Chế độ cục bộ (không có tham số)

- Import động **bên trong hàm chạy cục bộ**:
  `const { isWhitelisted } = await import("../server/src/official.js");`
  `const { domainHeuristics } = await import("../server/src/heuristics.js");`
- Với mỗi URL: `wl = isWhitelisted(new URL(url).hostname)`. Nếu `wl` thì điểm 0, không có lý do. Ngược lại `h = domainHeuristics(url)`.
- Trang bị **gắn cờ** khi `!wl && h.score >= 40`.

### Chế độ API (`--api <baseUrl>`)

- Chạy lần lượt 3 cấu hình: `blacklist_only`, `no_vision`, `full`.
- Mỗi URL gửi `POST <baseUrl>/analyze` với body `{ url, mode }`. Timeout 15 giây bằng `AbortController`.
- Trang bị gắn cờ khi `verdict !== "SAFE"`.
- Đo thời gian mỗi request bằng `performance.now()`. Với URL gặp 429, thời gian đo là của lần gửi cuối cùng có response, không cộng thời gian chờ 5 giây giữa các lần thử.
- **HTTP 429:** chờ 5 giây rồi gửi lại, tối đa 15 lần. Không tính 429 là lỗi mạng và không tính là "không gắn cờ". Hết 15 lần vẫn 429 thì tính là lỗi.
- Lỗi mạng, timeout, hoặc HTTP khác 2xx mà không phải 429 (ví dụ 400, 500): tính là không gắn cờ, đếm riêng vào biến `errors`, và in thêm ` LỖI: <thông báo>` ở cuối dòng của URL đó.

### Tính và in

- `isPhish = label === "phish"`. TP: gắn cờ và là phish. FP: gắn cờ mà không phải phish. TN: không gắn cờ và không phải phish. FN: không gắn cờ mà là phish.
- Mỗi URL in một dòng: dấu `✓` nếu gắn cờ khớp nhãn, `✗` nếu không; điểm (request lỗi thì in `-`); nhãn; URL; danh sách mã lý do trong ngoặc vuông. Các phần cách nhau đúng một dấu cách, các mã lý do nối bằng `, ` (dấu phẩy và một dấu cách). Dòng mẫu nguyên văn:

```
✓ 40 phish https://vietcornbank.com.vn/login [LOOKALIKE_DOMAIN]
```
- Mỗi cấu hình in một dòng tiêu đề `=== <tên cấu hình> ===` trước các dòng URL. Tên cấu hình là `local`, `blacklist_only`, `no_vision`, `full`.
- Tổng kết mỗi cấu hình, in đúng dạng:

```
--- Tổng kết: local ---
TP 11, FP 0, TN 15, FN 2
Precision 100,0%, recall 84,6%, báo nhầm 0,0%
```

- Precision là `TP / (TP + FP)`. Recall là `TP / (TP + FN)`. Báo nhầm là `FP / (FP + TN)`. Mẫu số bằng 0 thì in `n/a`.
- Số phần trăm in một chữ số thập phân, dấu phẩy: `(x * 100).toFixed(1).replace(".", ",") + "%"`.
- Chế độ API in thêm một dòng ngay sau dòng precision, đúng dạng `Độ trễ p50 <số> ms, p95 <số> ms, lỗi mạng <số>`. Cách tính: làm tròn từng thời gian bằng `Math.round`, chỉ lấy các request thành công, sắp xếp tăng dần, lấy phần tử ở chỉ số `Math.max(0, Math.ceil(p * n) - 1)`. Mảng rỗng thì in `0`. Số in sau chữ "lỗi mạng" là giá trị biến `errors` của cấu hình đó, gồm lỗi mạng, timeout, HTTP khác 2xx không phải 429, và trường hợp hết lượt thử lại 429.
- Ghi toàn bộ kết quả ra `eval/results/<timestamp>.json`. Thư mục `results` nằm cạnh `run_eval.js`, nên tính đường dẫn từ `import.meta.url` (ví dụ `new URL("./results/", import.meta.url)`), không tính theo thư mục đang đứng khi chạy lệnh. Tạo thư mục bằng `mkdirSync(..., { recursive: true })`. Tên file không được chứa dấu `:` vì Windows không cho phép, dùng `new Date().toISOString().replace(/[:.]/g, "-")`.
- In dòng cuối: `Lưu ý: bộ mẫu nhỏ (28 URL), phần trang giả do đội tự đặt tên.`

## Bẫy đã biết

| Bẫy | Hậu quả | Cách tránh |
| --- | --- | --- |
| Import tĩnh `../server/src/...` ở đầu file | Chế độ `--api` hỏng khi máy C chưa `npm install` trong `server/` | Import động bên trong hàm chạy cục bộ |
| Tính HTTP 429 là "không gắn cờ" | Server giới hạn 60 request mỗi phút, eval gửi 84 request. 24 request cuối bị 429, cấu hình `full` ra recall 0% mà không có dấu hiệu lỗi | Gặp 429 thì chờ 5 giây rồi gửi lại |
| Tách CSV bằng `line.split(",")` rồi lấy đúng 3 phần tử | Cột `note` có dấu phẩy bị cắt | Ghép phần còn lại: `rest.join(",")` |
| Tên file kết quả có dấu `:` | Windows báo lỗi khi ghi file | Thay `:` và `.` bằng `-` |
| Gọi `domainHeuristics` cho trang thuộc whitelist | `vietcombank.com.vn` bị cộng 25 điểm vì chứa tên thương hiệu | Kiểm tra `isWhitelisted` trước |

## Điều cần hiểu khi đọc số

Ở chế độ API, script không gửi ảnh và không gửi tiêu đề. Vì vậy cấu hình `full` cho kết quả **giống hệt** `no_vision`. Đó không phải lỗi. Lớp nhìn ảnh chỉ thể hiện tác dụng trên trang thật có ảnh chụp, tức 4 trang demo mở trong Chrome.

Khi trình bày, dùng số của eval cho hai cấu hình `blacklist_only` và `no_vision`. Còn phần "thêm Gemini thì bắt được trang không có tên thương hiệu trong tên miền" chứng minh bằng trang `xacthuc-taikhoan.com`: heuristic cho 0 điểm, bản đầy đủ cho DANGER 85. Nêu rõ cỡ mẫu là 28 URL do đội tự đặt.

## Nghiệm thu

Chạy từ gốc repo bằng PowerShell. Chế độ cục bộ import code trong `server/src/`, nên cần thư mục `server/node_modules`. Chưa có thì chạy `cd server; npm ci; cd ..` một lần trước.

```powershell
node eval/run_eval.js
```

Phần tổng kết phải đúng là:

```
TP 11, FP 0, TN 15, FN 2
Precision 100,0%, recall 84,6%, báo nhầm 0,0%
```

Hai dòng `✗` phải là `https://hoan-thue-2026.com/thuedientu` và `https://xacthuc-taikhoan.com/`, cả hai điểm 0. Hai trang này không có tên thương hiệu trong tên miền nên heuristic không bắt được, đúng như thiết kế.

Khi server đã chạy (local cổng 8787 hoặc địa chỉ Cloud Run của bước B6). Dùng `127.0.0.1`, không dùng `localhost`, vì PowerShell và Node trên Windows thử IPv6 trước nên mỗi request chậm thêm:

```powershell
node eval/run_eval.js --api http://127.0.0.1:8787
```

Kết quả mong đợi với server không có key Safe Browsing (số TP, FP, TN, FN đã chạy thật với bản tham chiếu ngày 11/11/2026; chữ `n/a` theo quy tắc mẫu số bằng 0 ở trên):

```
--- Tổng kết: blacklist_only ---
TP 0, FP 0, TN 15, FN 13
Precision n/a, recall 0,0%, báo nhầm 0,0%
```

```
--- Tổng kết: no_vision ---
TP 11, FP 0, TN 15, FN 2
Precision 100,0%, recall 84,6%, báo nhầm 0,0%
```

Cấu hình `full` ra giống hệt `no_vision`. Dòng `Độ trễ` của cả ba cấu hình phải có `lỗi mạng 0`. Số mili giây thay đổi theo máy: server local chỉ vài ms; server Cloud Run khoảng vài chục đến vài trăm ms.

Lượt chạy này mất khoảng **một phút** dù server trả lời rất nhanh: 84 request vượt giới hạn 60 request mỗi phút, nên 24 request cuối gặp 429 và phải chờ. Nếu cấu hình `full` ra TP 0 hoặc có `lỗi mạng` khác 0 thì script chưa xử lý 429 đúng.

## Commit (người làm, agent không chạy)

```bash
git add eval/run_eval.js
git commit -m "feat(eval): script đo 3 cấu hình [C2]"
git pull --rebase
git push
```
