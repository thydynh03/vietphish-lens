// Khung rỗng làm trước ngày thi: chỉ có GET /health.
// POST /analyze và toàn bộ logic phát hiện được viết trong ngày thi 14/11/2026.
import { createServer } from "node:http";

const PORT = Number(process.env.PORT || 8787);

createServer((req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  res.setHeader("content-type", "application/json; charset=utf-8");
  if (req.method === "GET" && path === "/health") {
    res.writeHead(200);
    return res.end(JSON.stringify({ ok: true }));
  }
  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
}).listen(PORT, "0.0.0.0", () => {
  console.log(`VietPhish Lens server (khung rỗng): http://127.0.0.1:${PORT}`);
});
