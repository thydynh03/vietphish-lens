---
description: C1 - Dựng môi trường demo (C làm bằng tay, không giao agent)
---

# C1. Môi trường demo

**Người làm:** C, trên laptop dùng để quay video: [laptop của ai, đội điền]. **Thời gian dự kiến:** 25 phút. **Phụ thuộc:** không. **Không giao cho agent.**

## Mục tiêu

Có một Chrome riêng mở được 4 trang demo trên tên miền giả, đã nạp extension. Trang demo chạy trên máy local, không bao giờ lên Internet.

| Tên miền | Trang | Kết quả mong đợi sau MDP |
| --- | --- | --- |
| `vietcombank-xacthuc.top` | VCB giả, đòi mật khẩu | Phủ đỏ DANGER |
| `vneid-capnhat.cc` | VNeID giả, đòi OTP | Phủ đỏ DANGER, có lý do OTP và VNeID |
| `xacthuc-taikhoan.com` | VCB giả trên tên miền không chứa tên ngân hàng | Chỉ lớp nhìn ảnh bắt được |
| `tintuc-demo.vn` | Trang tin có nhắc tên ngân hàng, không có ô nhập | Không bị cảnh báo |

## Vì sao phải dùng pwsh 7

Script `scripts\chrome-demo.ps1` có tiếng Việt và lưu UTF-8 không BOM. Windows PowerShell 5.1 đọc file loại này sai dấu, có thể làm hỏng cả chuỗi lệnh. Vì vậy luôn gọi bằng `pwsh`, không dùng `powershell`.

```powershell
pwsh --version
```

Kết quả phải từ `PowerShell 7` trở lên.

## Các bước

### 1. Chạy trang demo (tab terminal số 1, giữ chạy suốt buổi)

```powershell
cd D:\vietphish-lens
node demo-sites/serve.js
```

- [ ] Màn hình in `Demo sites: cổng 8080` và 4 URL.

### 2. Chạy server (tab terminal số 2)

Trước khi B5 xong, server chỉ có `/health`, nên trang demo chưa bị phủ đỏ. Vẫn chạy để extension có chỗ gọi tới.

```powershell
cd D:\vietphish-lens
node server/src/index.js
```

Sau MDP, extension gọi URL Cloud Run nên không cần tab này nữa.

### 3. Mở Chrome demo (tab terminal số 3)

```powershell
cd D:\vietphish-lens
pwsh -File scripts\chrome-demo.ps1
```

Script mở một Chrome với profile riêng ở `%TEMP%\vietphish-demo-profile`. Cờ `--host-resolver-rules` trỏ 4 tên miền demo về `127.0.0.1`, nên chỉ Chrome này thấy trang giả, các trình duyệt khác trên máy không bị ảnh hưởng.

### 4. Nạp extension

1. Chrome demo đã mở sẵn `chrome://extensions`. Bật Developer mode ở góc phải trên.
2. Bấm Load unpacked, chọn thư mục `D:\vietphish-lens\extension`.
3. Bấm link "service worker" trên thẻ VietPhish Lens, console phải không có lỗi đỏ.

Mỗi lần A push code mới cho extension: `git pull --rebase`, bấm nút tải lại trên thẻ extension, rồi F5 mọi tab demo. Tab cũ không có content script mới.

### 5. Kiểm 4 trang demo

Mở lần lượt trong Chrome demo:

- [ ] `http://vietcombank-xacthuc.top:8080/` hiện trang VCB giả có watermark.
- [ ] `http://vneid-capnhat.cc:8080/` hiện trang VNeID giả có watermark.
- [ ] `http://xacthuc-taikhoan.com:8080/` hiện trang VCB giả.
- [ ] `http://tintuc-demo.vn:8080/` hiện trang tin.

Nhớ gõ đủ `http://` và `:8080`. Thiếu `http://` thì Chrome có thể tự thử `https` và báo lỗi.

## Khi có lỗi

| Triệu chứng | Nguyên nhân hay gặp | Cách xử lý |
| --- | --- | --- |
| `ERR_NAME_NOT_RESOLVED` | Chrome demo không nhận `--host-resolver-rules`, thường vì đang mở trong một Chrome khác đã chạy sẵn | Đóng hết cửa sổ Chrome demo, chạy lại script. Vẫn lỗi thì dùng phương án lùi bên dưới |
| `ERR_CONNECTION_REFUSED` | Tab terminal số 1 chưa chạy hoặc đã tắt | Chạy lại `node demo-sites/serve.js` |
| Trang chữ "Không có trang demo cho ..." | Gõ sai tên miền | Đối chiếu với bảng ở đầu file |
| Script báo không tìm thấy `chrome.exe` | Chrome cài ở chỗ lạ | Truyền đường dẫn: `pwsh -File scripts\chrome-demo.ps1 -ChromePath "<đường dẫn chrome.exe>"` |
| Chữ tiếng Việt trong terminal bị vỡ | Gọi bằng `powershell` 5.1 | Gọi bằng `pwsh` |
| Không bấm được Load unpacked | Chính sách của máy chặn extension unpacked | Dùng Chrome for Testing |

Lỗi của extension (overlay không hiện, mọi trang ra SAFE) xem ở `docs/DEBUG-CHROME.md`.

## Phương án lùi

### Lùi 1: file hosts

Dùng khi `--host-resolver-rules` không có tác dụng. Cách này cần quyền quản trị và ảnh hưởng mọi trình duyệt trên máy.

1. Mở `pwsh` bằng "Run as administrator".
2. Thêm 4 dòng vào file hosts:

```powershell
$hosts = "C:\Windows\System32\drivers\etc\hosts"
Add-Content -Path $hosts -Value "`n127.0.0.1 vietcombank-xacthuc.top`n127.0.0.1 vneid-capnhat.cc`n127.0.0.1 xacthuc-taikhoan.com`n127.0.0.1 tintuc-demo.vn"
ipconfig /flushdns
```

3. Trong Chrome, vào `chrome://settings/security`, tắt "Use secure DNS". Nếu không tắt, Chrome có thể bỏ qua file hosts.
4. Mở Chrome thường, nạp extension, kiểm 4 trang như bước 5.

Sau ngày thi, xóa 4 dòng này khỏi file hosts và bật lại "Use secure DNS".

### Lùi 2: Chrome for Testing

Dùng khi Chrome bản thường trên laptop demo không cho Load unpacked hoặc hành xử lạ. Bản tham chiếu đã chạy đúng 4/4 trang demo trên Chrome for Testing.

Tải trước ngày thi, vì cần mạng và mất vài phút:

```powershell
cd $env:USERPROFILE
npx @puppeteer/browsers install chrome@stable
```

Lệnh in ra đường dẫn tới `chrome.exe` vừa tải. Ghi lại đường dẫn đó vào đây: [đường dẫn, C điền]. Sau đó mở Chrome demo bằng:

```powershell
cd D:\vietphish-lens
pwsh -File scripts\chrome-demo.ps1 -ChromePath "<đường dẫn chrome.exe vừa ghi>"
```

## Xong khi nào

- [ ] Cả 4 trang demo mở được trong Chrome demo.
- [ ] Extension đã nạp, console service worker không có lỗi đỏ.
- [ ] Biết sẵn phương án lùi nào dùng được trên laptop này: [hosts hay Chrome for Testing, C điền sau buổi diễn tập].

Bước này không có code, nên không commit gì.
