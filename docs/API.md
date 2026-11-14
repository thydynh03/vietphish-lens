# Hợp đồng API giữa extension và server

Đây là bản thiết kế, chốt trước ngày thi. Trong ngày thi không ai đổi khi chưa báo cả đội.

## `GET /health`

Trả `200`:

```json
{ "ok": true, "vision": "mock", "safeBrowsing": "off", "model": "gemini-3.5-flash-lite" }
```

- `vision`: `mock` (đoán từ tiêu đề, không gọi Gemini), `on` (có `GEMINI_API_KEY`), `off`.
- `safeBrowsing`: `on` hoặc `off`.

## `POST /analyze`

### Request

```json
{
  "url": "http://vietcombank-xacthuc.top:8080/",
  "title": "Vietcombank - Đăng nhập VCB Digibank",
  "screenshot": "data:image/jpeg;base64,...",
  "signals": {
    "hasPasswordField": true,
    "hasOtpField": false,
    "hasCardField": false,
    "formActionHost": "collector.example-attacker.xyz"
  },
  "mode": "full"
}
```

| Trường | Bắt buộc | Ghi chú |
| --- | --- | --- |
| `url` | Có | URL đầy đủ của trang |
| `title` | Không | Tiêu đề trang |
| `screenshot` | Không | Data URL JPEG, rộng tối đa 1024 px. Chỉ gửi khi trang có ô nhập nhạy cảm hoặc tên miền chứa tên thương hiệu |
| `signals` | Không | Tín hiệu do content script đọc từ trang. Mặc định `{}` |
| `mode` | Không | `full` (mặc định), `no_vision`, `blacklist_only`. Hai mode sau dùng cho eval |

### Response `200`

```json
{
  "verdict": "DANGER",
  "riskScore": 100,
  "brand": { "id": "vietcombank", "name": "Vietcombank", "officialUrl": "https://vietcombank.com.vn" },
  "reasons": [
    { "code": "BRAND_DOMAIN_MISMATCH", "text": "Trang này trông giống Vietcombank nhưng địa chỉ vietcombank-xacthuc.top không phải tên miền chính thức (vietcombank.com.vn).", "weight": 40 }
  ],
  "layers": { "whitelist": false, "safeBrowsing": "skipped", "heuristics": 60, "vision": {} },
  "latencyMs": { "total": 12, "vision": 3 },
  "degraded": false,
  "cached": false
}
```

| Trường | Ý nghĩa |
| --- | --- |
| `verdict` | `SAFE` khi điểm dưới 40, `SUSPICIOUS` từ 40 đến 69, `DANGER` từ 70 |
| `riskScore` | Số nguyên 0 đến 100 |
| `brand` | Thương hiệu bị giả mạo, hoặc `null` |
| `reasons` | Mảng lý do tiếng Việt, lý do quan trọng nhất đứng đầu. Extension hiện tối đa 4 lý do đầu |
| `layers.safeBrowsing` | `hit`, `clean`, `skipped` (thiếu key), `error` |
| `degraded` | `true` khi mode là `full` mà lớp nhìn ảnh không cho kết quả |
| `cached` | `true` khi kết quả lấy từ cache của server |

### Lỗi

| Mã | Khi nào | Body |
| --- | --- | --- |
| `400` | Body không phải JSON, hoặc `url` thiếu hay sai | `{ "error": "..." }` |
| `404` | Đường dẫn lạ | `{ "error": "Not found" }` |
| `413` | Body lớn hơn 8 MB | `{ "error": "..." }` |
| `429` | Quá 60 request mỗi phút từ một IP | `{ "error": "..." }` |
| `500` | Lỗi khác | `{ "error": "..." }` |

### CORS

Mọi response có `access-control-allow-origin: *`, `access-control-allow-headers: content-type`, `access-control-allow-methods: GET,POST,OPTIONS`. `OPTIONS` trả `204`.

## Tin nhắn trong extension

| Từ | Tới | Tin nhắn | Trả lời |
| --- | --- | --- | --- |
| background | content | `{ type: "getSignals" }` | object `signals` như trên |
| background | content | `{ type: "verdict", result }` | không có |
| background | content | `{ type: "clear" }` | không có |
| popup | background | `{ type: "recheck", tabId }` | không có |

Kết quả theo từng tab lưu ở `chrome.storage.session`, khóa `"tab:" + tabId`.
