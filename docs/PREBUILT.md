# Những gì đã làm trước ngày thi

Quy định của BTC: dự án mang vào chỉ được hoàn thiện tối đa 30%, phần còn lại build trong ngày thi 14/11/2026.

File này liệt kê toàn bộ những gì có trong repo trước 07:30 ngày 14/11/2026. Mốc phân ranh là tag `pre-event`. Mọi commit sau tag đó được viết trong giờ thi.

```bash
git log pre-event --oneline          # những gì làm trước
git log pre-event..HEAD --oneline    # những gì làm trong ngày thi
git diff pre-event..HEAD --stat      # khối lượng code viết trong ngày thi
```

## Đã có trước ngày thi

| Nhóm | File | Nội dung |
| --- | --- | --- |
| Dữ liệu | `shared/official_domains.json` và 2 bản sao ở `server/data/`, `extension/` | Whitelist 16 thương hiệu, kiểm tay từng tên miền |
| Dữ liệu | `eval/domains.csv` | 28 URL có nhãn, phần trang giả do đội tự đặt tên, không phải trang lừa đảo thật |
| Dữ liệu | `server/test/vectors/whitelist.json`, `heuristics.json`, `fusion.json`, `api.json` | Bảng đầu vào và kết quả mong đợi (18, 23, 13 và 6 mục), dùng để nghiệm thu code viết trong ngày thi |
| Trang demo | `demo-sites/vcb-fake/`, `demo-sites/vneid-fake/`, `demo-sites/news-demo/`, `demo-sites/serve.js` | 3 trang HTML tĩnh có watermark "TRANG DEMO", form không gửi đi đâu. `serve.js` khoảng 30 dòng phục vụ 3 trang này trên 4 tên miền giả ở cổng 8080 (trang VCB giả dùng cho cả `vietcombank-xacthuc.top` và `xacthuc-taikhoan.com`) |
| Khung rỗng | `extension/manifest.json`, `extension/background.js` | Service worker chỉ in "hello" |
| Khung rỗng | `server/src/index.js`, `server/package.json`, `server/package-lock.json` | Chỉ có `GET /health`. Khai 3 dependency `tldts`, `fastest-levenshtein`, `@google/genai` và script `npm test` |
| Cấu hình | `server/.gcloudignore` | Danh sách file bỏ qua khi upload `server/` lên Cloud Run, đúng 5 dòng. Lệnh deploy B chạy tay trong ngày thi theo `.agent/workflows/b6-deploy-cloud-run.md`, key không vào repo |
| Cấu hình | `package.json` ở gốc repo, `.gitignore` | Script tắt để chạy server, trang demo và test. `.gitignore` chặn `node_modules`, file `.env`, `*.env.yaml` chứa key, kết quả eval và file video |
| Thiết kế | `docs/REQUIREMENTS.md`, `docs/tasks/A.md`, `B.md`, `C.md`, `.agent/skills/vietphish/SKILL.md` | Yêu cầu sản phẩm, việc và câu lệnh cho từng người, kiến thức dự án cho agent. Không có code |
| Thiết kế | `docs/KHAC-BIET.md`, `docs/TASKS.md` | Kế hoạch điểm khác biệt so với ChongLuaDao và J2TEAM, và bảng chia việc ngày thi. Không có code |
| Thiết kế | `docs/API.md` | Hợp đồng giữa extension và server |
| Thiết kế | `docs/KE-HOACH.md` | Kế hoạch của đội |
| Thiết kế | `docs/NGAY-THI.md`, `AGENTS.md`, 15 file trong `.agent/workflows/` (`00-khoi-dong`, A1 đến A5, B1 đến B6, C1 đến C3) | Lịch ngày thi và đặc tả từng bước để giao cho agent Antigravity |
| Công cụ demo | `scripts/chrome-demo.ps1` | Mở Chrome riêng, trỏ 4 tên miền demo về `127.0.0.1`. Chỉ dựng môi trường demo, không có logic sản phẩm |
| Tài liệu | `README.md` | Giới thiệu sản phẩm cho mentor và BTC; mục kết quả đo và video để trống, điền trong ngày thi |
| Tài liệu | `docs/DEBUG-CHROME.md` | Cách debug extension trong Chrome |

## Chưa có, viết trong ngày thi

| Phần | File |
| --- | --- |
| Whitelist và mẫu lý do tiếng Việt | `server/src/official.js`, `server/src/reasons.js` |
| Heuristic tên miền | `server/src/heuristics.js` |
| Công thức gộp điểm và luật cứng | `server/src/fusion.js` |
| Gọi Gemini và Safe Browsing | `server/src/vision.js`, `server/src/safebrowsing.js` |
| Điều phối và endpoint `/analyze` | `server/src/analyze.js`, phần còn lại của `server/src/index.js` |
| Unit test, smoke test và công cụ thử Gemini | `server/test/*.test.js`, `server/test/smoke.js`, `server/test/try-gemini.js` |
| Đọc tín hiệu trang và overlay cảnh báo | `extension/content.js` |
| Luồng kiểm tra, chụp màn hình, huy hiệu | `extension/background.js`, `extension/config.js` |
| Popup và chế độ demo offline | `extension/popup.html`, `extension/popup.js`, `extension/demo-cache.json` |
| Script đo | `eval/run_eval.js` |
| Bằng chứng quá trình | `docs/process/` (ảnh chụp lúc bắt đầu, artifact Antigravity) |

Toàn bộ logic phát hiện, giao diện cảnh báo và script đo đều nằm ở bảng này.

**Đo ngày 14/11/2026:** code có sẵn trước giờ thi là 73 dòng (`server/src/index.js` chỉ có `/health`, `extension/background.js` in "hello", `demo-sites/serve.js`, `scripts/chrome-demo.ps1`), khoảng 4,5% so với 1.637 dòng của một bản cài đặt đầy đủ cùng phạm vi. Phần còn lại trong repo là dữ liệu, trang demo tĩnh và tài liệu đặc tả.

## Điều cần nói rõ với mentor

Đội có một bản chạy thử viết từ tháng 10 để kiểm chứng ý tưởng. Bản đó **không nằm trong repo này** và không được chép vào. Từ bản chạy thử, đội rút ra đặc tả từng bước trong `.agent/workflows/`. Đặc tả mô tả thuật toán bằng lời, hằng số, chữ ký hàm và bảng kết quả mong đợi. Code được agent Antigravity viết lại trong giờ thi theo đặc tả đó.

Đội chủ động khai phần đặc tả này vì nó chi tiết hơn một bản thiết kế thông thường. Nếu mentor cho rằng mức chi tiết này vượt giới hạn 30%, đội sẽ rút gọn theo hướng dẫn trước ngày thi.

## Kiểm tra trước khi gắn tag

- [ ] `git status` sạch, không có file code logic nào ngoài hai khung rỗng.
- [ ] `node server/src/index.js` chạy, `GET /health` trả `{"ok":true}`.
- [ ] Load unpacked thư mục `extension/` thành công, console của service worker in "hello".
- [ ] Đã gửi file này cho mentor qua nhóm Zalo.
- [ ] `git tag pre-event && git push origin pre-event` trước 07:30 ngày 14/11/2026.
