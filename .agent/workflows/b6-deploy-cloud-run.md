---
description: B6 - Deploy server lên Google Cloud Run (người chạy lệnh)
---

# B6. Deploy lên Cloud Run

> [!WARNING]
> **Các lệnh trong file này CHƯA được chạy kiểm chứng.** Người viết không có quyền vào Google Cloud. Tên lệnh và tên cờ lấy theo tài liệu `gcloud` mà người viết biết, có thể đã đổi. B phải **diễn tập toàn bộ mục "Việc phải làm trước ngày thi"** trên máy sẽ dùng ngày thi, và sửa lại file này theo những gì thấy thật. Gặp cờ nào bị báo `unrecognized arguments` thì kiểm bằng `gcloud run deploy --help`, không đoán.

**Người làm:** B chạy lệnh. Agent chỉ giúp đọc lỗi và tra bảng, không tự chạy lệnh deploy. **Thời gian dự kiến:** 20 phút trong ngày thi nếu đã diễn tập (riêng bước build mất 3 đến 5 phút). **Phụ thuộc:** B5 đã đạt nghiệm thu.

## Mục tiêu

Đưa thư mục `server/` lên Google Cloud Run để extension trên máy demo, máy mentor và máy giám khảo đều gọi được. Kết quả cuối là một URL dạng `https://vietphish-lens-xxxxx.asia-southeast1.run.app`, đã qua smoke test, và đã báo cho A.

## File được sửa

- `server/.gcloudignore` đã có sẵn trong repo (làm trước ngày thi), không phải tạo lại. Chỉ cần kiểm nội dung.
- Chỉ còn `deploy.env.yaml` là tạo trong ngày thi, ở **gốc repo** (chứa key, đã bị `.gitignore` chặn bởi mẫu `*.env.yaml`, **không commit**)

Không sửa code trong `server/src/`.

## Biến môi trường của server

| Biến | Giá trị khi deploy | Ghi chú |
| --- | --- | --- |
| `PORT` | Không đặt | Cloud Run tự đặt, thường là 8080. Server đọc `process.env.PORT` |
| `VISION_MOCK` | `1` ở lần deploy đầu, bỏ đi ở lần sau | `1` thì đoán thương hiệu từ tiêu đề, không gọi Gemini |
| `GEMINI_API_KEY` | Key lấy từ AI Studio | Thiếu thì lớp nhìn ảnh tắt, `/health` báo `vision: off` |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite`, hoặc model đã thử chạy tốt ở B4 | `/health` in tên model đang dùng |
| `SAFE_BROWSING_KEY` | Key Safe Browsing | Thiếu thì `layers.safeBrowsing` là `skipped` |

## Nội dung `server/.gcloudignore`

`gcloud` chỉ tự sinh file bỏ qua từ `.gitignore` nằm **trong** thư mục được upload. Thư mục `server/` không có `.gitignore` riêng, nên thiếu file này thì cả `node_modules` bị upload. File này đã có sẵn trong repo với đúng 5 dòng:

```text
.gcloudignore
node_modules/
.env
.env.*
*.log
```

Build trên Cloud Build tự chạy `npm ci` từ `package-lock.json`, nên không cần upload `node_modules`.

## Việc phải làm trước ngày thi

Làm trên đúng máy sẽ mang đi thi, chậm nhất tối 13/11. Mỗi bước có kết quả mong đợi và cách xử lý khi lỗi. Mở PowerShell mới cho mỗi lần cài phần mềm, để PATH được nạp lại.

### Bước T1. Cài Google Cloud CLI

```powershell
winget install --id Google.CloudSDK -e
```

Mở cửa sổ PowerShell mới rồi chạy `gcloud --version`.

- **Mong đợi:** in dòng `Google Cloud SDK <phiên bản>`.
- **Nếu lỗi:** `winget` không tìm thấy gói thì tải bộ cài từ `https://cloud.google.com/sdk/docs/install`, chọn Windows. Báo `gcloud is not recognized` thì đóng hết PowerShell, mở lại. Báo `running scripts is disabled on this system` thì gọi `gcloud.cmd` thay cho `gcloud` ở mọi lệnh, hoặc chạy `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (hỏi cả đội trước khi đổi).

### Bước T2. Đăng nhập

```powershell
gcloud auth login
```

- **Mong đợi:** trình duyệt mở trang đăng nhập Google. Đăng nhập xong, terminal in `You are now logged in as [...]`.
- **Nếu lỗi:** trình duyệt không mở thì chép link in trong terminal sang trình duyệt.

### Bước T3. Tạo project

Project ID phải duy nhất trên toàn Google, dài 6 đến 30 ký tự, chỉ gồm chữ thường, số và gạch ngang. Thêm số ngẫu nhiên vào cuối.

```powershell
$PROJECT = "vietphish-lens-1411"
gcloud projects create $PROJECT --name "VietPhish Lens"
gcloud config set project $PROJECT
```

- **Mong đợi:** `Create in progress for [...]` rồi `Updated property [core/project]`.
- **Nếu lỗi:** báo ID đã có người dùng thì đổi số cuối. Tài khoản trường hay công ty bị cấm tạo project thì dùng tài khoản Gmail cá nhân.

### Bước T4. Gắn billing

Cloud Run và Cloud Build cần project có tài khoản thanh toán, kể cả khi dùng hạn mức miễn phí hay credit của sự kiện.

```powershell
gcloud billing accounts list
gcloud billing projects link $PROJECT --billing-account 0X0X0X-0X0X0X-0X0X0X
```

Thay `0X0X0X-...` bằng giá trị cột `ACCOUNT_ID` của lệnh đầu.

- **Mong đợi:** lệnh hai in `billingEnabled: true`.
- **Nếu lỗi:** danh sách rỗng nghĩa là chưa có tài khoản thanh toán, tạo ở `https://console.cloud.google.com/billing` (cần thẻ, hoặc mã credit của BTC). Lệnh `billing projects link` không có thì làm bằng giao diện: Console, chọn project, mục Billing, "Link a billing account".

### Bước T5. Bật API cần thiết

```powershell
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com safebrowsing.googleapis.com
gcloud config set run/region asia-southeast1
```

- **Mong đợi:** `Operation ... finished successfully.` Có thể mất 1 đến 2 phút.
- **Nếu lỗi:** báo cần billing thì quay lại T4.

### Bước T6. Lấy hai key

1. **Gemini:** vào `https://aistudio.google.com`, mục "Get API key", tạo key. Thử key ngay bằng mục "Thử với Gemini thật" của B4 (`node test/try-gemini.js`).
2. **Safe Browsing:** vào Console của project, mục "APIs & Services", "Credentials", "Create credentials", "API key". Sửa key, phần "API restrictions" chọn "Safe Browsing API".

Lưu hai key vào trình quản lý mật khẩu, không dán vào file nào trong repo, không gửi qua nhóm chat.

### Bước T7. Kiểm `server/.gcloudignore` đã có

File đã có sẵn trong repo. Chỉ kiểm file tồn tại và đúng 5 dòng như mục trên, không tạo lại.

### Bước T8. Deploy thử khung `/health`

Làm với khung rỗng hiện có (`server/src/index.js` chỉ có `/health`, đã đọc `process.env.PORT`):

```powershell
cd D:\vietphish-lens\server
gcloud run deploy vietphish-lens --source . --region asia-southeast1 --allow-unauthenticated
```

- **Mong đợi:**
  1. Lần đầu có câu hỏi tạo kho Artifact Registry tên `cloud-run-source-deploy`. Gõ `Y`.
  2. Có thể có câu hỏi bật thêm API. Gõ `Y`.
  3. Dòng `Building using Buildpacks and deploying container...`, chờ 3 đến 5 phút.
  4. Cuối cùng in `Service URL: https://vietphish-lens-....asia-southeast1.run.app`.
- **Kiểm:**

```powershell
$URL = gcloud run services describe vietphish-lens --region asia-southeast1 --format "value(status.url)"
Invoke-RestMethod "$URL/health"
```

  Phải in `ok` là `True`.
- **Nếu lỗi:** tra bảng "Lỗi thường gặp" bên dưới. Ghi lại câu lỗi thật và cách đã sửa vào cuối file này.

### Bước T9. Diễn tập phương án lùi

1. Cài `cloudflared`: `winget install --id Cloudflare.cloudflared -e`. Mở PowerShell mới, chạy `cloudflared --version`.
2. Chạy server khung ở cổng 8787: `cd D:\vietphish-lens\server; node src/index.js`.
3. Ở cửa sổ khác: `cloudflared tunnel --url http://127.0.0.1:8787`. Mong đợi: sau vài giây in một địa chỉ `https://<chữ-ngẫu-nhiên>.trycloudflare.com`.
4. Mở địa chỉ đó thêm `/health` trên điện thoại (tắt Wi-Fi để đi đường khác). Phải thấy `{"ok":true}`.

### Bước T10. Hạ chi phí sau diễn tập

`--min-instances 1` giữ một máy chạy liên tục và tính tiền cả khi không có request. Diễn tập xong thì xóa service, ngày thi deploy lại:

```powershell
gcloud run services delete vietphish-lens --region asia-southeast1
```

## Trong ngày thi

Làm sau khi B5 đạt nghiệm thu, theo lịch trong `docs/NGAY-THI.md`: phần D1 đến D3 (deploy với mock, smoke 6/6) từ 09:25 đến 09:50, phần D4 đến D6 (bật Gemini thật, thử qua extension, `try-gemini.js`) từ 09:50 đến 10:15. Nếu tới **09:50** vẫn chưa có URL chạy được thì dừng, chuyển sang "Phương án lùi".

### Bước D1. Chuẩn bị biến trong PowerShell

```powershell
cd D:\vietphish-lens\server
$PROJECT = "vietphish-lens-1411"
$REGION = "asia-southeast1"
$SERVICE = "vietphish-lens"
gcloud config set project $PROJECT
npm test
```

- **Mong đợi:** `npm test` ra `# pass 96` và `# fail 0`. Thiếu thì chưa deploy, quay lại B5.

### Bước D2. Deploy lần 1 với vision mock

Lần 1 không cần key. Mục đích là kiểm đường ống deploy và để smoke so được điểm chính xác.

```powershell
gcloud run deploy $SERVICE --source . --region $REGION --allow-unauthenticated --min-instances 1 --set-env-vars VISION_MOCK=1
```

- **Mong đợi:** như bước T8, cuối cùng in `Service URL: ...`.
- **Nếu lỗi:** tra bảng "Lỗi thường gặp".

### Bước D3. Smoke với URL thật

```powershell
$URL = gcloud run services describe $SERVICE --region $REGION --format "value(status.url)"
$URL
node test/smoke.js $URL
```

- **Mong đợi:** dòng đầu là `health: {"ok":true,"vision":"mock","safeBrowsing":"off","model":"gemini-3.5-flash-lite"}`, sáu dòng `ĐẠT` giống hệt nghiệm thu B5, dòng cuối `Tất cả đạt`.
- **Nếu lỗi:** `fetch failed` thì kiểm lại `$URL` có bắt đầu bằng `https://` không. Có dòng `SAI` thì code trên Cloud Run khác code local; chạy lại `npm test` local rồi deploy lại.

### Bước D4. Bật Gemini và Safe Browsing

Tạo file `D:\vietphish-lens\deploy.env.yaml` (gốc repo, **ngoài** thư mục `server/`):

```yaml
GEMINI_API_KEY: "dán-key-gemini"
SAFE_BROWSING_KEY: "dán-key-safe-browsing"
GEMINI_MODEL: "gemini-3.5-flash-lite"
```

Nếu ở B4 phải đổi model thì ghi đúng model đã chạy tốt. Rồi cập nhật service, không cần build lại:

```powershell
gcloud run services update $SERVICE --region $REGION --env-vars-file ..\deploy.env.yaml
```

Cờ `--env-vars-file` **thay toàn bộ** biến môi trường cũ bằng nội dung file, nên `VISION_MOCK` bị xóa luôn. Đây là điều mình muốn.

- **Mong đợi:** in `Deploying...` rồi `Done.` cùng tên revision mới. Mất khoảng 30 giây.
- **Kiểm:** `git status --short` không được có dòng `deploy.env.yaml`. Có thì dừng lại, hỏi cả đội.

### Bước D5. Kiểm lại

```powershell
Invoke-RestMethod "$URL/health"
node test/smoke.js $URL
```

- **Mong đợi `/health`:** `vision` là `on`, `safeBrowsing` là `on`, `model` đúng tên đã đặt.
- **Mong đợi smoke:** 3 dòng `ĐẠT` (kịch bản 1, 2, 5) và 3 dòng `SAI` (kịch bản 3, 4, 6) đều có `degraded=true`, dòng cuối `3 mục sai`. **Đây là kết quả đúng.** Smoke không gửi ảnh, nên khi vision là `on` thì lớp nhìn ảnh không chạy và ba trang giả chỉ còn điểm heuristic: SUSPICIOUS 60, SUSPICIOUS 50, SAFE 20. Lớp nhìn ảnh chỉ kiểm được qua extension, vì extension gửi ảnh chụp thật.

### Bước D6. Kiểm Gemini thật qua extension và log

Nhờ A mở trang `vietcombank-xacthuc.top` bằng extension đã trỏ về `$URL`. Rồi xem log:

```powershell
gcloud run services logs read $SERVICE --region $REGION --limit 30
```

- **Mong đợi:** có dòng dạng `[DANGER 100] http://vietcombank-xacthuc.top:8080/ (ảnh 25KB) wl=false sb=clean h=60 v=vietcombank 2100ms`.
- **Nếu `v=lỗi`:** lớp Gemini hỏng. Chạy `node test/try-gemini.js D:\vcb.png` trên máy local với cùng key và model, rồi tra bảng chẩn đoán của B4.
- **Nếu `sb=error`:** key Safe Browsing sai hoặc chưa bật API. Không ảnh hưởng demo vì trang giả của đội không nằm trong danh sách của Google. Sửa sau nếu còn giờ.
- **Nếu lệnh `logs read` không có:** thử `gcloud beta run services logs read ...`, hoặc xem log trên Console, mục Cloud Run, chọn service, tab "Logs".

### Bước D7. Báo URL cho A và C

Gửi vào nhóm, đúng mẫu:

```text
[B6] Server Cloud Run đã chạy: <dán $URL>
/health: vision on, safeBrowsing on, model <tên model>
Smoke: 6/6 với mock, 3/6 khi bật Gemini (đúng thiết kế vì smoke không gửi ảnh)
A: đổi API_BASE trong config của extension sang URL này, giữ http://127.0.0.1:8787 làm phương án lùi
C: chạy node eval/run_eval.js --api <URL>
```

## Lỗi thường gặp

Bảng này dựa trên hiểu biết chung về Cloud Run, **chưa gặp thật**. Câu lỗi thật có thể khác chữ.

| Triệu chứng | Nguyên nhân có thể | Cách xử lý |
| --- | --- | --- |
| `unrecognized arguments: --min-instances` hoặc cờ khác | `gcloud` cũ, hoặc tên cờ đã đổi | `gcloud components update`, rồi kiểm tên cờ bằng `gcloud run deploy --help` |
| `Billing account ... is not found` hoặc `billing must be enabled` | Project chưa gắn billing | Làm lại bước T4 |
| `API [run.googleapis.com] not enabled` | Chưa bật API | Gõ `Y` khi được hỏi, hoặc làm lại bước T5 |
| Build fail, log nhắc thiếu quyền của service account (`PERMISSION_DENIED`, `storage.objects.get`, `artifactregistry`) | Service account mặc định mà Cloud Build dùng thiếu quyền, hay gặp ở project mới | Cấp quyền build cho service account trong câu lỗi. Thường là `$PN-compute@developer.gserviceaccount.com`, với `$PN = gcloud projects describe $PROJECT --format "value(projectNumber)"`. Lệnh: `gcloud projects add-iam-policy-binding $PROJECT --member "serviceAccount:$PN-compute@developer.gserviceaccount.com" --role roles/run.builder`. Tên role cần kiểm theo câu lỗi thật |
| Build fail ở `npm ci`, nhắc `package.json and package-lock.json are not in sync` | Lock file cũ | Trong `server/` chạy `npm install` (không kèm tên gói), rồi deploy lại |
| `Container failed to start and listen on the port defined by the PORT environment variable` | Server nghe sai cổng, nghe `127.0.0.1`, hoặc thoát ngay vì `isMain()` sai | Xem log revision: `gcloud run services logs read $SERVICE --region $REGION --limit 50`. Kiểm `index.js` nghe `process.env.PORT` trên `0.0.0.0`. Chạy thử local `$env:PORT="8080"; node src/index.js` |
| Log có `Cannot find module` | File thiếu trong bản upload, hoặc import thiếu đuôi `.js` | Kiểm `.gcloudignore` không chặn `src/` hay `data/`. Kiểm import trong `src/` có đuôi `.js` |
| Deploy xong nhưng mở URL ra 403 `Forbidden` | Bước cho phép truy cập công khai bị bỏ qua (có dòng cảnh báo `Setting IAM policy failed`) | `gcloud run services add-iam-policy-binding $SERVICE --region $REGION --member allUsers --role roles/run.invoker`. Tài khoản trường hay công ty có thể bị chính sách tổ chức chặn, khi đó dùng tài khoản Gmail cá nhân |
| `/health` trả `vision: off` sau bước D4 | Biến chưa vào, hoặc tên biến trong YAML gõ sai | `gcloud run services describe $SERVICE --region $REGION` xem phần env. Sửa YAML, chạy lại D4 |
| `/health` trả `vision: mock` sau bước D4 | `VISION_MOCK` còn sót | Chạy lại D4 bằng `--env-vars-file`, không dùng `--update-env-vars` |
| Request đầu tiên chậm vài giây | Máy đang khởi động | Đã có `--min-instances 1`. Kiểm lại bằng `gcloud run services describe` |
| Extension báo lỗi mạng hoặc CORS khi gọi URL Cloud Run | URL trong config extension sai, thiếu `https://`, hoặc thừa `/` cuối | Mở `$URL/health` trong Chrome của máy demo. Kiểm cấu hình của A |
| Nhiều request trả 429 | Cả đội đi chung một IP mạng hội trường, vượt 60 request mỗi phút | Chờ 1 phút. Eval của C tự chờ khi gặp 429 |

## Phương án lùi

Quyết định chậm nhất lúc **09:50** nếu deploy chưa xong, để A kịp trỏ extension và cả đội kịp MDP lúc 09:55. Nếu deploy xong mà Gemini thật vẫn hỏng lúc **10:15** thì giữ Cloud Run, chạy kết quả `degraded` hoặc đặt lại `VISION_MOCK=1` và nói rõ trong video.

**Phương án 1. Server local, quay video trên một máy.** Chắc chắn nhất, không cần mạng ngoài trừ Gemini.

```powershell
cd D:\vietphish-lens\server
$env:GEMINI_API_KEY="dán-key"
$env:SAFE_BROWSING_KEY="dán-key"
$env:GEMINI_MODEL="gemini-3.5-flash-lite"
Remove-Item Env:VISION_MOCK -ErrorAction SilentlyContinue
$env:PORT="8787"
node src/index.js
```

Extension giữ URL `http://127.0.0.1:8787`. Gemini cũng hỏng thì đặt `$env:VISION_MOCK="1"` và nói rõ trong video là đang chạy chế độ mock.

**Phương án 2. Tunnel từ máy local.** Khi giám khảo cần gọi server từ máy khác. Chạy server như phương án 1, rồi ở cửa sổ khác:

```powershell
cloudflared tunnel --url http://127.0.0.1:8787
```

Lấy địa chỉ `https://....trycloudflare.com` in ra, chạy `node test/smoke.js <địa chỉ>` để kiểm, rồi báo A như bước D7. Địa chỉ đổi mỗi lần chạy lại `cloudflared`, và chết khi tắt máy.

## Sau ngày thi

Hạ số máy chạy thường trực về 0 để không tốn tiền, hoặc xóa hẳn:

```powershell
gcloud run services update vietphish-lens --region asia-southeast1 --min-instances 0
gcloud run services delete vietphish-lens --region asia-southeast1
```

## Đã kiểm chứng và chưa kiểm chứng

| Nội dung | Trạng thái |
| --- | --- |
| Smoke trên server local với `VISION_MOCK=1` ra 6/6 | Đã chạy với bản tham chiếu ngày 11/11/2026 |
| Smoke trên server local có `GEMINI_API_KEY` ra 3 `ĐẠT`, 3 `SAI`, `degraded=true` | Đã chạy với bản tham chiếu ngày 11/11/2026 (key giả, smoke không gửi ảnh nên không gọi Gemini) |
| `.gitignore` gốc chặn `*.env.yaml` | Đã đọc file |
| Mọi lệnh `gcloud`, `winget`, `cloudflared` trong file này | **Chưa chạy**. B diễn tập và ghi lại kết quả |
| Buildpacks của Google tự chạy `npm ci` và `npm start` cho thư mục có `package.json` | **Chưa kiểm** |
| Cờ `--env-vars-file` thay toàn bộ biến cũ | **Chưa kiểm**. Xem `gcloud run services update --help` |
| Lệnh cấp quyền `roles/run.builder` | **Chưa kiểm**, chỉ dùng khi gặp lỗi quyền |

## Ghi chép diễn tập

B ghi vào đây sau khi diễn tập: ngày giờ, phiên bản `gcloud`, lệnh nào chạy khác file này, câu lỗi thật và cách sửa.

## Commit (người làm, agent không chạy)

Bước này không có gì để commit, vì `server/.gcloudignore` đã nằm trong repo từ trước. Không bao giờ `git add` file `deploy.env.yaml`.
