---
description: 00 - Khởi động 15 phút đầu (cả đội, người tự làm)
---

# 00. Khởi động

**Người làm:** cả đội, mỗi người trên laptop của mình. **Thời gian:** 07:30 đến 07:45. **Không giao cho agent.**

## Mục tiêu

Đến 07:45, cả 3 máy có repo mới nhất, server khung chạy được, extension khung nạp được, phiên agent đã mở sẵn, và có ảnh chụp màn hình lúc bắt đầu làm bằng chứng.

## Các bước

Đường dẫn repo dưới đây là `D:\vietphish-lens`. Máy nào để chỗ khác thì sửa dòng `cd`.

### 1. Kéo repo và kiểm tag `pre-event` (cả đội, 2 phút)

```powershell
cd D:\vietphish-lens
git pull --rebase
git tag --list pre-event
git log -1 --oneline pre-event
git status --short
```

- [ ] `git tag --list pre-event` in ra `pre-event`.
- [ ] `git status --short` không in gì.
- [ ] `node --version` từ `v22` trở lên.

Nếu không có tag `pre-event`, chạy `git fetch --tags` rồi kiểm lại. Vẫn không có thì báo ngay trong nhóm Zalo của đội và mentor, vì tag này là mốc phân ranh phần làm trước.

### 2. Cài thư viện cho server (B bắt buộc, A nên làm, 2 phút)

```powershell
cd D:\vietphish-lens\server
npm install
cd ..
```

- [ ] `npm install` chạy xong, không báo lỗi đỏ.

A cũng cài, để khi gọi máy B không được thì A tự chạy server trên máy mình.

### 3. Chạy `/health` (B và A, 1 phút)

Mở một tab terminal riêng cho server, để chạy suốt buổi:

```powershell
cd D:\vietphish-lens
node server/src/index.js
```

Ở tab khác:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/health
```

- [ ] Kết quả có `ok : True`.

Dùng `127.0.0.1` thay cho `localhost`, vì server chỉ nghe IPv4 và PowerShell thử `::1` trước nên chậm khoảng 1 giây.

### 4. Nạp extension khung rỗng (A, 3 phút)

1. Mở `chrome://extensions`, bật Developer mode.
2. Bấm Load unpacked, chọn thư mục `D:\vietphish-lens\extension`.
3. Trên thẻ VietPhish Lens, bấm link "service worker" để mở console.

- [ ] Console in `VietPhish Lens: hello`.

C nạp extension trên Chrome demo ở bước C1, không làm ở đây.

### 5. Mở phiên agent (A và B, 2 phút)

Mở một tab terminal mới ở gốc repo. Chưa giao việc ở đây, việc giao ở bước đầu tiên của mỗi người (A1, B1). Kiểm tra agy chạy được:

```powershell
cd D:\vietphish-lens
agy models
```

- [ ] Danh sách có `gemini-4-argon-medium`.

Nếu dùng IDE Antigravity: mở thư mục `D:\vietphish-lens`, kiểm tra đã đăng nhập và chọn được model Gemini.

C chưa cần agent cho tới bước C2.

### 6. Chụp màn hình lúc bắt đầu (cả đội, 1 phút)

Chụp một ảnh có đồng hồ hệ thống, terminal đang mở repo và kết quả `git log -1 --oneline pre-event`. Phím tắt Windows: `Win + Shift + S`.

Lưu ảnh vào `docs\process\0730-<A|B|C>.png`, mỗi người một tên file riêng rồi commit:

```powershell
git add docs/process/0730-A.png
git commit -m "docs(process): ảnh chụp bắt đầu 07:30"
git pull --rebase
git push
```

- [ ] Ảnh của mình đã lên GitHub.

### 7. Đọc lại hợp đồng API (cả đội, 4 phút)

Cả đội cùng mở `docs/API.md` và đọc lại. Chốt miệng ba điều:

- [ ] Request `POST /analyze` gồm `url`, `title`, `screenshot`, `signals`, `mode`.
- [ ] Ngưỡng kết luận: `SAFE` dưới 40, `SUSPICIOUS` từ 40 đến 69, `DANGER` từ 70.
- [ ] Từ giờ không ai sửa `docs/API.md` hay `shared/` khi chưa báo cả đội.

### 8. Báo mentor (một người, 1 phút)

Nhắn vào nhóm Zalo có mentor: link repo GitHub, giờ bắt đầu, và câu "Đội bắt đầu build lúc 07:30, tag pre-event là mốc phần làm trước."

## Xong khi nào

- [ ] Cả 3 máy có repo mới nhất và tag `pre-event`.
- [ ] `/health` trả `ok` trên máy B.
- [ ] Extension khung in "hello" trên máy A.
- [ ] 3 ảnh chụp bắt đầu đã lên GitHub.

Trễ quá 07:50 thì bỏ bước 6 và 8, làm bù sau CP1. Không để khởi động ăn vào thời gian code.
