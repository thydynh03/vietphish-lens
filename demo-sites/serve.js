// Server tĩnh cho trang demo giả, chọn thư mục theo tên miền (Host header).
// Chỉ chạy trên máy local. Không đưa các trang này lên Internet.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const PORT = Number(process.env.PORT || 8080);
const SITES = {
  "vietcombank-xacthuc.top": "vcb-fake",
  "vneid-capnhat.cc": "vneid-fake",
  // Trang giả giao diện Vietcombank trên tên miền KHÔNG chứa tên ngân hàng: chỉ lớp nhìn ảnh bắt được.
  "xacthuc-taikhoan.com": "vcb-fake",
  // Trang tin bình thường có nhắc tên ngân hàng, không có ô nhập: không được báo nhầm.
  "tintuc-demo.vn": "news-demo",
};

createServer(async (req, res) => {
  const host = (req.headers.host || "").split(":")[0];
  const dir = SITES[host];
  if (!dir) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    return res.end(`Không có trang demo cho ${host}. Các tên miền demo: ${Object.keys(SITES).join(", ")}`);
  }
  const html = await readFile(new URL(`./${dir}/index.html`, import.meta.url));
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" });
  res.end(html);
}).listen(PORT, () => {
  console.log(`Demo sites: cổng ${PORT}`);
  for (const h of Object.keys(SITES)) console.log(`  http://${h}:${PORT}`);
});
