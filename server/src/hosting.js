// Nền tảng cho ai cũng tạo được tên miền con miễn phí trong vài giây.
// Trang lừa đảo hay dựng ở đây vì mượn được HTTPS và tuổi tên miền của nền tảng.
export const FREE_HOSTING_PLATFORMS = [
  "vercel.app", "netlify.app", "pages.dev", "workers.dev", "github.io", "gitlab.io",
  "web.app", "firebaseapp.com", "glitch.me", "onrender.com", "herokuapp.com", "fly.dev",
  "railway.app", "surge.sh", "repl.co", "replit.app", "weebly.com", "wixsite.com",
  "blogspot.com", "000webhostapp.com", "webflow.io", "framer.app", "ngrok-free.app",
  "ngrok.io", "trycloudflare.com",
];

// Trả về tên nền tảng nếu hostname là tên miền con của một nền tảng miễn phí, ngược lại trả null.
export function freeHostingPlatform(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/\.+$/, "");
  return FREE_HOSTING_PLATFORMS.find((p) => host.endsWith("." + p)) || null;
}
