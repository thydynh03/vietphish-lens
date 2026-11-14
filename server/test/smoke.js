import { readFileSync } from "node:fs";

const base = (process.argv[2] || "http://127.0.0.1:8787").replace(/\/$/, "");
const vectors = JSON.parse(readFileSync(new URL("./vectors/api.json", import.meta.url), "utf8"));

const healthRes = await fetch(base + "/health");
const health = await healthRes.json();
console.log("health: " + JSON.stringify(health));

const exact = health.vision === "mock";
let bad = 0;

for (const v of vectors) {
  const res = await fetch(base + "/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(v.body)
  });
  const r = await res.json();
  const ok = res.status === 200 && r.verdict === v.expect.verdict && (!exact || r.riskScore === v.expect.riskScore);
  if (!ok) bad++;
  console.log(`${ok ? "ĐẠT" : "SAI "} | ${v.name} | mong đợi ${v.expect.verdict} ${v.expect.riskScore} | nhận ${r.verdict} ${r.riskScore}${exact ? "" : " (tham khảo)"} | degraded=${r.degraded}`);
}

if (bad === 0) {
  console.log("Tất cả đạt");
} else {
  console.log(`${bad} mục sai`);
}
process.exit(bad ? 1 : 0);