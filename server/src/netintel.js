import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { parse } from "tldts";

// Ngân sách thời gian. Timeout bên trong (RDAP, TLS) phải ngắn hơn timeout tổng
// để khi lookup tự hủy thì kết quả lỗi về trước, còn timeout tổng chỉ là lưới an toàn.
export const OUTER_TIMEOUT_MS = 1500;
export const INNER_TIMEOUT_MS = 1300;

const DAY_MS = 24 * 60 * 60 * 1000;
const USER_AGENT = "vietphish-lens-netintel/0.1";

export function getRegistrableDomain(hostname) {
  const parsed = parse(hostname);
  return parsed.domain || hostname;
}

function isTimeoutError(error) {
  return error?.name === "TimeoutError" || error?.name === "AbortError";
}

// customFetch và tls.connect được đọc lúc gọi (không chụp lúc import),
// để test có thể thay globalThis.fetch hoặc tls.connect.
// fetch gốc của Node lúc import. Nếu globalThis.fetch vẫn là nó thì RDAP đi qua
// httpsGetIpv4. Nếu test đã thay globalThis.fetch thì dùng bản thay thế đó.
const NATIVE_FETCH = globalThis.fetch;
const RDAP_MAX_BYTES = 1024 * 1024;

// GET JSON chỉ qua IPv4, tự theo redirect https (rdap.org trả 302 sang registry).
// Lý do: rdap.verisign.com có địa chỉ IPv6 2001:500:30ff::30 không tới được từ mạng này.
// fetch mặc định thử IPv6 trước rồi mới lùi về IPv4, mất ~900 ms thay vì ~170 ms.
function httpsGetIpv4(url, { headers, signal }, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { family: 4, headers, signal }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) return reject(new Error("Too many redirects"));
        const next = new URL(res.headers.location, url);
        if (next.protocol !== "https:") return reject(new Error("Non-https redirect"));
        return httpsGetIpv4(next.href, { headers, signal }, redirectsLeft - 1).then(resolve, reject);
      }
      const chunks = [];
      let size = 0;
      res.on("data", (c) => {
        size += c.length;
        if (size > RDAP_MAX_BYTES) req.destroy(new Error("RDAP response too large"));
        else chunks.push(c);
      });
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve({ ok: status >= 200 && status < 300, status, json: async () => JSON.parse(body) });
      });
      res.on("error", reject);
    });
    req.on("error", reject);
  });
}

export async function checkRdapAge(registrableDomain, customFetch, { timeoutMs = INNER_TIMEOUT_MS } = {}) {
  const doFetch = customFetch || (globalThis.fetch === NATIVE_FETCH ? httpsGetIpv4 : globalThis.fetch);
  try {
    // rdap.org chặn User-Agent mặc định "node" của undici bằng HTTP 403,
    // nên phải gửi một User-Agent riêng (trung thực, không giả curl).
    const res = await doFetch("https://rdap.org/domain/" + encodeURIComponent(registrableDomain), {
      headers: { accept: "application/rdap+json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res || !res.ok) {
      return { ageDays: null, error: "HTTP " + (res ? res.status : "no response") };
    }
    const data = await res.json();
    const regEvent = data?.events?.find((e) => e.eventAction === "registration");
    if (!regEvent || !regEvent.eventDate) {
      return { ageDays: null, error: "No registration event" };
    }
    const regTime = new Date(regEvent.eventDate).getTime();
    if (Number.isNaN(regTime)) {
      return { ageDays: null, error: "Invalid registration date" };
    }
    const ageDays = Math.floor((Date.now() - regTime) / DAY_MS);
    return { ageDays: Math.max(0, ageDays), source: "rdap" };
  } catch (error) {
    return { ageDays: null, error: error?.message || String(error), timedOut: isTimeoutError(error) };
  }
}

export async function checkTlsCert(hostname, customTlsConnect, { timeoutMs = INNER_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let socket;
    let timer;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket?.destroy();
      } catch {
        // bỏ qua
      }
      resolve(result);
    };

    try {
      const connect = customTlsConnect || tls.connect;
      socket = connect({
        host: hostname,
        port: 443,
        // SNI bắt buộc: badssl.com và mọi host dùng chung IP trả cert mặc định nếu thiếu servername.
        servername: net.isIP(hostname) ? undefined : hostname,
        rejectUnauthorized: false
      });
    } catch (error) {
      finish({ error: error?.message || String(error) });
      return;
    }

    timer = setTimeout(() => finish({ error: "Timeout", timedOut: true }), timeoutMs);

    socket.on("secureConnect", () => {
      if (settled) return;
      let cert;
      try {
        cert = socket.getPeerCertificate() || {};
      } catch (error) {
        finish({ error: error?.message || String(error) });
        return;
      }
      const validFrom = cert.valid_from ? new Date(cert.valid_from) : null;
      const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
      const certAgeDays =
        validFrom && !Number.isNaN(validFrom.getTime()) ? Math.max(0, Math.floor((Date.now() - validFrom.getTime()) / DAY_MS)) : null;
      finish({
        authorized: socket.authorized,
        authorizationError: socket.authorizationError,
        validFrom,
        validTo,
        certAgeDays,
        subjectO: cert.subject?.O,
        issuerO: cert.issuer?.O
      });
    });

    // Listener này giữ nguyên sau khi settled để lỗi muộn (sau destroy) không thành unhandled.
    socket.on("error", (error) => finish({ error: error?.message || String(error) }));
  });
}

export function scoreNetIntel(facts, { sensitive = false, brandLike = false } = {}) {
  let score = 0;
  const reasons = [];

  if (facts.isHttps && facts.tls && !facts.tls.error && facts.tls.authorized === false) {
    score += 25;
    reasons.push({
      code: "TLS_INVALID",
      points: 25,
      message: "Chứng chỉ bảo mật SSL/TLS của trang không hợp lệ hoặc đã hết hạn."
    });
  }

  if (facts.ageDays != null) {
    if (facts.ageDays <= 7) {
      score += 25;
      reasons.push({
        code: "NEW_DOMAIN",
        points: 25,
        message: `Tên miền mới được tạo ${facts.ageDays} ngày trước, dấu hiệu phổ biến của trang giả mạo vừa dựng.`,
        source: facts.ageSource
      });
    } else if (facts.ageDays <= 30) {
      score += 15;
      reasons.push({
        code: "NEW_DOMAIN",
        points: 15,
        message: `Tên miền mới được tạo ${facts.ageDays} ngày trước, dấu hiệu phổ biến của trang giả mạo vừa dựng.`,
        source: facts.ageSource
      });
    }
  }

  if (
    facts.tls &&
    !facts.tls.error &&
    facts.tls.subjectO == null &&
    facts.tls.certAgeDays != null &&
    facts.tls.certAgeDays <= 14 &&
    (sensitive || brandLike)
  ) {
    score += 15;
    reasons.push({
      code: "NEW_DV_CERT",
      points: 15,
      message: `Trang yêu cầu thông tin nhạy cảm nhưng dùng chứng chỉ miễn phí vừa cấp ${facts.tls.certAgeDays} ngày trước, không xác thực tên tổ chức.`
    });
  }

  return { score, reasons };
}

function isPrivateIPv4(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = p;
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64.0.0/10
    (a === 169 && b === 254) || // link-local
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast, reserved, broadcast
  );
}

// Trả về mảng 8 hextet (số) của một địa chỉ IPv6, hoặc null.
function expandIPv6(ip) {
  let s = ip.toLowerCase();
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);
  // Đuôi IPv4 nhúng (::ffff:1.2.3.4) đổi thành 2 hextet.
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const p = v4[1].split(".").map(Number);
    s = s.slice(0, -v4[1].length) + ((p[0] << 8) | p[1]).toString(16) + ":" + ((p[2] << 8) | p[3]).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  const parts = [...head, ...Array(Math.max(0, fill)).fill("0"), ...tail].map((h) => parseInt(h, 16));
  if (parts.length !== 8 || parts.some((n) => Number.isNaN(n))) return null;
  return parts;
}

function isPrivateIPv6(ip) {
  const h = expandIPv6(ip);
  if (!h) return true; // không đọc được thì coi như không an toàn để gọi ra ngoài
  const allZeroPrefix = h.slice(0, 5).every((x) => x === 0);
  if (allZeroPrefix && h[5] === 0 && h[6] === 0 && (h[7] === 0 || h[7] === 1)) return true; // :: và ::1
  if (allZeroPrefix && h[5] === 0xffff) {
    // IPv4-mapped ::ffff:a.b.c.d
    return isPrivateIPv4([h[6] >> 8, h[6] & 255, h[7] >> 8, h[7] & 255].join("."));
  }
  if ((h[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((h[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((h[0] & 0xff00) === 0xff00) return true; // multicast
  return false;
}

export function isSkippable(hostname, port) {
  if (port && port !== "80" && port !== "443") return true;
  if (!hostname) return true;
  // URL.hostname giữ ngoặc vuông cho IPv6 ("[::1]"), và có thể có dấu chấm cuối.
  let host = String(hostname).toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  host = host.replace(/\.+$/, "");
  if (!host) return true;

  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;

  const ipVersion = net.isIP(host);
  if (ipVersion === 4) return isPrivateIPv4(host);
  if (ipVersion === 6) return isPrivateIPv6(host);
  return false;
}

// Hai cache riêng: tuổi tên miền theo registrable domain, chứng chỉ TLS theo hostname.
// Chỉ lưu kết quả thành công, để một lần lỗi mạng không chặn lookup đúng trong 60 phút.
const CACHE_TTL = 60 * 60 * 1000;
const CACHE_MAX = 1000;
const ageCache = new Map();
const tlsCache = new Map();

function cacheGet(cache, key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.at >= CACHE_TTL) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet(cache, key, value) {
  if (cache.has(key)) cache.delete(key);
  while (cache.size >= CACHE_MAX) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, { at: Date.now(), value });
}

// Dùng trong test.
export function _resetNetIntelCache() {
  ageCache.clear();
  tlsCache.clear();
}

export function _netIntelCacheStats() {
  return { ageKeys: [...ageCache.keys()], tlsKeys: [...tlsCache.keys()] };
}

function skippedResult(startTime) {
  return { score: 0, reasons: [], facts: {}, skipped: true, degraded: false, ms: Date.now() - startTime };
}

export async function inspectNetIntel(url, { sensitive = false, brandLike = false } = {}, customFetch, customTlsConnect) {
  if (process.env.NET_INTEL !== "1") {
    return { score: 0, reasons: [], facts: {}, skipped: true, degraded: false, ms: 0 };
  }

  const startTime = Date.now();
  let u;
  try {
    u = new URL(url);
  } catch {
    return skippedResult(startTime);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return skippedResult(startTime);

  const hostname = u.hostname;
  const isHttps = u.protocol === "https:";
  if (isSkippable(hostname, u.port)) return skippedResult(startTime);

  const host = hostname.toLowerCase().replace(/\.+$/, "");
  const registrableDomain = getRegistrableDomain(host);

  const cachedAge = cacheGet(ageCache, registrableDomain);
  const cachedTls = isHttps ? cacheGet(tlsCache, host) : null;

  const agePromise = cachedAge
    ? Promise.resolve(cachedAge)
    : checkRdapAge(registrableDomain, customFetch).then((r) => {
        if (r.ageDays != null && !r.error) cacheSet(ageCache, registrableDomain, r);
        return r;
      });
  const tlsPromise = !isHttps
    ? Promise.resolve(null)
    : cachedTls
      ? Promise.resolve(cachedTls)
      : checkTlsCert(host, customTlsConnect).then((r) => {
          if (r && !r.error) cacheSet(tlsCache, host, r);
          return r;
        });

  const work = Promise.all([agePromise, tlsPromise]);
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve("timeout"), OUTER_TIMEOUT_MS);
  });
  let result;
  try {
    result = await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }

  if (result === "timeout") {
    return { score: 0, reasons: [], facts: {}, skipped: false, degraded: true, ms: Date.now() - startTime };
  }

  const [rdapRes, tlsRes] = result;
  const facts = {
    isHttps,
    ageDays: rdapRes.ageDays ?? null,
    ageSource: rdapRes.source,
    tls: tlsRes ? stripInternal(tlsRes) : null
  };
  // Lookup nào hết giờ bên trong thì cũng tính là degraded, giống timeout tổng.
  const degraded = Boolean(rdapRes.timedOut || tlsRes?.timedOut);

  const { score, reasons } = scoreNetIntel(facts, { sensitive, brandLike });
  return { score, reasons, facts, skipped: false, degraded, ms: Date.now() - startTime };
}

function stripInternal(tlsRes) {
  if (tlsRes.error) return { error: tlsRes.error };
  const { timedOut, ...rest } = tlsRes;
  return rest;
}
