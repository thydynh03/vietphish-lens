# VietPhish Lens khác ChongLuaDao và J2TEAM Security ở đâu

Viết ngày 13/11/2026, trước ngày thi một ngày. Mục tiêu: khi giám khảo hỏi "extension của em hơn hai cái kia ở đâu", đội trả lời được bằng **một cơ chế cụ thể, một cảnh trong video, và một con số đo được**, không phải bằng tính từ.

Dữ kiện về hai đối thủ lấy từ `VietPhish_Demo/docs/SO-SANH-CHONGLUADAO-J2TEAM.md`. Báo cáo đó đọc mã nguồn `.crx` và thử thật ngày 12/11/2026.

## 1. Câu trả lời 20 giây

> "Hai extension kia trả lời câu hỏi *trang này đã bị ai báo cáo chưa*. VietPhish trả lời câu hỏi *trang này đang giả làm ai, có đúng là nhà của người đó không, và nó đang đòi gì của mình*. Nhờ vậy trang lừa đảo vừa tạo sáng nay, chưa danh sách nào biết, vẫn bị chặn. Mình chặn đúng lúc người dùng sắp gõ OTP, giải thích bằng tiếng Việt, có nút về trang thật. Mất kết nối máy chủ thì extension vẫn cảnh báo ở chế độ cơ bản."

Câu này chứa 4 điểm khác biệt. Mỗi điểm có một cảnh tương ứng trong video, xem mục 5.

## 2. Đối thủ mạnh và yếu ở đâu

| | ChongLuaDao 1.0.6 | J2TEAM Security 2.4.3 |
| --- | --- | --- |
| Cơ chế chính | Danh sách đen tải từ server, cộng random forest 17 đặc trưng URL và HTML | 48 luật chặn tĩnh `declarativeNetRequest`, cộng nhận diện form đăng nhập Facebook theo id |
| Mạnh | Kho dữ liệu cộng đồng, phân phối qua cả DNS và phần mềm diệt virus | Không cần server, chặn trước khi trang tải, khoảng 300.000 người dùng |
| Yếu | Lượt thử 12/11: API không phân giải, danh sách rỗng, mô hình không tải được. Mô hình chỉ đổi màu icon. Luật "trên 60% đặc trưng hợp lệ" gạt trang VCB giả về "không lừa đảo" | Gần như chỉ lo Facebook. Trang giả ngân hàng và VNeID không bị chặn |
| Bộ trang thử của đội | 0/3 trang giả ngân hàng và VNeID | 0/3 trang giả ngân hàng và VNeID, 2/2 trang giả Facebook |

**Không được nói:** "hai cái kia dở", "VietPhish tốt hơn về mọi mặt", "đầu tiên ở Việt Nam". J2TEAM bắt Facebook còn mình thì không. ChongLuaDao có thể đã sửa API. Ý cần nói là **khác cơ chế, bổ sung cho nhau**.

## 3. Thuật toán: "Ba câu hỏi, bằng chứng độc lập"

Đây là phần trả lời tiêu chí Công nghệ. Toàn bộ đã có trong B2 và B3. Ngày thi chỉ cần **gọi tên và trình bày đúng** điều code đang làm.

| Câu hỏi | Lấy từ đâu | Đối thủ có không |
| --- | --- | --- |
| 1. Trang này **trông giống ai**? | Gemini nhìn ảnh chụp, tiêu đề trang | Không. ChongLuaDao đo đặc trưng chung chung (URL dài, có `@`). J2TEAM chỉ nhận ra Facebook |
| 2. Tên miền có phải **nhà của người đó** không? | Whitelist eTLD+1, punycode, tên gần giống, subdomain đánh lừa | Một phần. Cả hai tra danh sách tên miền **xấu**, không so với tên miền **thật** của thương hiệu |
| 3. Trang **đòi gì**? | Ô mật khẩu, ô OTP, ô số thẻ | J2TEAM có cho Facebook. ChongLuaDao không |

**Luật cứng:** chỉ ra DANGER khi cả ba câu cùng xấu: giống X, không phải nhà của X, và đòi bí mật. Hệ quả rút ra được, nên nói lúc pitch:

- **AI không tự quyết.** Gemini nhận nhầm thương hiệu trên một trang tin không có ô nhập thì vẫn không ra DANGER, vì câu 3 sạch. Bài báo nhắc Vietcombank được 19 điểm, SAFE.
- **Không cần ai báo cáo trước.** Câu 1 và 2 suy ra được từ chính trang, nên trang tạo cách đây 5 phút vẫn bị bắt.
- **Lý do sinh ra từ chính ba câu trả lời**, nên giải thích tiếng Việt cụ thể: "Trang giống Vietcombank nhưng tên miền không phải vietcombank.com.vn, và đang đòi mật khẩu".

## 4. Bốn điểm khác biệt làm trong ngày thi

Nguyên tắc chọn: (1) giám khảo **nhìn thấy trong vài giây**, (2) đối thủ **không có**, (3) **chỉ sửa extension**, không đụng server, nên không làm vỡ 96 test của B và không phải deploy lại.

| Mã | Điểm khác biệt | Đối thủ | Công sức | File |
| --- | --- | --- | --- | --- |
| K1 | **Khóa ô nhập trong lúc kiểm tra.** Trang lạ có ô mật khẩu hoặc OTP: chặn gửi form cho tới khi có kết luận | ChongLuaDao chỉ đổi màu icon. J2TEAM chặn cả trang nhưng chỉ khi trang có trong danh sách hoặc giống Facebook | 25 phút agent | `content.js`, `background.js` |
| K2 | **Hỏi lại trước khi gõ bí mật vào trang đáng ngờ.** Kết luận SUSPICIOUS, người dùng bấm vào ô mật khẩu hoặc OTP: hiện hộp "Trang này đáng ngờ. Bạn chắc muốn nhập mật khẩu?" | Không ai có. Cả hai chỉ có hai trạng thái chặn hoặc không chặn | Cùng K1 | `content.js` |
| K3 | **Chế độ cơ bản khi mất máy chủ.** Server lỗi hoặc quá thời gian: extension tự kiểm tên miền có chứa tên thương hiệu mà không thuộc whitelist, hiện SUSPICIOUS kèm lý do "đang ở chế độ cơ bản" | ChongLuaDao mất API là mất bảo vệ, không báo cho ai. J2TEAM chạy offline nhưng chỉ cho Facebook | 15 phút agent | `background.js` |
| K4 | **Gửi ít dữ liệu hơn.** Chỉ gửi `origin + pathname`, bỏ query và hash (có thể chứa token, mã phiên). Ảnh chỉ chụp khi trang lạ có ô nhạy cảm hoặc tên miền chứa tên thương hiệu (A2 đã làm) | Đây là chỗ mình yếu nhất trong ba. K4 thu hẹp khoảng cách, không vượt | 2 dòng | `background.js` |

### Vì sao K1 và K2 là điểm mạnh nhất

Overlay của A1 chỉ hiện sau khi server trả lời. Với Gemini thật, khoảng đó là 1 đến 3 giây. Trong khoảng đó người dùng vẫn gõ và bấm "Đăng nhập" được. K1 đóng khoảng hở này. K2 xử lý vùng xám SUSPICIOUS mà hai đối thủ bỏ qua: không chặn cả trang (tránh làm phiền), nhưng hỏi lại đúng **lúc** sắp mất tiền. Câu chốt khi pitch: "**Bảo vệ ở khoảnh khắc gõ OTP, không phải lúc mở trang.**"

### Đặc tả

Đặc tả đầy đủ đã tách thành hai bước, theo file để hai phiên agent không sửa chung một file:

- `.agent/workflows/a4-khoa-o-nhap.md`: K1 và K2, chỉ sửa `extension/content.js`. C làm lúc 09:20–09:55.
- `.agent/workflows/a5-che-do-co-ban.md`: phần service worker của K1, cùng K3 và K4, chỉ sửa `extension/background.js`. A làm lúc 09:35–10:00, trước A3.

Bản tham chiếu ở `VietPhish_Demo` (nhánh `main`) chạy đạt 8 ca e2e cho K1 đến K3 (`tools/e2e/run_khac_biet.js`) và vẫn đạt 13 ca e2e cũ. Lịch và người làm theo `docs/TASKS.md`.

## 5. Video 2 phút: mỗi điểm khác biệt một cảnh

| Giây | Cảnh | Chứng minh |
| --- | --- | --- |
| 0–15 | Trang VCB giả mở ra, chip "đang kiểm tra", bấm Đăng nhập không được, overlay đỏ hiện | K1 và luật ba câu hỏi |
| 15–35 | Đọc 3 lý do tiếng Việt, bấm "Về trang chính thức" | Giải thích, khác trang chặn chung chung |
| 35–50 | Trang VNeID đòi OTP, lý do `VNEID_OFFLINE`: "VNeID chỉ xác thực qua ứng dụng chính thức và vneid.gov.vn, không qua website lạ." | Hiểu kịch bản lừa đảo Việt Nam |
| 50–60 | Bài báo nhắc Vietcombank: không cảnh báo | AI không tự quyết, không báo nhầm |
| 60–80 | Tắt server ngay trên màn hình, mở lại trang giả: dải vàng "chế độ cơ bản", bấm vào ô mật khẩu thì bị hỏi lại | K3 và K2. Đúng chỗ ChongLuaDao đang hỏng |
| 80–105 | Bảng thử cùng bộ trang: VietPhish, ChongLuaDao, J2TEAM | Mục 2, kèm dòng "thử ngày 14/11/2026" |
| 105–120 | Bảng số đo 3 cấu hình của C2 | Tiêu chí Công nghệ |

Cảnh 0–15 cần Gemini thật hoặc server có độ trễ, vì server mock trả lời dưới 0,5 giây và chip chỉ lóe lên. Quay cảnh này sau 10:15, khi B đã bật Gemini trên Cloud Run.

## 6. Lịch: chen vào ngày thi thế nào

| Giờ | Ai | Việc |
| --- | --- | --- |
| Tối 13/11 | C | Slide so sánh mục 2 và lời đọc mục 5. Chỉ là nội dung trình bày, không tính vào 30% |
| Tối 13/11 | Cả đội | Đọc file này. Ghi `docs/KHAC-BIET.md` vào bảng "Thiết kế" của `PREBUILT.md` trước khi gắn tag |
| 07:30 ngày 14/11 | C | Thử lại ChongLuaDao (API còn chết không) và J2TEAM trên bộ trang. Kết quả khác thì sửa slide |
| 09:20–09:55 | C | A4 (`content.js`), song song với việc của A |
| 09:35–10:00 | A | A5 (`background.js`), ngay sau A2. A3 làm sau A5, tới 10:40 |
| 10:15 | CP2 | Đóng băng như cũ. A4 chưa đạt thì **revert**, không sửa tiếp |
| 10:45–11:20 | C | Quay theo mục 5 |

**Thứ tự cắt nếu trễ:** A3 popup → hộp hỏi lại K2 → khóa gửi K1. Giữ A5 (K3, K4) vì rẻ nhất mà trả lời được câu "server sập thì sao".

## 7. Audit kế hoạch

Rà kế hoạch như một giám khảo khó tính và như người phải code nó trong 35 phút. Cột cuối ghi những gì đã sửa trong bản này.

| # | Vấn đề tìm thấy | Mức | Đã xử lý |
| --- | --- | --- | --- |
| 1 | Bản đầu định port engine v2 (logistic regression, evidence fusion) từ `VietPhish_Demo` sang. Không kịp trong 4 giờ, làm vỡ test vector đã kiểm, và chép code làm trước là vi phạm luật 30% | Chặn | Bỏ. Thuật toán trình bày đúng cái B2 và B3 đang có. Mọi việc mới chỉ ở extension |
| 2 | K1 khóa form có thể khóa nhầm trang ngân hàng thật nếu content script tự bật khóa | Cao | Chỉ background bật khóa, sau bước whitelist. Có hạn tự mở. Thêm dòng nghiệm thu với trang thật |
| 3 | Bản nháp đặt hạn tự mở 8 giây, ngắn hơn `REQUEST_TIMEOUT_MS` 10 giây trong `config.js`. Khóa sẽ mở trước khi chế độ cơ bản kịp kết luận | Cao | Đổi thành 15 giây |
| 4 | Bản nháp lọc keyword từ 5 ký tự cho chế độ cơ bản, để tránh khớp nhầm. Đối chiếu `official_domains.json` thì luật này làm sót `bidv`, `momo`, `bhxh`, mà keyword có sẵn đã đủ dài (`acbbank`, không có `acb` trơn) | Trung bình | Bỏ luật lọc, dùng nguyên danh sách keyword. Khớp nhầm còn lại (`momofuku.com`) chỉ ra SUSPICIOUS ở chế độ cơ bản, chấp nhận được |
| 5 | Câu VNeID trong lời video không khớp câu thật của `VNEID_OFFLINE` trong B1 | Thấp | Trích đúng câu trong B1 |
| 6 | Server mock quá nhanh nên cảnh K1 trong video không thấy gì | Trung bình | Quay cảnh này với Gemini thật sau 10:15 |
| 7 | A không còn giờ trống: 10:15–10:45 chỉ dành sửa lỗi | Cao | Bản 13/11 viết "A4 chạy song song A3, file không giao nhau". Sai: A3 cũng sửa `background.js`. Ngày 14/11 đã tách thành A4 (`content.js`, C làm) và A5 (`background.js`, A làm trước A3). Xem `TASKS.md` |
| 8 | Số liệu so sánh đối thủ lấy ngày 12/11. API ChongLuaDao có thể đã sống lại | Cao | C thử lại 07:30 ngày 14/11, slide ghi ngày thử |
| 9 | Dễ bị xem là chê đối thủ, nhất là khi nói ChongLuaDao "chết" | Trung bình | Câu nói đổi thành "lượt thử ngày X không tải được danh sách". Luôn nói J2TEAM bắt Facebook tốt |
| 10 | Định trích con số 98,3% recall của v2. Con số đó đo trên code nghiên cứu ở repo khác, không phải bản build trong ngày | Cao | Không trích trên slide. Chỉ nói số của C2 đo trên chính bản build. Nếu bị hỏi về hướng phát triển thì nói rõ là bản nghiên cứu riêng |
| 11 | Quyền riêng tư là điểm mình thua cả hai, K4 chưa giải quyết hết | Trung bình | Thừa nhận khi bị hỏi. Nói rõ: không gửi query, chỉ chụp khi có ô nhạy cảm, hướng tới chạy trên máy |
| 12 | Kẻ gian né K1: dùng ô `type="text"` cho mật khẩu | Thấp | Vẫn còn Gemini đọc `asks_sensitive_data` từ ảnh. Ghi vào mục 8 |
| 13 | Tài liệu đặc tả thêm làm tăng phần "làm trước" | Thấp | Chỉ đặc tả rút gọn, không viết code. Khai trong `PREBUILT.md` |

## 8. Câu hỏi khó và câu trả lời

**"J2TEAM có 300.000 người dùng, chặn trước khi trang tải. Sao mình chậm hơn?"**
Đúng, với trang đã có trong danh sách thì J2TEAM nhanh hơn. Trang mới tạo thì không danh sách nào có. Mình chấp nhận chậm 1 đến 3 giây để bắt được trang đó, và khóa ô nhập trong lúc chờ để khoảng chậm đó không gây thiệt hại.

**"Server sập thì sao?"**
Cho xem cảnh 60–80 giây trong video. Chế độ cơ bản vẫn bắt được trang có tên thương hiệu trong tên miền. Trang không có tên thương hiệu thì cần server, nói thẳng.

**"AI nhận nhầm thì chặn nhầm à?"**
Không. AI chỉ trả lời câu 1. DANGER cần cả câu 2 và câu 3. Bài báo nhắc Vietcombank được 19 điểm.

**"Sao không bắt Facebook như J2TEAM?"**
Kiến trúc không gắn với thương hiệu nào. Thêm Facebook là thêm một mục vào `official_domains.json`. Đội chọn 16 thương hiệu tài chính và công vụ Việt Nam vì đó là chỗ chưa ai bảo vệ, và là chỗ mất tiền nhiều nhất.

**"Kẻ gian né thế nào?"**
Bỏ tên thương hiệu khỏi tên miền thì Gemini vẫn nhìn ra giao diện. Đổi giao diện tới mức không còn giống ngân hàng thì nạn nhân cũng khó bị lừa. Đổi ô mật khẩu thành ô chữ thường thì né được khóa ô nhập, nhưng ảnh vẫn cho thấy trang đòi mật khẩu.

**"Khác gì Chrome Enhanced Protection?"**
Enhanced Protection không giải thích bằng tiếng Việt, không có nút về trang thật của ngân hàng, không có luật riêng như "VNeID không đòi OTP qua web".

## 9. Sau cuộc thi

Không làm ngày mai. Ghi lại để trả lời câu "hướng phát triển":

1. Đưa thuật toán v2 (đã đo ở `VietPhish_Demo` PR #2) vào repo chính, với test vector mới. Ba lỗ hổng PR #2 tự ghi (`momofuku.com` báo nhầm, `bldv.vip` và `loginvietconbank.com` lọt) đã sửa ở nhánh `feat/khac-biet`, xem `VietPhish_Demo/docs/SUA-THEO-REVIEW-14-11.md`.
2. Bằng chứng tài nguyên: trang tải ảnh, CSS trực tiếp từ tên miền chính thức của ngân hàng là dấu hiệu sao chép, không cần AI.
3. Chặn trước khi trang tải bằng `declarativeNetRequest` cho tên miền đã xác nhận, học từ J2TEAM.
4. Thêm Facebook, Zalo, Shopee và các nhà mạng.
5. Kênh báo cáo cộng đồng có duyệt, học từ ChongLuaDao.
6. Chạy nhận diện trên máy bằng Gemini Nano để không phải gửi ảnh.
