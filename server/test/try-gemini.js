import { readFileSync } from "node:fs";
import { detectBrand, VISION_CONFIG, visionStatus, PROMPT, BRAND_SCHEMA } from "../src/vision.js";

const file = process.argv[2];
if (!file) {
  console.log("Cách dùng: node test/try-gemini.js <đường-dẫn-ảnh.png|.jpg>");
  process.exit(2);
}

console.log(`model: ${VISION_CONFIG.model} | vision: ${visionStatus()}`);

if (visionStatus() !== "on") {
  console.log("Chưa bật Gemini thật: cần đặt GEMINI_API_KEY và xóa VISION_MOCK.");
  process.exit(2);
}

const key = process.env.GEMINI_API_KEY;
const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", {
  headers: { "x-goog-api-key": key }
});

if (!res.ok) {
  console.log(`[1] Kiểm key: HTTP ${res.status}`);
  console.log((await res.text()).slice(0, 400));
} else {
  const data = await res.json();
  const models = data.models || [];
  const modelNames = models.map(m => m.name.replace(/^models\//, ""));
  const hasModel = modelNames.includes(VISION_CONFIG.model) ? "CÓ" : "KHÔNG";
  console.log(`[1] Kiểm key: OK. Có model ${VISION_CONFIG.model}: ${hasModel}`);
  const flashes = modelNames.filter(m => m.includes("flash")).join(", ");
  console.log(`    Model có chữ flash: ${flashes}`);
}

VISION_CONFIG.timeoutMs = 30000;

const ext = file.split(".").pop().toLowerCase();
const mime = ext === "png" ? "image/png" : "image/jpeg";
const base64 = readFileSync(file).toString("base64");

const start = Date.now();
const r = await detectBrand(`data:${mime};base64,${base64}`, "");
const time = Date.now() - start;
const kb = Math.round(base64.length / 1333);

console.log(`[2] detectBrand: ${time}ms, ảnh ${kb}KB`);
console.log(JSON.stringify(r, null, 2));

if (r?.error && r.error.match(/^4\d\d /)) {
  const raw = await fetch("https://generativelanguage.googleapis.com/v1/interactions", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({ model: VISION_CONFIG.model, input: [{ type: "text", text: PROMPT }, { type: "image", data: base64, mime_type: mime }], response_format: { type: "text", mime_type: "application/json", schema: BRAND_SCHEMA } }),
  });
  console.log(`[3] Gọi thẳng REST: HTTP ${raw.status}\n${(await raw.text()).slice(0, 800)}`);
}
