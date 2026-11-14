---
description: C3 - Kịch bản và quy trình quay video demo 2 phút (C làm, không giao agent)
---

# C3. Video demo 2 phút

**Người làm:** C quay và dựng, A điều khiển máy, B đọc phần giải pháp. **Mốc:** soạn lời 08:10 đến 08:30, bản nháp lần 1 lúc 09:15, quay chính từ 10:45, xong trước 11:20. **Phụ thuộc:** MDP. **Không giao cho agent.**

## Vì sao video là sản phẩm chính

Sau 12:00, hội đồng mentor xem video của 31 đội để chọn Top 8. Không ai đứng cạnh giải thích, nên video phải tự nói đủ ba điều: sản phẩm giải quyết vấn đề gì, các tính năng chính chạy ra sao, và công nghệ Google nằm ở đâu.

## Kịch bản

Kịch bản theo bảng ở mục 11 của `docs/KE-HOACH.md`. Lời đọc dưới đây viết vừa thời lượng nếu đọc ở tốc độ nói chuyện bình thường. Chỗ `[...]` phải điền bằng dữ liệu thật, ghi rõ ai điền. **Không bịa số liệu, không bịa tên vụ việc.** Chưa có dữ liệu thật thì bỏ câu đó.

### 0:00 đến 0:15: vấn đề

**Màn hình:** tiêu đề bài báo về một vụ lừa đảo thật, kèm một số liệu NCSC.

**Lời đọc (C):**

> [Tóm tắt vụ lừa đảo thật trong một câu, kèm tên báo và ngày đăng. C điền.] Theo NCSC, [số liệu NCSC kèm năm. C điền, giữ link nguồn]. Trang lừa đảo chỉ sống vài giờ trên một tên miền mới, nên danh sách đen luôn chậm một bước.

### 0:15 đến 0:30: giải pháp

**Màn hình:** sơ đồ 4 lớp.

**Lời đọc (B):**

> VietPhish Lens là tiện ích Chrome kiểm tra mỗi trang qua bốn lớp: danh sách tên miền chính thức, Google Safe Browsing, phân tích tên miền, và Gemini nhìn ảnh chụp trang. Nguyên tắc rất gọn: nhìn giống X, nhưng không phải nhà của X, lại đòi OTP.

### 0:30 đến 0:45: trang thật không bị làm phiền

**Màn hình:** mở `vietcombank.com.vn`, huy hiệu xanh.

**Lời đọc (B):**

> Đây là trang chính thức của Vietcombank. Tên miền nằm trong danh sách chính thức, nên tiện ích chỉ hiện huy hiệu xanh và không gửi ảnh chụp đi đâu.

### 0:45 đến 1:15: trang giả ngân hàng bị chặn

**Màn hình:** mở `http://vietcombank-xacthuc.top:8080/`, màn hình phủ đỏ. A rê chuột qua từng lý do, rồi bấm "Về trang chính thức".

**Lời đọc (B):**

> Còn đây là trang giả do đội tự dựng trên tên miền mới, vietcombank-xacthuc.top. Tiện ích phủ đỏ toàn trang và giải thích bằng tiếng Việt. Một là, [lý do thứ nhất, đọc đúng chữ trên màn hình]. Hai là, [lý do thứ hai]. Ba là, [lý do thứ ba]. Người dùng bấm một nút là về trang chính thức.

Câu về Safe Browsing chỉ đọc khi đúng sự thật:

- Nếu `layers.safeBrowsing` của trang này là `clean` (server có key Safe Browsing): thêm câu "Lúc này Google Safe Browsing vẫn báo trang này sạch."
- Nếu là `skipped` (không có key): thay bằng câu "Trang này mới dựng, chưa có trong danh sách đen nào."

### 1:15 đến 1:35: trang giả VNeID đòi OTP

**Màn hình:** mở `http://vneid-capnhat.cc:8080/`, phủ đỏ với lý do OTP và VNeID.

**Lời đọc (B):**

> Trang thứ hai giả cổng VNeID và đòi mã OTP. Tiện ích cảnh báo ngay, vì VNeID chỉ xác thực qua ứng dụng chính thức và vneid.gov.vn, không qua website lạ.

> **Ghi chú:** đội cân nhắc thêm cảnh `http://xacthuc-taikhoan.com:8080/`. Đây là trang duy nhất chứng minh Gemini bắt được thứ heuristic bỏ sót: heuristic chấm thấp, bản đầy đủ ra DANGER 85. Chỉ thêm khi Gemini thật chạy ổn và video vẫn dưới 2:00.

### 1:35 đến 1:50: công nghệ Google

**Màn hình:** console Cloud Run đang chạy service, mở log của một request có gọi Gemini.

**Lời đọc (B):**

> Server chạy trên Google Cloud Run. Với trang lạ có ô nhập nhạy cảm, server gửi ảnh chụp cho Gemini để nhận diện thương hiệu, rồi tự so với tên miền thật. Lớp chặn thứ hai là Google Safe Browsing.

Nếu phải quay với server local theo luật cắt phạm vi, thay bằng:

> Trong video này server chạy trên máy local vì [lý do thật, B điền]. Bản deploy lên Google Cloud Run ở [URL, B điền].

Nếu Gemini lỗi và kết quả là `degraded`, thêm câu: "Lúc quay, lớp Gemini không phản hồi kịp, nên kết quả trên màn hình chỉ đến từ phân tích tên miền."

### 1:50 đến 2:00: số đo và kết

**Màn hình:** bảng số đo và tên đội.

**Lời đọc (C):**

> Trên bộ [cỡ mẫu] URL đội tự gắn nhãn, phân tích tên miền bắt được [TP] trên [TP + FN] trang giả và báo nhầm [FP] trang thật. VietPhish Lens, [tên đội và tên ba thành viên. C điền].

Số liệu lấy từ output thật của `node eval/run_eval.js`, C điền sau bước C2. Nếu có số eval qua API thì dùng số của cấu hình `no_vision`. Không làm tròn đẹp hơn, không bỏ cỡ mẫu.

## Chuẩn bị màn hình

Làm xong trước 10:45:

- [ ] Độ phân giải màn hình 1920x1080. Chrome demo phóng to 125%.
- [ ] Chrome demo chỉ còn các tab: `vietcombank.com.vn`, tab trống để gõ URL trang giả, console Cloud Run.
- [ ] Ảnh tiêu đề bài báo, sơ đồ 4 lớp, bảng số đo đã mở sẵn ở cửa sổ khác hoặc slide.
- [ ] Tắt thông báo Windows (Do not disturb), tắt Zalo và các ứng dụng hay hiện popup.
- [ ] Đóng tab chứa API key, email, tài khoản cá nhân.
- [ ] Server đã được làm nóng: mở mỗi trang giả một lần trước khi quay.
- [ ] Sau khi làm nóng, xóa trạng thái cũ: F5 các tab demo để overlay hiện lại từ đầu.
- [ ] Micro đã cắm, phòng đủ yên. Quay thử 10 giây, nghe lại.

## Quy trình quay

Tối đa 3 lần quay. Mỗi lần quay liền một mạch từ 0:00 đến 2:00, không dừng giữa chừng để sửa.

| Lần | Bắt đầu | Làm gì sau khi quay |
| --- | --- | --- |
| 1 | 10:45 | Xuất MP4, xem lại toàn bộ. Đạt đủ "Kiểm tra trước khi nộp" thì dừng, không quay thêm |
| 2 | Khoảng 10:55 | Chỉ quay nếu lần 1 hỏng tiếng, sai thao tác, hoặc quá 2:00 |
| 3 | Chậm nhất 11:05 | Lần cuối. Dù còn lỗi nhỏ vẫn dùng bản tốt nhất trong 3 lần |

Không quay lần thứ 4. Từ 11:15, dùng bản tốt nhất đã có, kể cả bản nháp lần 1 của 09:15.

Nếu phần mềm quay cho cắt ghép thì được cắt khoảng chờ server dài, nhưng không ghép kết quả của lần chạy khác vào làm như một lần chạy.

## Bản nháp lần 1 lúc 09:15

Bản nháp có mục đích duy nhất là luôn có một file nộp được nếu buổi sáng gặp sự cố.

- [ ] Quay đúng thứ tự kịch bản trên, dùng phần đang chạy được lúc 09:15. Server local cũng được.
- [ ] Cảnh nào chưa chạy thì để màn hình sơ đồ và đọc lời, nói rõ "phần này đang hoàn thiện".
- [ ] Xuất MP4, mở thử được, có tiếng.
- [ ] Lưu tên `video-nhap-0915.mp4`, chép thêm một bản sang USB hoặc Google Drive.

File `.mp4` đã nằm trong `.gitignore`, nên không bao giờ bị commit nhầm vào repo.

## Kiểm tra trước khi nộp

- [ ] Thời lượng không quá 2:00. Xem trong trình phát video. Nếu máy có `ffprobe` thì chạy:

```powershell
ffprobe -v error -show_entries format=duration -of csv=p=0 video-demo.mp4
```

  Kết quả là số giây, phải từ 120 trở xuống.

- [ ] Mở file bằng trình phát mặc định, xem từ đầu tới cuối.
- [ ] Có tiếng ở cả đoạn đầu và đoạn cuối.
- [ ] Chữ trong overlay đọc được ở chế độ toàn màn hình.
- [ ] Không lộ API key, email hay thông báo cá nhân trên màn hình.
- [ ] Mọi chỗ `[...]` trong lời đọc đã được thay bằng dữ liệu thật hoặc đã bỏ câu.
- [ ] Đã tải lên theo hình thức BTC yêu cầu: [hình thức nộp, C điền]. Link mở được trong cửa sổ ẩn danh.
- [ ] Link video đã ghi vào mục "Video demo" của `README.md`.

## Commit (người làm, agent không chạy)

Video không vào repo. Chỉ commit phần README:

```powershell
git add README.md
git commit -m "docs: link video demo [C3]"
git pull --rebase
git push
```
