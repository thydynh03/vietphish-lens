---
description: A5 - Gửi lệnh khóa, chế độ cơ bản khi mất máy chủ, bỏ query khỏi URL (extension, background.js)
---

# A5. Chế độ cơ bản và lệnh khóa

**Người làm:** A, lúc 09:35–10:00, ngay sau khi nghiệm thu A2. **Thời gian dự kiến:** 15 phút cho agent, cộng 10 phút người kiểm. **Phụ thuộc:** A2 **đã commit**. A3 chạy **sau** khi A5 đã commit, vì A3 cũng sửa `background.js`: hai phiên cùng lúc sẽ ghi đè lên nhau. Bước 4 của nghiệm thu cần A4 (C làm, xong khoảng 09:55). Chưa có A4 thì làm các bước khác trước. Lịch đầy đủ ở `docs/TASKS.md`.

Đây là điểm khác biệt K3 và K4 trong `docs/KHAC-BIET.md`, cộng phần service worker của K1.

## Mục tiêu

1. **K1, phía service worker.** Trang lạ (đã qua bước whitelist) có ô nhạy cảm: gửi `{ type: "lock" }` cho content script **trước** khi chụp ảnh và gọi server.
2. **K3. Chế độ cơ bản.** Server lỗi, trả mã lỗi hoặc quá `REQUEST_TIMEOUT_MS`: extension tự kết luận từ tên miền. Tên miền chứa keyword thương hiệu mà không thuộc whitelist thì ra `SUSPICIOUS` với lý do "Không kết nối được máy chủ kiểm tra…". Không kết luận được thì gửi `unlock`.
3. **K4. Bỏ query và hash.** Gửi lên server `url.origin + url.pathname` thay cho `tab.url`. Query và hash hay chứa token, mã phiên, OTP.

## File được sửa

- Sửa `extension/background.js`: chỉ 4 chỗ ghi dưới đây. Không đổi tên, thứ tự hay nội dung những gì A2, A3 đã viết.

## Chỗ 1. Hai hàm mới, ngay **trên** dòng `async function callAnalyze(payload) {`

Không đặt dưới `hostnameHasBrandKeyword`: chỗ đó là mốc chèn của A3.

```js
// Trả { brand, keyword } đầu tiên mà hostname chứa keyword, không có thì null.
function brandKeywordHit(official, hostname) {
  for (const b of official.brands || []) {
    for (const k of b.keywords || []) if (k && hostname.includes(k)) return { brand: b, keyword: k };
  }
  return null;
}

// Chế độ cơ bản (K3): server không trả lời được. Tự kết luận từ tên miền để không mất bảo vệ hoàn toàn.
function offlineResult(official, hostname) {
  const hit = brandKeywordHit(official, hostname);
  if (!hit) return null;
  const officialDomain = (hit.brand.domains || [])[0] || "";
  return {
    verdict: "SUSPICIOUS",
    riskScore: 50,
    offline: true,
    degraded: true,
    brand: officialDomain ? { id: hit.brand.id, name: hit.brand.name, officialUrl: "https://" + officialDomain } : null,
    reasons: [
      {
        code: "OFFLINE_BASIC_CHECK",
        text:
          "Không kết nối được máy chủ kiểm tra. Kiểm tra cơ bản: tên miền " + hostname + " chứa '" + hit.keyword +
          "' nhưng không phải tên miền chính thức " + officialDomain + ".",
        weight: 0,
      },
    ],
  };
}
```

Dùng nguyên danh sách keyword trong `official_domains.json`, **không** lọc theo độ dài. Danh sách đã chọn sẵn keyword đủ dài (`acbbank`, không có `acb` trơn). Lọc từ 5 ký tự sẽ làm sót `bidv`, `momo`, `bhxh`.

## Chỗ 2. Biến `sensitive`, trong `check(tab)`, ngay **sau** bước 6 (hàm `stillHere`) và **trước** `try` của bước 7

```js
// Khai báo ngoài try để khối catch (chế độ cơ bản) đọc được.
let sensitive = false;
```

## Chỗ 3. Bước 7e3 và 7e4

- Thay `const sensitive = signals.hasPasswordField || signals.hasOtpField || signals.hasCardField;` bằng:

```js
sensitive = Boolean(signals.hasPasswordField || signals.hasOtpField || signals.hasCardField);
// K1: trang lạ có ô nhạy cảm thì khóa gửi biểu mẫu trong lúc chờ kết luận (content.js, bước A4).
if (sensitive) await sendToTab(tab.id, { type: "lock" });
```

- Trong lệnh `callAnalyze` của 7e4, đổi `url: tab.url` thành `url: url.origin + url.pathname`. Các trường khác giữ nguyên. `pageUrl: myUrl` ở bước 7g giữ nguyên để popup vẫn so được trang.

## Chỗ 4. Bước 8, `catch (e)`

Giữ dòng `console.warn`. Thay phần trong `if (await stillHere()) { ... }` bằng:

```js
let local = null;
try {
  // new URL(myUrl), không dùng biến url: tùy cách viết bước 2, url có thể không nằm trong phạm vi của catch.
  local = offlineResult(await loadOfficial(), new URL(myUrl).hostname);
} catch (e2) {
  local = null;
}
if (local && sensitive) {
  // Trang đòi mật khẩu/OTP/số thẻ: hiện dải vàng, content script chuyển sang hỏi lại khi bấm vào ô (A4).
  // Không lưu trường error: popup của A3 xét error trước verdict, sẽ hiện "Chưa kiểm tra" lệch với dải vàng.
  await setBadge(tab.id, "SUSPICIOUS");
  await saveTabResult(tab.id, { ...local, pageUrl: myUrl });
  await sendToTab(tab.id, { type: "verdict", result: local });
} else if (local) {
  // Không đòi dữ liệu nhạy cảm: chỉ đổi huy hiệu, không phủ dải (tránh làm phiền trang công ty con của ngân hàng).
  await setBadge(tab.id, "SUSPICIOUS");
  await saveTabResult(tab.id, { ...local, pageUrl: myUrl });
  await sendToTab(tab.id, { type: "unlock" });
} else {
  await setBadge(tab.id, null);
  await saveTabResult(tab.id, { error: String((e && e.message) || e), pageUrl: myUrl });
  await sendToTab(tab.id, { type: "unlock" });
}
```

Khi server sống lại, lượt kiểm tiếp theo của cùng trang ghi đè kết luận cơ bản bằng kết luận thật như bình thường.

## Bẫy đã biết

| Bẫy | Triệu chứng | Cách tránh |
| --- | --- | --- |
| Khai báo `let sensitive` bên trong `try` | Chế độ cơ bản không bao giờ chạy: `catch` gặp ReferenceError, bị `catch (e2)` nuốt mất. Lỗi này đã xảy ra thật ở bản tham chiếu | Khai báo trước `try`, đúng Chỗ 2 |
| Gửi `lock` trước bước whitelist | Trang ngân hàng thật bị khóa | Chỉ gửi ở 7e3, sau 7b |
| Quên `unlock` ở nhánh không kết luận được | Trang lạ bị khóa 15 giây mỗi khi mất mạng | Cả hai nhánh không có dải vàng đều gửi `unlock` |
| Lọc keyword theo độ dài | `bidv-xacthuc.top` không bị cảnh báo khi mất mạng | Dùng nguyên danh sách |
| Gửi `tab.url` | Token trong query lên server và vào log | `url.origin + url.pathname` |
| Sửa dòng khác của A2 hoặc A3 | Hỏng nghiệm thu A2, A3 | Chỉ 4 chỗ |
| Lưu kết quả cơ bản kèm `error` | Trang có dải vàng mà popup hiện "Chưa kiểm tra" và dòng lỗi | Chỉ nhánh không kết luận được mới lưu `error` |
| Dùng `url.hostname` trong `catch` | ReferenceError nếu bước 2 khai báo `url` bên trong `try`, chế độ cơ bản im lặng | `new URL(myUrl).hostname` |

## Tự kiểm trước khi báo xong

- [ ] `node --check extension/background.js` không lỗi
- [ ] `git diff --stat` chỉ có `extension/background.js`
- [ ] `let sensitive = false;` nằm ngoài `try`
- [ ] `sendToTab(tab.id, { type: "lock" })` chỉ xuất hiện một lần, ở 7e3
- [ ] Lệnh `callAnalyze` dùng `url.origin + url.pathname`

## Nghiệm thu

Người làm bằng tay. Server chế độ mock, trang demo và Chrome demo giống bước A2. Tải lại extension rồi F5 tab.

| Bước | Làm | Phải thấy |
| --- | --- | --- |
| 1 | Server bật. Mở `http://vietcombank-xacthuc.top:8080/` | Chip "đang kiểm tra" lóe lên rồi overlay đỏ. Server mock nhanh nên chip có thể chỉ hiện dưới nửa giây |
| 2 | Mở `http://vietcombank-xacthuc.top:8080/?token=abc#x`. Ở DevTools service worker, tab Network, xem payload `/analyze` | Trường `url` là `http://vietcombank-xacthuc.top:8080/`, không có `token` |
| 3 | Tắt server (Ctrl+C). F5 `vietcombank-xacthuc.top` | Dải vàng: "Không kết nối được máy chủ kiểm tra. Kiểm tra cơ bản: tên miền vietcombank-xacthuc.top chứa 'vietcombank' nhưng không phải tên miền chính thức vietcombank.com.vn." Huy hiệu `!` |
| 4 | Bấm vào ô mật khẩu | Hộp hỏi lại của A4 hiện, nút "Rời trang, về trang chính thức Vietcombank" |
| 5 | Server vẫn tắt. Mở `http://xacthuc-taikhoan.com:8080/`, bấm `Đăng nhập` | Không dải, không chip sau vài giây, có alert "Trang DEMO…". Đây là giới hạn đã biết: tên miền không có tên thương hiệu thì cần server |
| 6 | Server vẫn tắt. Mở `http://tintuc-demo.vn:8080/` | Không cảnh báo |
| 7 | Bật lại server, F5 `vietcombank-xacthuc.top` | Overlay đỏ của server thay dải vàng |
| 8 | Mở `https://www.vietcombank.com.vn` | Huy hiệu `✓`, không chip |

Bước 3, 4, 5, 7 có ca e2e tương ứng ở bản tham chiếu (`VietPhish_Demo/tools/e2e/run_khac_biet.js`).

## Commit (người làm, agent không chạy)

```bash
git add extension/background.js
git commit -m "feat(extension): lệnh khóa, chế độ cơ bản khi mất máy chủ, bỏ query [A5]"
git pull --rebase
git push
```
