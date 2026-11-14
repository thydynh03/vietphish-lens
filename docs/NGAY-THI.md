# Sổ tay ngày thi 14/11/2026

Mở file này trên màn hình phụ và làm theo từ trên xuống. Kế hoạch đầy đủ nằm ở `docs/KE-HOACH.md`, file này chỉ là phần thao tác.

## Đọc trong 2 phút

**Mục tiêu buổi sáng:** đến 11:30 có một video 2 phút cho thấy trang VCB giả bị phủ đỏ kèm lý do tiếng Việt, và một repo GitHub có tag `v1.0-demo` với lịch sử commit đều đặn từ 07:30. Hội đồng mentor chọn Top 8 chủ yếu bằng video, nên video quan trọng hơn mọi tính năng phụ.

**Ba thứ không bao giờ cắt:**

1. Overlay DANGER phủ đỏ trang giả.
2. Lý do cảnh báo bằng tiếng Việt.
3. Video demo 2 phút nộp đúng giờ.

**Mốc giờ cứng:**

| Giờ | Mốc | Việc phải có |
| --- | --- | --- |
| 07:30 | Bắt đầu | Chạy `00-khoi-dong.md`, chụp màn hình lúc bắt đầu |
| 09:15 | CP1 | B1 đến B4 đã push, B5 đang làm. A1 đã push, A2 viết xong code. C quay bản nháp video lần 1 |
| 09:55 | MDP | URL Cloud Run trả `/health`, extension trỏ tới, ba kịch bản chạy đúng |
| 10:15 | Đóng băng | Không thêm tính năng mới, chỉ sửa lỗi |
| 10:45 | Bắt đầu quay | Không lùi. Lỗi gì còn lại thì quay phần đang chạy |
| 11:20 | Tag và push | `v1.0-demo` lên GitHub |
| 11:30 | Nộp | Link GitHub và video, xong trước 12:00 |

**Quy tắc vàng khi dùng agent:** mỗi bước một phiên mới, tự chạy lại lệnh nghiệm thu, xem file nào bị đổi rồi mới commit. Agent không bao giờ tự commit, người làm bước commit. Agent sai 2 lần thì bỏ, không cãi lần thứ 3.

**B chạy hai phiên agent song song:** B4 chỉ phụ thuộc B1 và sửa nhóm file khác B2, B3. Vì vậy B mở phiên thứ hai cho B4 ngay sau khi commit B1 (khoảng 07:55). Nếu B không theo nổi hai phiên thì C trông phiên B4 và duyệt lệnh nghiệm thu, B vẫn là người commit.

## Giao một bước cho agent

### Câu lệnh để dán

Mở terminal PowerShell ở gốc repo rồi chạy (thay `b2-heuristics` bằng mã bước của mình):

```powershell
cd D:\vietphish-lens
agy --model gemini-4-argon-medium --mode accept-edits -i "Đọc AGENTS.md rồi làm đúng theo .agent/workflows/b2-heuristics.md. Chỉ làm bước này. Không chạy git commit, người sẽ tự commit."
```

Nếu dùng IDE Antigravity, mở thư mục `D:\vietphish-lens`, tạo một cuộc trò chuyện agent mới rồi dán đúng câu trong dấu ngoặc kép ở trên. Nếu IDE có cách gọi workflow bằng dấu gạch chéo thì dùng cũng được, nhưng đội chưa kiểm chứng, nên câu đầy đủ vẫn là cách chính.

Đường dẫn repo trên từng laptop có thể khác `D:\vietphish-lens`. Mỗi người tự sửa dòng `cd` cho đúng máy mình.

| Mã | File để dán vào câu lệnh | Ghi chú |
| --- | --- | --- |
| B1 | `.agent/workflows/b1-official-reasons.md` | |
| B2 | `.agent/workflows/b2-heuristics.md` | |
| B3 | `.agent/workflows/b3-fusion.md` | |
| B4 | `.agent/workflows/b4-vision-safebrowsing.md` | Phiên agent thứ hai của B. Agent viết cả `server/test/try-gemini.js`, nhưng lượt thử Gemini thật bằng `node test/try-gemini.js <ảnh>` do B chạy, agent chỉ giúp đọc kết quả |
| B5 | `.agent/workflows/b5-analyze-server.md` | |
| B6 | `.agent/workflows/b6-deploy-cloud-run.md` | B chạy lệnh, agent chỉ giúp đọc lỗi và tra bảng, không tự chạy lệnh deploy |
| A1 | `.agent/workflows/a1-content-overlay.md` | |
| A2 | `.agent/workflows/a2-background.md` | |
| A3 | `.agent/workflows/a3-popup-offline.md` | Tùy chọn, bị cắt đầu tiên. Làm sau A5 |
| A4 | `.agent/workflows/a4-khoa-o-nhap.md` | **C làm**, 09:20–09:55, chỉ sửa `extension/content.js` |
| A5 | `.agent/workflows/a5-che-do-co-ban.md` | A làm, 09:35–10:00, ngay sau A2, trước A3 |
| C2 | `.agent/workflows/c2-eval.md` | |

Ba bước `00`, C1 và C3 do người tự làm, không giao cho agent.

### Chọn model

| Tình huống | Model id |
| --- | --- |
| Mặc định cho mọi bước | `gemini-4-argon-medium` |
| Bước đã thất bại 2 lần với `medium`, giao lại ở phiên mới | `gemini-4-argon-high` |
| Hết lượt Argon hoặc Argon báo lỗi quota | `gemini-3.8-flash-high` |

### Mỗi bước một phiên mới

Phiên cũ đã chứa code và cách hiểu của bước trước, nên model yếu dễ "làm tiện" sang bước sau. Vì vậy, xong một bước thì thoát agy hoặc đóng tab terminal đó, rồi mở tab mới cho bước kế. Cờ `-c` chỉ dùng khi lỡ đóng phiên của chính bước đang làm dở và muốn quay lại phiên đó.

### Khi agent đòi quyền chạy lệnh

Với `--mode accept-edits`, agent tự sửa file nhưng phải xin quyền trước khi chạy lệnh shell. Đọc kỹ lệnh trên màn hình rồi xử lý theo bảng:

| Lệnh agent xin chạy | Xử lý |
| --- | --- |
| Lệnh nghiệm thu ghi trong file bước, ví dụ `node --test test/heuristics.test.js` | Cho phép |
| Lệnh chỉ đọc: `git status`, `git diff`, `dir`, `type`, `Get-Content` | Cho phép |
| `npm install` không kèm tên gói, trong `server/` | Cho phép |
| `npm ci` trong `server/` | Cho phép. Lệnh này chỉ cài đúng các gói đã khai trong `package-lock.json` |
| `npm install <tên gói>`, `npm i <gói>` | Từ chối. AGENTS.md cấm thêm dependency |
| `git commit`, `git add -A`, `git push`, `git checkout`, `git reset` | Từ chối. Người tự làm |
| Xóa file, sửa file ngoài danh sách "File được sửa" | Từ chối |
| `gcloud ...` ở bước B6 | B đọc kỹ từng lệnh rồi mới cho phép |
| Lệnh lạ, không hiểu nó làm gì | Từ chối, hỏi người trong đội |

Nếu hộp xin quyền có lựa chọn "cho phép trong phiên này", chỉ chọn khi cùng một lệnh nghiệm thu bị hỏi lặp lại nhiều lần. Không chọn lưu vĩnh viễn.

### Sau khi agent báo xong

Agent nói "đạt" chưa đủ. Người làm bước tự kiểm theo thứ tự:

| Bước | Lệnh | Đạt khi |
| --- | --- | --- |
| 1 | Chạy lại đúng lệnh ở mục "Nghiệm thu" của file bước | Output khớp con số trong file bước, ví dụ `# pass 24` và `# fail 0` |
| 2 | `git status --short` | Chỉ có file nằm trong mục "File được sửa". File mới hiện dạng `??` |
| 3 | `git diff --stat` | Không có file cũ nào ngoài phạm vi bị sửa, đặc biệt `server/test/vectors/`, `docs/API.md`, `package.json` |
| 4 | Gặp file ngoài phạm vi thì `git checkout -- <file>` (file cũ) hoặc `Remove-Item <file>` (file mới) | `git status --short` sạch phần thừa |
| 5 | `git add <đúng các file của bước>` rồi commit theo thông điệp ở cuối file bước | Commit xong |
| 6 | `git pull --rebase` rồi `git push` | Push thành công, mentor thấy commit trên GitHub |

Lưu ý: `git diff --stat` không hiện file mới tạo. Vì vậy luôn chạy `git status --short` trước.

## Khi agent làm sai

Mỗi bước được yêu cầu sửa **tối đa 2 lần** trong cùng phiên. Mỗi lần yêu cầu sửa, dán nguyên output lỗi và chỉ đúng dòng trong bảng "Bẫy đã biết" của file bước.

Mẫu câu yêu cầu sửa:

```text
Lệnh nghiệm thu chưa đạt. Output thật:

<dán nguyên output lỗi ở đây, không tóm tắt>

Lỗi này khớp với dòng "<chép tên bẫy>" trong bảng "Bẫy đã biết" của .agent/workflows/<mã bước>.md. Sửa đúng chỗ đó trong <tên file code>. Không sửa test vector, không sửa file khác. Sửa xong chạy lại lệnh nghiệm thu và dán output.
```

Ví dụ với B2. Phần output dưới đây chỉ để minh họa cách viết, khi dùng thật thì dán nguyên output trên màn hình:

```text
Lệnh nghiệm thu chưa đạt. Output thật:

not ok 3 - https://vietcombank.com.vn.secure-login.xyz/
  expected: 55
  actual: 60

Lỗi này khớp với dòng "Viết 3c thành if riêng thay vì else if" trong bảng "Bẫy đã biết" của .agent/workflows/b2-heuristics.md. Sửa đúng chỗ đó trong server/src/heuristics.js. Không sửa test vector, không sửa file khác. Sửa xong chạy lại lệnh nghiệm thu và dán output.
```

Sau 2 lần sửa vẫn chưa đạt thì chọn một trong hai đường:

| Đường | Khi nào chọn | Làm gì |
| --- | --- | --- |
| Giao lại | Còn trên 15 phút cho bước này | `git checkout -- <file cũ bị sửa>`, xóa file mới của bước, đóng phiên, mở phiên mới. Có thể đổi sang `gemini-4-argon-high` |
| Người tự sửa | Lỗi đã khoanh vùng tới một hàm, hoặc sắp tới mốc giờ | Đọc bảng "Bẫy đã biết", sửa tay, chạy lại nghiệm thu |

Không nhờ agent sửa lần thứ 3 trong cùng phiên. Phiên đó đã rối, càng sửa càng lệch.

## Lịch theo giờ

> **Cập nhật 14/11:** lịch đã sắp lại để thêm A4 và A5 (điểm khác biệt, xem `KHAC-BIET.md`). Bảng giờ đúng nằm ở `docs/TASKS.md`. Chỗ nào khác bảng dưới đây thì theo `TASKS.md`.

Lịch này khớp với mục 09 của `KE-HOACH.md`. Cột "Xong khi nào" là tiêu chí nghiệm thu một dòng. Bước nào chưa có con số cụ thể ở đây thì xem mục "Nghiệm thu" trong file bước.

### A, extension

| Giờ | Mã | Xong khi nào |
| --- | --- | --- |
| 07:30–07:45 | 00 | `/health` trả `ok`, extension khung rỗng in "hello" |
| 07:45–08:30 | A1 | Agent khoảng 30 phút, A kiểm tay khoảng 10 phút. Nghiệm thu không cần server: overlay đỏ hiện trên trang VCB giả khi gửi kết quả giả bằng `vpSend`, lý do tiếng Việt đọc được |
| 08:30–09:25 | A2 | Agent khoảng 45 phút, A tự kiểm khoảng 10 phút. Đến CP1 phải viết xong code và qua mục "Tự kiểm trước khi báo xong" |
| 09:15 | CP1 | Xem mục "Điểm kiểm tra" |
| 09:25–09:35 | A2 (nghiệm thu) | Ngay khi B push B5: A `git pull`, chạy server mock trên máy mình, mở `http://vietcombank-xacthuc.top:8080/` thì trang bị phủ đỏ. Đủ bảng "Kết quả mong đợi" của A2 |
| 09:35–10:15 | A3 | Agent khoảng 30 phút, A kiểm khoảng 10 phút. Popup hiện đúng kết luận của tab đang mở. `DEMO_OFFLINE` là tùy chọn |
| Khoảng 09:50 | Đổi `API_BASE` | Chen giữa A3: khi B báo URL thì đổi `API_BASE` sang URL Cloud Run, tải lại extension, chạy lại 3 kịch bản. Xong trước MDP 09:55 |
| 10:15–10:45 | Sửa lỗi | Chỉ sửa giao diện và câu chữ, commit nhỏ |
| 10:45–11:20 | C3 | Điều khiển máy theo kịch bản khi C quay |
| 11:20–11:30 | Tag | `v1.0-demo` có trên GitHub |

### B, backend và AI

| Giờ | Mã | Xong khi nào |
| --- | --- | --- |
| 07:30–07:45 | 00 | `npm install` trong `server/` xong, `/health` trả `ok` |
| 07:45–07:55 | B1 | `node --test test/official.test.js test/reasons.test.js` ra `# pass 22`, `# fail 0` |
| 07:55–08:20 | B2 | `node --test test/heuristics.test.js` ra `# pass 24`, `# fail 0` |
| 08:20–08:45 | B3 | `node --test test/fusion.test.js` ra `# pass 15`, `# fail 0` |
| 07:55–08:45, song song | B4 | Phiên agent thứ hai, mở ngay sau khi commit B1. `node --test test/vision.test.js test/safebrowsing.test.js` ra `# pass 16`, `# fail 0`. B kiểm và commit xen giữa B2, B3, chậm nhất 08:45. Thử Gemini thật (15 phút) dời sang B6 phần D4 đến D6 nếu chưa kịp |
| 08:45–09:25 | B5 | `npm test` ra `# pass 96`, `# fail 0`. `node test/smoke.js http://127.0.0.1:8787` với server mock ra 6 dòng `ĐẠT` và `Tất cả đạt`. Push xong thì báo A |
| 09:15 | CP1 | Xem mục "Điểm kiểm tra". B vẫn đang làm B5 |
| 09:25–09:50 | B6, D1 đến D3 | Deploy với `VISION_MOCK=1`, `node test/smoke.js $URL` ra 6/6 `ĐẠT`. Báo URL cho A và C |
| 09:50–10:15 | B6, D4 đến D6 | Bật Gemini và Safe Browsing thật. `/health` có `vision: on`. A mở trang giả qua extension, log Cloud Run có `v=vietcombank`. Lỗi Gemini thì B chạy `node test/try-gemini.js <ảnh>` |
| 10:15–10:45 | Sửa lỗi | Làm nóng server bằng vài request trước giờ quay |
| 10:45–11:20 | C3 | Đọc lời phần giải pháp |
| 11:20–11:30 | Tag | Kiểm trên GitHub đủ file `server/` |

B4 chỉ phụ thuộc B1 và sửa nhóm file khác B2, B3, nên chạy song song ở tab terminal thứ hai. Nếu B không theo nổi hai phiên thì C trông phiên B4 (đọc màn hình, duyệt lệnh nghiệm thu theo bảng "Khi agent đòi quyền chạy lệnh"), nhưng B vẫn là người kiểm lại và commit B4.

### C, dữ liệu, đo lường, video

| Giờ | Mã | Xong khi nào |
| --- | --- | --- |
| 07:30–07:45 | 00 | Repo đã pull, kiểm tag `pre-event` |
| 07:45–08:10 | C1 | Chrome demo mở được cả 4 trang demo, extension nạp xong |
| 08:10–08:30 | C3 (soạn lời) | Lời đọc điền xong mọi chỗ `[...]` trừ số liệu đo |
| 08:30–08:50 | C2 | Cần B1 và B2 đã push (B2 xong khoảng 08:20). `node eval/run_eval.js` ra `TP 11, FP 0, TN 15, FN 2` |
| 08:50–09:15 | Chuẩn bị bản nháp | Sắp màn hình, slide, lời đọc cho bản nháp video. Chưa có server thì dùng overlay của A1 (`vpSend`) |
| 09:15 | CP1 | Quay bản nháp video lần 1, xuất MP4 |
| 09:15–09:55 | Số liệu | Số eval cục bộ đã ghi vào slide và lời đọc |
| 09:55–10:15 | Eval qua API | Sau khi B báo URL Cloud Run: `node eval/run_eval.js --api <URL Cloud Run>` chạy xong 3 cấu hình. Sắp sẵn cửa sổ để quay |
| 10:15–10:45 | README, tập đọc | `README.md` có số đo thật, đọc lời video một lần có bấm giờ, dưới 2:00 |
| 10:45–11:20 | C3 | Video MP4 cuối, tối đa 3 lần quay |
| 11:20–12:00 | Nộp | Xem mục "Nộp bài" |

## Điểm kiểm tra

Luật cắt phạm vi đầy đủ nằm ở mục 09 của `KE-HOACH.md`. Dưới đây là bản rút gọn để tra nhanh.

### CP1 lúc 09:15

Bản nháp video lúc 09:15 chỉ có overlay dựng bằng `vpSend` của A1, vì A2 chỉ nghiệm thu với server sau 09:25.

- [ ] B1, B2, B3, B4 đã commit và push.
- [ ] B5 đang làm (dự kiến push khoảng 09:25).
- [ ] A1 đã push. Overlay hiện được trên trang VCB giả bằng `vpSend`, đúng cách kiểm của A1.
- [ ] A2 đã viết xong code và qua mục "Tự kiểm trước khi báo xong". Nghiệm thu với server làm sau khi B5 push.
- [ ] C1: 4 trang demo mở được trên Chrome demo.
- [ ] C2: eval cục bộ ra `TP 11, FP 0, TN 15, FN 2`.
- [ ] C đã quay bản nháp video lần 1 và mở thử được file. Chưa có server thì quay overlay của A1 bằng `vpSend`.

Nếu không đạt:

- B4 chưa push: B dồn sức cho B4 rồi mới sang B5. Phần thử Gemini thật dời sang B6.
- Server của B chưa xong lúc A2 viết xong: A tiếp tục thử overlay bằng kết quả giả, chưa cắt gì.
- Khi B5 đã push: A `git pull` rồi tự chạy server mock trên máy mình bằng `$env:VISION_MOCK="1"; node server/src/index.js`, không phụ thuộc mạng tới máy B.
- Bản nháp video: vẫn quay bằng phần đang chạy được, kể cả chỉ có sơ đồ và overlay từ `vpSend`. Mục tiêu là luôn có một file nộp được.

### MDP lúc 09:55

- [ ] URL Cloud Run trả `/health` với `ok: true`.
- [ ] `API_BASE` của extension đã trỏ tới URL Cloud Run.
- [ ] Kịch bản 1: `vietcombank.com.vn` hiện huy hiệu xanh.
- [ ] Kịch bản 2: `vietcombank-xacthuc.top` phủ đỏ, có lý do tiếng Việt, nút "Về trang chính thức" bấm được.
- [ ] Kịch bản 3: `vneid-capnhat.cc` phủ đỏ với lý do OTP và VNeID.

Ghi chú cho video: đội cân nhắc thêm cảnh `http://xacthuc-taikhoan.com:8080/`. Đây là trang duy nhất chứng minh Gemini bắt được thứ heuristic bỏ sót. Heuristic chấm thấp vì tên miền không chứa tên ngân hàng, còn bản đầy đủ có Gemini ra DANGER 85. Chỉ thêm khi Gemini thật đã chạy ổn ở B6 phần D6 và video vẫn dưới 2:00.

Nếu không đạt, đi theo cây sau:

```text
Deploy (B6 phần D1 đến D3) tới 09:50 vẫn chưa xong?
  Có: chuyển sang server local cho video, nói rõ trong video và README.
      B deploy tiếp sau khi quay.
Ba kịch bản chưa chạy hết lúc 09:55?
  Có: bỏ A3, bỏ eval qua API.
      B và C dồn vào ghép nối với A.
```

### CP2 lúc 10:15, đóng băng tính năng

- [ ] Mọi người đã push, `git log origin/main --oneline` có commit của cả 3 người.
- [ ] Chạy lại 3 kịch bản trên Chrome demo, cả 3 đúng.
- [ ] B: `npm test` trong `server/` đạt toàn bộ.
- [ ] C: có số eval, ít nhất là số của chế độ cục bộ.
- [ ] Từ giờ này không thêm tính năng. Chỉ commit sửa lỗi.

Nếu không đạt:

```text
Gemini thật (B6 phần D4 đến D6) vẫn lỗi hoặc chậm lúc 10:15?
  Có: chạy với kết quả degraded từ heuristic, nói thẳng trong video.
Eval qua API chưa chạy?
  Có: chỉ dùng số của chế độ cục bộ, vẫn nêu cỡ mẫu 28 URL.
Cần cắt thêm?
  Cắt theo thứ tự: dashboard, RDAP, log Firestore, nút Báo cáo,
  popup, eval qua API, banner SUSPICIOUS.
  Không cắt: overlay DANGER, lý do tiếng Việt, video.
```

### Giờ quay lúc 10:45

- [ ] Server (Cloud Run hoặc local) đã được làm nóng bằng vài request.
- [ ] Chrome demo mở sẵn, phóng to 125%, chỉ còn tab cần quay.
- [ ] Thông báo hệ thống đã tắt (Windows: bật Do not disturb).
- [ ] Console Cloud Run mở sẵn ở trang log của service.
- [ ] Bảng số đo và tên đội đã sẵn ở một cửa sổ.
- [ ] Micro đã thử, nghe lại 10 giây đầu.

Nếu không đạt: vẫn bắt đầu quay lúc 10:45. Không lùi giờ. Phần nào hỏng thì bỏ cảnh đó, nói thẳng trong lời đọc. Quy trình quay chi tiết ở `.agent/workflows/c3-video.md`.

## Quy ước Git trong ngày

### Cả đội cùng làm trên `main`

Ba người sửa ba thư mục tách biệt: A sửa `extension/`, B sửa `server/`, C sửa `eval/`, `scripts/`, `demo-sites/`, `docs/`. Hai người không bao giờ sửa cùng một file, nên `git pull --rebase` luôn tự ghép được mà không xung đột. Làm chung `main` còn bỏ được bước merge lúc CP2 và giúp mentor xem tiến độ ngay ở nhánh chính. Mở nhánh riêng thì phải merge giữa giờ căng nhất, và một lần merge hỏng có thể mất 15 phút.

Quy tắc đi kèm:

- Chỉ `git add <file cụ thể>`. Không dùng `git add -A` hay `git add .`.
- Trước mỗi lần push đều chạy `git pull --rebase`.
- `docs/API.md` và `shared/` chỉ sửa sau khi báo cả đội trong nhóm Zalo.
- `README.md` ở gốc repo do C sửa.

### Tần suất

Commit ngay sau mỗi bước nghiệm thu đạt, và push ngay sau commit. Nếu một bước kéo dài quá 30 phút thì vẫn commit phần đang chạy được, để mentor thấy tiến độ.

### Lệnh và mẫu thông điệp

```powershell
git status --short
git add server/src/heuristics.js server/test/heuristics.test.js
git commit -m "feat(server): heuristic tên miền [B2]"
git pull --rebase
git push
```

| Loại việc | Mẫu thông điệp |
| --- | --- |
| Xong một bước | Lấy đúng dòng ở cuối file bước, ví dụ `feat(server): heuristic tên miền [B2]` |
| Sửa lỗi sau nghiệm thu | `fix(extension): overlay không nhận focus [A1]` |
| Tài liệu, số đo | `docs: số đo eval cục bộ [C2]` |
| Bằng chứng quá trình | `docs(process): ảnh chụp bắt đầu 07:30` |

Nếu `git push` bị từ chối vì người khác vừa push, chạy lại `git pull --rebase` rồi `git push`.

### Tag cuối buổi

Người gắn tag: A, lúc 11:20, sau khi cả 3 người xác nhận đã push xong.

```powershell
git pull --rebase
git tag v1.0-demo
git push origin main
git push origin v1.0-demo
```

Nếu phải sửa lỗi sau khi đã gắn tag mà vẫn trước 11:30, gắn lại tag:

```powershell
git tag -f v1.0-demo
git push -f origin v1.0-demo
```

## Nộp bài từ 11:20 đến 12:00

- [ ] 11:20: cả 3 người đã push. A gắn tag `v1.0-demo` và push tag.
- [ ] Mở trang GitHub của repo trong cửa sổ ẩn danh: thấy đủ `extension/`, `server/`, `eval/`, `README.md`, và tag `v1.0-demo`.
- [ ] `README.md` có số đo thật và link video.
- [ ] Nếu IDE Antigravity có chức năng xuất artifact thì lưu vào `docs/process/`. Dùng CLI thì lưu ảnh chụp màn hình các phiên agent vào đó.
- [ ] File video MP4 dài không quá 2:00, mở xem được, có tiếng.
- [ ] Video đã tải lên theo hình thức BTC yêu cầu: [hình thức nộp video, C điền sau khi đọc lại Sổ tay Thí sinh].
- [ ] Link video mở được trong cửa sổ ẩn danh, không đòi đăng nhập.
- [ ] 11:30 đến 12:00: một người nộp link GitHub và link video. Một người khác mở lại cả hai link ở cửa sổ ẩn danh.
- [ ] Chụp màn hình xác nhận đã nộp, gửi vào nhóm Zalo của đội có mentor.
- [ ] Không push gì thêm sau giờ nộp.

## Việc phải xong trước ngày thi

### Cả đội

- [ ] Tạo repo GitHub, `git remote add origin <URL repo>`, push `main`.
- [ ] Node >= 22 trên cả 3 laptop: `node --version`.
- [ ] Cài Antigravity, đăng nhập, chạy `agy models` thấy có `gemini-4-argon-medium`.
- [ ] Chạy thử một bước trên bản sao bỏ đi của repo để quen tay:

```powershell
Copy-Item -Recurse D:\vietphish-lens $env:TEMP\vp-thu
cd $env:TEMP\vp-thu
agy --model gemini-4-argon-medium --mode accept-edits -i "Đọc AGENTS.md rồi làm đúng theo .agent/workflows/b1-official-reasons.md. Chỉ làm bước này. Không chạy git commit, người sẽ tự commit."
```

  Xong thì ghi lại thời gian chạy, số lần agent xin quyền, có đạt nghiệm thu không. Sau đó xóa bản sao bằng `Remove-Item -Recurse -Force $env:TEMP\vp-thu`. Không mang code của lần thử này vào repo thi.

- [ ] Hỏi mentor qua nhóm Zalo bốn câu, ghi câu trả lời vào đây:
  1. Backend chạy Cloud Functions for Firebase gen2 có được tính là "triển khai trên Google Cloud Run" không? Trả lời: [...]
  2. Antigravity có bắt buộc không? Trả lời: [...]
  3. Mức chi tiết của `docs/PREBUILT.md` và các file prompt trong `.agent/workflows/` có ổn với giới hạn 30% không? Trả lời: [...]
  4. Repo GitHub để public, hay để private rồi mời mentor vào? Nếu private thì mời tài khoản GitHub nào? Trả lời: [...]
- [ ] Gửi `docs/PREBUILT.md` cho mentor.
- [ ] Gắn tag ranh giới trước 07:30 ngày 14/11:

```powershell
git status --short
git tag pre-event
git push origin main
git push origin pre-event
```

### A

- [ ] Trên đúng laptop demo, Load unpacked thư mục `extension/` qua `chrome://extensions` thành công, console service worker in "hello".
- [ ] Chạy `pwsh -File scripts\chrome-demo.ps1` trên laptop demo. Với `node demo-sites/serve.js` đang chạy, mở được `http://vietcombank-xacthuc.top:8080/`.
- [ ] Chuẩn bị phương án Chrome for Testing nếu Chrome bản thường có vấn đề (xem `.agent/workflows/c1-moi-truong-demo.md`).
- [ ] Đọc `docs/DEBUG-CHROME.md` một lượt.

### B

- [ ] Lấy Gemini API key ở AI Studio. Lấy key Safe Browsing ở Google Cloud Console. Không ghi key vào file nào trong repo.
- [ ] Gọi Gemini thật một lần bằng key vừa lấy, ghi lại model id đã dùng và thời gian phản hồi.
- [ ] Gọi Safe Browsing thật một lần với URL thử của Google `http://testsafebrowsing.appspot.com/s/phishing.html`, thấy có kết quả trùng.
- [ ] Cài Google Cloud CLI, `gcloud auth login`, tạo project, bật billing, đặt cảnh báo ngân sách.
- [ ] Deploy thử khung `/health` lên Cloud Run, mở URL thấy `{"ok":true}`. Ghi lại lệnh đã chạy được và URL.
- [ ] Ghi lại cách đặt `GEMINI_API_KEY` và `SAFE_BROWSING_KEY` cho service Cloud Run, để bước B6 làm nhanh.

### C

- [ ] Thử phần mềm quay màn hình có thu tiếng trên laptop demo. Quay 30 giây, xuất MP4, mở lại nghe được tiếng.
- [ ] Chạy thử toàn bộ `.agent/workflows/c1-moi-truong-demo.md` trên laptop demo.
- [ ] Chọn một vụ lừa đảo thật đã lên báo cho đoạn mở đầu video. Lưu link bài báo và ngày đăng.
- [ ] Chuẩn bị sẵn số liệu NCSC kèm link nguồn.
- [ ] Soạn trước khung slide và sơ đồ 4 lớp dạng ảnh để chèn vào video.

## Chưa kiểm chứng

Những điều dưới đây chưa ai làm thật, nên phải coi là rủi ro cho tới khi đội tự thử:

| Điều | Trạng thái | Ai kiểm, khi nào |
| --- | --- | --- |
| Gọi Gemini thật | Bản tham chiếu chỉ chạy bằng vision mock, chưa có key | B, trước ngày thi |
| Safe Browsing thật | Chưa thử với key thật | B, trước ngày thi |
| Deploy lên Cloud Run | Chưa deploy lần nào | B, trước ngày thi |
| Chrome bản thường trên laptop demo, Load unpacked bằng tay, `--host-resolver-rules` | Bản tham chiếu chỉ thử bằng Chrome for Testing | A, trên đúng laptop demo |
| Model Gemini trong Antigravity có làm theo được các file prompt không | Chưa thử. Các file prompt được viết từ bản tham chiếu, chưa có lượt agent Gemini nào chạy theo | Cả đội, ở buổi diễn tập |
| Gọi workflow bằng dấu gạch chéo trong IDE Antigravity | Chưa thử | Ai dùng IDE thì thử ở buổi diễn tập |
