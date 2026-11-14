// Tổng hợp danh sách chặn cộng đồng (vn-badsite-filter, OpenPhish, PhishVN, PhishTank) kèm bộ lọc chống báo nhầm Tranco top 300k
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const require = createRequire(new URL("../server/package.json", import.meta.url));
const { parse } = require("tldts");

const DEFAULT_OUT = fileURLToPath(new URL("../eval/results/blocklist.json", import.meta.url));
const DEFAULT_TRANCO = fileURLToPath(new URL("../eval/results/tranco-top300k.csv", import.meta.url));
const OFFICIAL_PATH = fileURLToPath(new URL("../shared/official_domains.json", import.meta.url));

const TRANCO_ZIP_URLS = [
  "https://tranco-list.eu/download/daily/top-1m.csv.zip",
  "https://tranco-list.eu/top-1m.csv.zip",
];
const VN_BADSITE_URLS = [
  "https://vn-badsite-filter.pages.dev/vn-badsite-filter-agh.txt",
  "https://curbengh.github.io/vn-badsite-filter/vn-badsite-filter-agh.txt",
  "https://malware-filter.gitlab.io/vn-badsite-filter/vn-badsite-filter-agh.txt",
];
const OPENPHISH_URLS = [
  "https://openphish.com/feed.txt",
  "https://raw.githubusercontent.com/openphish/public_feed/refs/heads/main/feed.txt",
];

const FRESH_DAYS = 30;
const MIN_SHARED_PATH_LEN = 10;

// Các nền tảng chia sẻ nội dung / rút gọn link chỉ được chặn theo đường dẫn, không chặn cả tên miền
const SHARED_HOST_PATTERNS = [
  "docs.google.com",
  "drive.google.com",
  "sites.google.com",
  "forms.gle",
  "dropbox.com",
  "github.com",
  "gitlab.com",
  "linkedin.com",
  "t.me",
  "wa.me",
  "vk.com",
  "gravatar.com",
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "rb.gy",
  "cutt.ly",
  "s3.amazonaws.com",
  "storage.googleapis.com",
  "firebasestorage.googleapis.com",
  "onedrive.live.com",
];

// Tải dữ liệu qua IPv4 để tránh lỗi treo dual-stack IPv6 trên Windows
function downloadBuffer(url, timeoutMs = 45000, redirectsLeft = 5) {
  return new Promise((resolvePromise, rejectPromise) => {
    const parsed = new URL(url);
    const client = parsed.protocol === "http:" ? http : https;
    const req = client.get(
      parsed,
      { family: 4, headers: { "user-agent": "VietPhishLens/0.1" } },
      (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          redirectsLeft > 0
        ) {
          res.resume();
          const nextUrl = new URL(res.headers.location, parsed).href;
          downloadBuffer(nextUrl, timeoutMs, redirectsLeft - 1).then(resolvePromise, rejectPromise);
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          rejectPromise(new Error(`HTTP ${res.statusCode} khi tải ${url}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolvePromise(Buffer.concat(chunks)));
        res.on("error", rejectPromise);
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Hết thời gian ${timeoutMs}ms khi tải ${url}`));
    });
    req.on("error", rejectPromise);
  });
}

async function fetchFirstAvailable(urls, timeoutMs = 30000) {
  let lastErr = null;
  for (const url of urls) {
    try {
      const buf = await downloadBuffer(url, timeoutMs);
      return buf;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("Không tải được nguồn dữ liệu");
}

// Giải nén file đầu tiên từ buffer ZIP thông qua Central Directory (hỗ trợ cả data descriptor)
function unzipFirstCsv(zipBuf) {
  const eocdSig = 0x06054b50;
  let eocdOffset = -1;
  const minOffset = Math.max(0, zipBuf.length - 65557);
  for (let i = zipBuf.length - 22; i >= minOffset; i--) {
    if (zipBuf.readUInt32LE(i) === eocdSig) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error("Không tìm thấy EOCD trong file ZIP Tranco");

  const cdOffset = zipBuf.readUInt32LE(eocdOffset + 16);
  if (zipBuf.readUInt32LE(cdOffset) !== 0x02014b50) {
    throw new Error("Central Directory của file ZIP không hợp lệ");
  }

  const compression = zipBuf.readUInt16LE(cdOffset + 10);
  const compSize = zipBuf.readUInt32LE(cdOffset + 20);
  const localOffset = zipBuf.readUInt32LE(cdOffset + 42);

  if (zipBuf.readUInt32LE(localOffset) !== 0x04034b50) {
    throw new Error("Local File Header của file ZIP không hợp lệ");
  }
  const localNameLen = zipBuf.readUInt16LE(localOffset + 26);
  const localExtraLen = zipBuf.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + localNameLen + localExtraLen;
  const compressed = zipBuf.subarray(dataStart, dataStart + compSize);

  if (compression === 0) return compressed.toString("utf8");
  if (compression === 8) return inflateRawSync(compressed).toString("utf8");
  throw new Error(`Thuật toán nén ZIP không được hỗ trợ: ${compression}`);
}

// Nạp hoặc tải Tranco top 300k làm lớp chống báo nhầm tên miền phổ biến
async function loadTrancoTop300k(trancoUrl) {
  let csvText = "";
  if (existsSync(trancoUrl)) {
    csvText = readFileSync(trancoUrl, "utf8");
  } else {
    console.log(`Đang tải Tranco top 1M từ ${TRANCO_ZIP_URLS[0]}...`);
    const zipBuf = await fetchFirstAvailable(TRANCO_ZIP_URLS, 60000);
    const fullCsv = unzipFirstCsv(zipBuf);
    const topLines = fullCsv.split(/\r?\n/).filter(Boolean).slice(0, 300000);
    csvText = topLines.join("\n") + "\n";
    mkdirSync(dirname(trancoUrl instanceof URL ? trancoUrl : resolve(trancoUrl)), {
      recursive: true,
    });
    writeFileSync(trancoUrl, csvText, "utf8");
    console.log(
      `Đã lưu ${topLines.length} tên miền Tranco vào ${trancoUrl instanceof URL ? trancoUrl.pathname : trancoUrl}`,
    );
  }

  const popular = new Set();
  for (const line of csvText.split(/\r?\n/)) {
    if (!line) continue;
    const comma = line.indexOf(",");
    const domain = (comma >= 0 ? line.slice(comma + 1) : line).trim().toLowerCase();
    if (domain) popular.add(domain);
    if (popular.size >= 300000) break;
  }
  return popular;
}

function loadWhitelistChecker() {
  const official = JSON.parse(readFileSync(OFFICIAL_PATH, "utf8"));
  const suffixes = official.trustedSuffixes || [];
  const domains = new Set();
  for (const b of official.brands || []) {
    for (const d of b.domains || []) domains.add(d.toLowerCase());
  }
  return function isOfficial(hostname) {
    const h = hostname.toLowerCase();
    if (suffixes.some((s) => h === s || h.endsWith("." + s))) return true;
    const parsed = parse(h);
    return Boolean(parsed.domain && domains.has(parsed.domain));
  };
}

function isSharedHost(hostname) {
  return SHARED_HOST_PATTERNS.some((p) => hostname === p || hostname.endsWith("." + p));
}

function isFreshDate(isoDate) {
  const ts = Date.parse(isoDate);
  if (Number.isNaN(ts)) return false;
  const diffDays = (Date.now() - ts) / (1000 * 60 * 60 * 24);
  return diffDays <= FRESH_DAYS;
}

function normalizePath(pathname) {
  if (!pathname) return "/";
  const clean = pathname.replace(/\/+$/, "");
  return clean || "/";
}

// Chuẩn hóa dòng từ danh sách AdGuard (||domain^), hosts (0.0.0.0 domain) hoặc URL thuần
function cleanBlocklistLine(raw) {
  let s = raw.trim();
  if (!s || s.startsWith("#") || s.startsWith("!") || s.startsWith("@@")) return "";
  if (s.startsWith("||")) {
    s = s.slice(2).split("^")[0].split("$")[0];
  } else if (/^(0\.0\.0\.0|127\.0\.0\.1)\s+/.test(s)) {
    s = s.split(/\s+/)[1] || "";
  }
  return s.trim();
}

function addEntry({
  rawUrlOrDomain,
  sourceName,
  updatedAt,
  isOfficial,
  popularDomains,
  buckets,
  stats,
}) {
  const trimmed = cleanBlocklistLine(rawUrlOrDomain);
  if (!trimmed) return;

  let u;
  const hasScheme = /^https?:\/\//i.test(trimmed);
  try {
    u = new URL(hasScheme ? trimmed : `https://${trimmed}/`);
  } catch {
    return;
  }

  const hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  if (!hostname || !hostname.includes(".")) return;

  if (isOfficial(hostname)) {
    stats.skippedOfficial++;
    return;
  }

  // Dùng Public Suffix List private section để tách theo từng site người dùng (web.app, github.io, vercel.app...)
  const p = parse(hostname, { allowPrivateDomains: true });
  const scopedDomain = (p.domain || hostname).toLowerCase();
  const publicInfo = parse(hostname, { allowPrivateDomains: false });
  const publicDomain = (publicInfo.domain || hostname).toLowerCase();

  const isPopular =
    popularDomains.has(hostname) ||
    popularDomains.has(publicDomain) ||
    popularDomains.has(scopedDomain) ||
    isSharedHost(hostname);

  const tier = isFreshDate(updatedAt) ? "fresh" : "stale";
  const pathOnly = normalizePath(u.pathname);

  if (isPopular) {
    if (!hasScheme || pathOnly.length < MIN_SHARED_PATH_LEN) {
      stats.droppedPopular++;
      return;
    }
    const key = `${hostname}${pathOnly}`;
    const map = tier === "fresh" ? buckets.freshPaths : buckets.stalePaths;
    if (!map.has(key)) map.set(key, { source: sourceName, updatedAt });
    stats.keptPaths++;
    return;
  }

  const domainMap = tier === "fresh" ? buckets.freshDomains : buckets.staleDomains;
  if (!domainMap.has(scopedDomain)) {
    domainMap.set(scopedDomain, { source: sourceName, updatedAt });
    stats.keptDomains++;
  }
}

function parseArgs(argv) {
  const out = {
    outPath: DEFAULT_OUT,
    trancoPath: DEFAULT_TRANCO,
    phishvnPath: null,
    phishvnDate: "2026-08-18",
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out" && argv[i + 1]) out.outPath = resolve(argv[++i]);
    else if (argv[i] === "--tranco" && argv[i + 1]) out.trancoPath = resolve(argv[++i]);
    else if (argv[i] === "--phishvn" && argv[i + 1]) out.phishvnPath = resolve(argv[++i]);
    else if (argv[i] === "--phishvn-date" && argv[i + 1]) out.phishvnDate = argv[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const today = new Date().toISOString().slice(0, 10);
  const isOfficial = loadWhitelistChecker();
  const popularDomains = await loadTrancoTop300k(args.trancoPath);

  const buckets = {
    freshDomains: new Map(),
    staleDomains: new Map(),
    freshPaths: new Map(),
    stalePaths: new Map(),
  };
  const stats = { skippedOfficial: 0, droppedPopular: 0, keptDomains: 0, keptPaths: 0 };
  const sourcesMeta = [];

  // 1. Nguồn vn-badsite-filter (tự đọc dòng "! Updated:" để xác định stale/fresh)
  try {
    const text = (await fetchFirstAvailable(VN_BADSITE_URLS, 25000)).toString("utf8");
    const updatedMatch = text.match(/^!\s*Updated:\s*(\d{4}-\d{2}-\d{2})/im);
    const updatedAt = updatedMatch ? updatedMatch[1] : "2025-04-11";
    let count = 0;
    for (const line of text.split(/\r?\n/)) {
      if (!cleanBlocklistLine(line)) continue;
      count++;
      addEntry({
        rawUrlOrDomain: line,
        sourceName: "vn-badsite-filter",
        updatedAt,
        isOfficial,
        popularDomains,
        buckets,
        stats,
      });
    }
    sourcesMeta.push({ name: "vn-badsite-filter", updatedAt, rawCount: count });
  } catch (err) {
    console.warn(`Cảnh báo vn-badsite-filter: ${err.message}`);
  }

  // 2. Nguồn OpenPhish community feed (live -> fresh)
  try {
    const text = (await fetchFirstAvailable(OPENPHISH_URLS, 25000)).toString("utf8");
    let count = 0;
    for (const line of text.split(/\r?\n/)) {
      if (!cleanBlocklistLine(line)) continue;
      count++;
      addEntry({
        rawUrlOrDomain: line,
        sourceName: "OpenPhish",
        updatedAt: today,
        isOfficial,
        popularDomains,
        buckets,
        stats,
      });
    }
    sourcesMeta.push({ name: "OpenPhish", updatedAt: today, rawCount: count });
  } catch (err) {
    console.warn(`Cảnh báo OpenPhish: ${err.message}`);
  }

  // 3. Nguồn PhishVN CSV cục bộ (tùy chọn qua --phishvn)
  if (args.phishvnPath && existsSync(args.phishvnPath)) {
    const csv = readFileSync(args.phishvnPath, "utf8");
    let count = 0;
    for (const line of csv.split(/\r?\n/).slice(1)) {
      if (!line.trim()) continue;
      const firstCell = line.split(",")[0].replace(/^"|"$/g, "").trim();
      if (!firstCell) continue;
      count++;
      addEntry({
        rawUrlOrDomain: firstCell,
        sourceName: "PhishVN",
        updatedAt: args.phishvnDate,
        isOfficial,
        popularDomains,
        buckets,
        stats,
      });
    }
    sourcesMeta.push({ name: "PhishVN", updatedAt: args.phishvnDate, rawCount: count });
  }

  // 4. Nguồn PhishTank (tùy chọn qua biến môi trường PHISHTANK_APP_KEY)
  if (process.env.PHISHTANK_APP_KEY) {
    try {
      const ptUrl = `https://data.phishtank.com/data/${encodeURIComponent(
        process.env.PHISHTANK_APP_KEY,
      )}/online-valid.json`;
      const rawJson = (await downloadBuffer(ptUrl, 30000)).toString("utf8");
      const list = JSON.parse(rawJson);
      let count = 0;
      for (const item of list) {
        if (!item?.url) continue;
        count++;
        addEntry({
          rawUrlOrDomain: item.url,
          sourceName: "PhishTank",
          updatedAt: today,
          isOfficial,
          popularDomains,
          buckets,
          stats,
        });
      }
      sourcesMeta.push({ name: "PhishTank", updatedAt: today, rawCount: count });
    } catch (err) {
      console.warn(`Cảnh báo PhishTank: ${err.message}`);
    }
  }

  const outObj = {
    generatedAt: new Date().toISOString(),
    sources: sourcesMeta,
    stats: {
      popularGuardCount: popularDomains.size,
      ...stats,
      freshDomains: buckets.freshDomains.size,
      staleDomains: buckets.staleDomains.size,
      freshPaths: buckets.freshPaths.size,
      stalePaths: buckets.stalePaths.size,
    },
    freshDomains: Object.fromEntries(buckets.freshDomains),
    staleDomains: Object.fromEntries(buckets.staleDomains),
    freshPaths: Object.fromEntries(buckets.freshPaths),
    stalePaths: Object.fromEntries(buckets.stalePaths),
  };

  mkdirSync(dirname(args.outPath instanceof URL ? args.outPath : resolve(args.outPath)), {
    recursive: true,
  });
  writeFileSync(args.outPath, JSON.stringify(outObj), "utf8");

  console.log("--- Kết quả tổng hợp blocklist ---");
  console.log(`Nguồn đã nạp: ${sourcesMeta.map((s) => `${s.name} (${s.rawCount})`).join(", ")}`);
  console.log(
    `Tên miền giữ lại: fresh=${buckets.freshDomains.size}, stale=${buckets.staleDomains.size}`,
  );
  console.log(
    `Đường dẫn giữ lại (shared/popular >=10 ký tự): fresh=${buckets.freshPaths.size}, stale=${buckets.stalePaths.size}`,
  );
  console.log(
    `Đã loại để chống báo nhầm: official=${stats.skippedOfficial}, popular/short=${stats.droppedPopular}`,
  );
}

main().catch((err) => {
  console.error("Lỗi:", err?.message || err);
  process.exit(1);
});
