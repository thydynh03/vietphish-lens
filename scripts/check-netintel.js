// Kiểm tra SSL/TLS (node:tls) và tuổi tên miền/chứng chỉ (RDAP + CT Logs) để nhận diện web lậu mới dựng
import { readFileSync, realpathSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { createRequire } from "node:module";
import { resolve as resolvePath } from "node:path";
import tls from "node:tls";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../server/package.json", import.meta.url));
const { parse } = require("tldts");

const OFFICIAL_PATH = fileURLToPath(new URL("../shared/official_domains.json", import.meta.url));
const MS_PER_DAY = 1000 * 60 * 60 * 24;

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

function getJsonIpv4(url, timeoutMs = 3000, redirectsLeft = 4) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === "http:" ? http : https;
    const req = client.get(
      parsed,
      {
        family: 4,
        headers: {
          accept: "application/rdap+json, application/json",
          "user-agent": "VietPhishLens/0.1",
        },
      },
      (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          redirectsLeft > 0
        ) {
          res.resume();
          const nextUrl = new URL(res.headers.location, parsed).href;
          getJsonIpv4(nextUrl, timeoutMs, redirectsLeft - 1).then(resolve, reject);
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch (err) {
            reject(err);
          }
        });
        res.on("error", reject);
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timeout ${timeoutMs}ms`)));
    req.on("error", reject);
  });
}

// Kiểm tra bắt tay TLS thật: tính hợp lệ, ngày cấp chứng chỉ và chứng chỉ DV không có tên tổ chức
export function inspectTls(hostname, port = 443, timeoutMs = 2500) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (val) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };

    const socket = tls.connect(
      {
        host: hostname,
        port,
        servername: hostname,
        rejectUnauthorized: false,
        family: 4,
      },
      () => {
        try {
          const cert = socket.getPeerCertificate();
          const validFrom = cert?.valid_from ? Date.parse(cert.valid_from) : NaN;
          const validTo = cert?.valid_to ? Date.parse(cert.valid_to) : NaN;
          const certAgeDays = Number.isNaN(validFrom)
            ? null
            : Math.max(0, Math.floor((Date.now() - validFrom) / MS_PER_DAY));
          const org = cert?.subject?.O || null;
          const issuerOrg = cert?.issuer?.O || cert?.issuer?.CN || null;
          done({
            reachable: true,
            authorized: Boolean(socket.authorized),
            authorizationError: socket.authorizationError || null,
            validFrom: Number.isNaN(validFrom) ? null : new Date(validFrom).toISOString(),
            validTo: Number.isNaN(validTo) ? null : new Date(validTo).toISOString(),
            certAgeDays,
            subjectOrg: org,
            issuerOrg,
            isDvOnly: !org,
          });
        } catch (err) {
          done({ reachable: false, authorized: false, error: err.message });
        } finally {
          socket.destroy();
        }
      },
    );

    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      done({ reachable: false, authorized: false, error: `Timeout ${timeoutMs}ms` });
    });

    socket.on("error", (err) => {
      socket.destroy();
      done({ reachable: false, authorized: false, error: err.message });
    });
  });
}

// Tra cứu ngày đăng ký tên miền qua giao thức RDAP công khai
export async function queryRdapAge(registrableDomain, timeoutMs = 3000) {
  try {
    const data = await getJsonIpv4(
      `https://rdap.org/domain/${encodeURIComponent(registrableDomain)}`,
      timeoutMs,
    );
    const events = Array.isArray(data?.events) ? data.events : [];
    const reg = events.find((e) => String(e?.eventAction || "").toLowerCase() === "registration");
    if (!reg?.eventDate) return { found: false, ageDays: null, registeredAt: null };
    const ts = Date.parse(reg.eventDate);
    if (Number.isNaN(ts)) return { found: false, ageDays: null, registeredAt: null };
    return {
      found: true,
      registeredAt: new Date(ts).toISOString(),
      ageDays: Math.max(0, Math.floor((Date.now() - ts) / MS_PER_DAY)),
    };
  } catch (err) {
    return { found: false, ageDays: null, registeredAt: null, error: err.message };
  }
}

// Fallback lịch sử chứng chỉ đầu tiên qua Certificate Transparency (hữu ích với .vn / .cc khi thiếu RDAP)
export async function queryCtFirstSeen(registrableDomain, timeoutMs = 4000) {
  try {
    const rows = await getJsonIpv4(
      `https://crt.sh/?q=${encodeURIComponent(registrableDomain)}&output=json`,
      timeoutMs,
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      return { found: false, ageDays: null, firstSeenAt: null };
    }
    let minTs = Infinity;
    for (const r of rows) {
      const ts = Date.parse(r?.entry_timestamp || r?.not_before || "");
      if (!Number.isNaN(ts) && ts < minTs) minTs = ts;
    }
    if (!Number.isFinite(minTs)) return { found: false, ageDays: null, firstSeenAt: null };
    return {
      found: true,
      firstSeenAt: new Date(minTs).toISOString(),
      ageDays: Math.max(0, Math.floor((Date.now() - minTs) / MS_PER_DAY)),
    };
  } catch (err) {
    return { found: false, ageDays: null, firstSeenAt: null, error: err.message };
  }
}

// Chấm điểm bổ sung SSL/TLS + Timestamp mà không gây báo nhầm trang dùng Let's Encrypt gia hạn định kỳ
export async function analyzeNetIntel(
  rawUrl,
  { sensitive = false, brandMismatch = false, useCtFallback = true } = {},
) {
  const isOfficial = loadWhitelistChecker();
  const u = new URL(rawUrl);
  const hostname = u.hostname.toLowerCase();
  const registrable = (parse(hostname).domain || hostname).toLowerCase();

  if (isOfficial(hostname)) {
    return {
      url: rawUrl,
      hostname,
      registrable,
      whitelisted: true,
      score: 0,
      reasons: [],
    };
  }

  const isHttps = u.protocol === "https:";
  const port = u.port ? Number(u.port) : isHttps ? 443 : 80;

  const [tlsInfo, rdapInfo] = await Promise.all([
    isHttps ? inspectTls(hostname, port) : Promise.resolve(null),
    queryRdapAge(registrable),
  ]);

  let ctInfo = null;
  if (!rdapInfo.found && useCtFallback) {
    ctInfo = await queryCtFirstSeen(registrable);
  }

  const reasons = [];
  let score = 0;

  if (!isHttps) {
    score += 10;
    reasons.push({
      code: "NO_HTTPS",
      weight: 10,
      text: "Trang không dùng kết nối bảo mật HTTPS.",
    });
  } else if (tlsInfo && tlsInfo.reachable && !tlsInfo.authorized) {
    score += 25;
    reasons.push({
      code: "TLS_INVALID",
      weight: 25,
      text: `Chứng chỉ bảo mật SSL/TLS của trang không hợp lệ (${tlsInfo.authorizationError || "chưa xác thực"}).`,
    });
  }

  const domainAgeDays = rdapInfo.found ? rdapInfo.ageDays : ctInfo?.found ? ctInfo.ageDays : null;
  const ageSource = rdapInfo.found ? "RDAP" : ctInfo?.found ? "CT Log" : null;

  if (domainAgeDays !== null && domainAgeDays <= 30) {
    const weight = domainAgeDays <= 7 ? 25 : 15;
    score += weight;
    reasons.push({
      code: "NEW_DOMAIN",
      weight,
      text: `Tên miền mới ghi nhận ${domainAgeDays} ngày trước (${ageSource}) — dấu hiệu phổ biến của trang giả mạo vừa dựng.`,
    });
  }

  // Bẫy Let's Encrypt auto-renew: chỉ cộng NEW_DV_CERT khi trang đòi thông tin nhạy cảm hoặc nghi giả thương hiệu
  if (
    tlsInfo &&
    tlsInfo.reachable &&
    tlsInfo.authorized &&
    tlsInfo.isDvOnly &&
    tlsInfo.certAgeDays !== null &&
    tlsInfo.certAgeDays <= 14 &&
    (sensitive || brandMismatch)
  ) {
    score += 15;
    reasons.push({
      code: "NEW_DV_CERT",
      weight: 15,
      text: `Trang yêu cầu thông tin nhạy cảm nhưng dùng chứng chỉ miễn phí vừa cấp ${tlsInfo.certAgeDays} ngày trước, không xác thực tên tổ chức.`,
    });
  }

  return {
    url: rawUrl,
    hostname,
    registrable,
    whitelisted: false,
    score: Math.min(60, score),
    reasons,
    tls: tlsInfo,
    rdap: rdapInfo,
    ct: ctInfo,
  };
}

function parseCliArgs(argv) {
  let sensitive = false;
  let brandMismatch = false;
  let noCt = false;
  const urls = [];
  for (const arg of argv) {
    if (arg === "--sensitive") sensitive = true;
    else if (arg === "--brand-mismatch") brandMismatch = true;
    else if (arg === "--no-ct") noCt = true;
    else urls.push(arg);
  }
  return { sensitive, brandMismatch, useCtFallback: !noCt, urls };
}

async function main() {
  const { sensitive, brandMismatch, useCtFallback, urls } = parseCliArgs(process.argv.slice(2));
  const targets =
    urls.length > 0
      ? urls
      : [
          "https://vietcombank.com.vn/",
          "https://vnexpress.net/ngan-hang-vietcombank-tang-lai-suat",
          "https://expired.badssl.com/",
          "https://self-signed.badssl.com/",
        ];

  for (const target of targets) {
    const r = await analyzeNetIntel(target, { sensitive, brandMismatch, useCtFallback });
    const ageLabel = r.rdap?.found
      ? `RDAP=${r.rdap.ageDays}d`
      : r.ct?.found
        ? `CT=${r.ct.ageDays}d`
        : "age=n/a";
    const tlsLabel = r.whitelisted
      ? "whitelist"
      : !r.tls
        ? "no-https"
        : !r.tls.reachable
          ? `tls-err(${r.tls.error})`
          : `tls=${r.tls.authorized ? "ok" : r.tls.authorizationError},certAge=${r.tls.certAgeDays}d,org=${r.tls.subjectOrg || "DV"}`;
    const codes = r.reasons.map((x) => x.code).join(", ") || "-";
    console.log(`[score=${r.score}] ${r.url} | ${ageLabel} | ${tlsLabel} | [${codes}]`);
  }
}

function isMain() {
  if (!process.argv[1]) return false;
  try {
    const self = realpathSync.native(fileURLToPath(import.meta.url));
    const arg = resolvePath(process.argv[1]);
    for (const cand of [arg, arg + ".js"]) {
      try {
        if (realpathSync.native(cand) === self) return true;
      } catch {}
    }
  } catch {}
  return false;
}

if (isMain()) {
  main().catch((err) => {
    console.error("Lỗi:", err?.message || err);
    process.exit(1);
  });
}
