// Đánh giá độ chính xác phát hiện trang giả mạo trên bộ mẫu eval/domains.csv [C2]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const API_TIMEOUT_MS = 15000;
const RETRY_429_WAIT_MS = 5000;
const RETRY_429_MAX = 15;

// Đọc danh sách URL có nhãn từ eval/domains.csv
function loadDataset() {
  const raw = readFileSync(new URL("./domains.csv", import.meta.url), "utf8");
  const lines = raw.split(/\r?\n/).slice(1).filter((line) => line.trim().length > 0);
  return lines.map((line) => {
    const [url, label, ...rest] = line.split(",");
    return { url: url.trim(), label: label.trim(), note: rest.join(",") };
  });
}

// Định dạng phần trăm một chữ số thập phân với dấu phẩy tiếng Việt
function formatPercent(num, den) {
  if (den === 0) return "n/a";
  return ((num / den) * 100).toFixed(1).replace(".", ",") + "%";
}

// Tính phân vị độ trễ trên mảng đã sắp xếp tăng dần
function percentile(sorted, p) {
  const n = sorted.length;
  if (n === 0) return 0;
  return sorted[Math.max(0, Math.ceil(p * n) - 1)];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Gửi một request tới POST /analyze kèm cơ chế chờ khi gặp HTTP 429
async function callAnalyze(baseUrl, url, mode) {
  let retries = 0;
  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    const t0 = performance.now();
    let res;
    try {
      res = await fetch(`${baseUrl}/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, mode }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const latencyMs = Math.round(performance.now() - t0);

    if (res.status === 429) {
      if (retries < RETRY_429_MAX) {
        retries++;
        await sleep(RETRY_429_WAIT_MS);
        continue;
      }
      throw new Error("HTTP 429");
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    return { data, latencyMs };
  }
}

// Tính chỉ số TP/FP/TN/FN và in báo cáo cho một cấu hình
function reportConfig(name, items, isApi) {
  console.log(`=== ${name} ===`);
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  let errors = 0;
  const latencies = [];

  for (const item of items) {
    const isPhish = item.label === "phish";
    if (item.error) {
      errors++;
    } else if (isApi && typeof item.latencyMs === "number") {
      latencies.push(item.latencyMs);
    }

    if (item.flagged && isPhish) tp++;
    else if (item.flagged && !isPhish) fp++;
    else if (!item.flagged && !isPhish) tn++;
    else fn++;

    const matched = item.flagged === isPhish;
    const mark = matched ? "✓" : "✗";
    const scoreStr = item.error ? "-" : String(item.score);
    const codesStr = `[${item.codes.join(", ")}]`;
    const errSuffix = item.error ? ` LỖI: ${item.error}` : "";
    console.log(`${mark} ${scoreStr} ${item.label} ${item.url} ${codesStr}${errSuffix}`);
  }

  const precision = formatPercent(tp, tp + fp);
  const recall = formatPercent(tp, tp + fn);
  const fpr = formatPercent(fp, fp + tn);

  console.log(`--- Tổng kết: ${name} ---`);
  console.log(`TP ${tp}, FP ${fp}, TN ${tn}, FN ${fn}`);
  console.log(`Precision ${precision}, recall ${recall}, báo nhầm ${fpr}`);

  let latencyStats = null;
  if (isApi) {
    const sorted = [...latencies].sort((a, b) => a - b);
    const p50 = percentile(sorted, 0.5);
    const p95 = percentile(sorted, 0.95);
    console.log(`Độ trễ p50 ${p50} ms, p95 ${p95} ms, lỗi mạng ${errors}`);
    latencyStats = { p50Ms: p50, p95Ms: p95, errors };
  }

  return {
    config: name,
    tp,
    fp,
    tn,
    fn,
    precision,
    recall,
    falsePositiveRate: fpr,
    ...(latencyStats ? { latency: latencyStats } : {}),
    items,
  };
}

// Chế độ cục bộ: import động để không làm hỏng chế độ --api khi chưa cài gói trong server/
async function runLocal(rows) {
  const { isWhitelisted } = await import("../server/src/official.js");
  const { domainHeuristics } = await import("../server/src/heuristics.js");

  const items = rows.map((row) => {
    const hostname = new URL(row.url).hostname;
    const wl = isWhitelisted(hostname);
    if (wl) {
      return {
        url: row.url,
        label: row.label,
        note: row.note,
        score: 0,
        flagged: false,
        codes: [],
        error: null,
      };
    }
    const h = domainHeuristics(row.url);
    const codes = Array.isArray(h.reasons) ? h.reasons.map((r) => r.code) : [];
    return {
      url: row.url,
      label: row.label,
      note: row.note,
      score: h.score,
      flagged: h.score >= 40,
      codes,
      error: null,
    };
  });

  return [reportConfig("local", items, false)];
}

// Chế độ API: chạy lần lượt 3 cấu hình blacklist_only, no_vision, full
async function runApi(rows, baseUrl) {
  const modes = ["blacklist_only", "no_vision", "full"];
  const summaries = [];

  for (const mode of modes) {
    const items = [];
    for (const row of rows) {
      try {
        const { data, latencyMs } = await callAnalyze(baseUrl, row.url, mode);
        const codes = Array.isArray(data.reasons) ? data.reasons.map((r) => r.code) : [];
        items.push({
          url: row.url,
          label: row.label,
          note: row.note,
          score: data.riskScore,
          verdict: data.verdict,
          flagged: data.verdict !== "SAFE",
          codes,
          latencyMs,
          error: null,
        });
      } catch (err) {
        const msg = err?.name === "AbortError" ? "Timeout 15s" : String(err?.message || err);
        items.push({
          url: row.url,
          label: row.label,
          note: row.note,
          score: null,
          verdict: null,
          flagged: false,
          codes: [],
          latencyMs: null,
          error: msg,
        });
      }
    }
    summaries.push(reportConfig(mode, items, true));
  }

  return summaries;
}

function parseArgs(argv) {
  const idx = argv.indexOf("--api");
  if (idx === -1) return { apiBase: null };
  const raw = argv[idx + 1];
  if (!raw || raw.startsWith("--")) {
    throw new Error("Thiếu URL sau cờ --api (ví dụ: node eval/run_eval.js --api http://127.0.0.1:8787)");
  }
  return { apiBase: raw.replace(/\/+$/, "") };
}

async function main() {
  const { apiBase } = parseArgs(process.argv.slice(2));
  const rows = loadDataset();

  const configs = apiBase ? await runApi(rows, apiBase) : await runLocal(rows);

  const resultsDir = new URL("./results/", import.meta.url);
  mkdirSync(resultsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = new URL(`./results/${stamp}.json`, import.meta.url);
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        mode: apiBase ? "api" : "local",
        apiBase,
        sampleSize: rows.length,
        configs,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log("Lưu ý: bộ mẫu nhỏ (28 URL), phần trang giả do đội tự đặt tên.");
}

main().catch((err) => {
  console.error("Lỗi:", err?.message || err);
  process.exit(1);
});
