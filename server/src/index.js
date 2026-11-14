import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { analyze } from "./analyze.js";
import { visionStatus, VISION_CONFIG } from "./vision.js";

const MAX_BODY = 8 * 1024 * 1024;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;
const RATE_MAX = 60;
const RATE_WINDOW_MS = 60 * 1000;
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};

const cache = new Map();
const hits = new Map();

function send(res, status, obj) {
  res.writeHead(status, { ...CORS, "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let over = false;

    function tooLarge() {
      over = true;
      chunks.length = 0;
      const err = new Error("Body quá lớn");
      err.status = 413;
      reject(err);
    }

    if (Number(req.headers["content-length"]) > MAX_BODY) {
      tooLarge();
      req.resume();
      return;
    }

    req.on("data", c => {
      if (over) return;
      size += c.length;
      if (size > MAX_BODY) {
        tooLarge();
      } else {
        chunks.push(c);
      }
    });

    req.on("end", () => {
      if (!over) {
        resolve(Buffer.concat(chunks).toString("utf8"));
      }
    });

    req.on("error", reject);
  });
}

function rateLimited(ip) {
  const now = Date.now();
  if (hits.size > 10000) {
    for (const [k, v] of hits.entries()) {
      if (now - v.start >= RATE_WINDOW_MS) {
        hits.delete(k);
      }
    }
  }
  const e = hits.get(ip);
  if (!e || now - e.start >= RATE_WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 });
    return false;
  }
  e.count++;
  return e.count > RATE_MAX;
}

function cacheGet(key) {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return e.result;
}

function cacheSet(key, result) {
  if (result.degraded) return;
  if (cache.size >= CACHE_MAX) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, { at: Date.now(), result });
}

function logLine(result, url, screenshot) {
  const img = screenshot ? "ảnh " + Math.round(screenshot.length / 1024) + "KB" : "không ảnh";
  const l = result.layers || {};
  const layers = `wl=${l.whitelist} sb=${l.safeBrowsing ?? "-"} h=${l.heuristics ?? "-"} v=${l.vision?.brand_detected ?? (l.vision?.error ? "lỗi" : "-")}`;
  let msg = `[${result.verdict} ${result.riskScore}] ${url} (${img}) ${layers} ${result.latencyMs?.total ?? 0}ms`;
  if (result.cached) msg += " cache";
  console.log(msg);
}

export async function handler(req, res) {
  try {
    const path = new URL(req.url, "http://x").pathname;
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS);
      res.end();
      return;
    }
    if (req.method === "GET" && path === "/health") {
      return send(res, 200, { ok: true, vision: visionStatus(), safeBrowsing: process.env.SAFE_BROWSING_KEY ? "on" : "off", model: VISION_CONFIG.model });
    }
    if (req.method === "POST" && path === "/analyze") {
      const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";
      if (rateLimited(ip)) {
        return send(res, 429, { error: "Quá nhiều yêu cầu, thử lại sau." });
      }
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch (e) {
        if (e.status === 413) {
          return send(res, 413, { error: "Body quá lớn" });
        }
        return send(res, 400, { error: "Body không phải JSON hợp lệ" });
      }
      if (!body || typeof body !== "object" || typeof body.url !== "string") {
        return send(res, 400, { error: "Thiếu trường url" });
      }
      let parsed;
      try {
        parsed = new URL(body.url);
      } catch (e) {
        return send(res, 400, { error: "url không hợp lệ" });
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return send(res, 400, { error: "Chỉ hỗ trợ url http hoặc https" });
      }
      const mode = ["full", "no_vision", "blacklist_only"].includes(body.mode) ? body.mode : "full";
      const signals = body.signals && typeof body.signals === "object" ? body.signals : {};
      const key = [mode, body.url, JSON.stringify(signals), body.screenshot ? "1" : "0"].join("|");
      const hit = cacheGet(key);
      if (hit) {
        const out = { ...hit, cached: true };
        logLine(out, body.url, body.screenshot);
        return send(res, 200, out);
      }
      const result = { ...(await analyze({ ...body, mode, signals })), cached: false };
      cacheSet(key, result);
      logLine(result, body.url, body.screenshot);
      return send(res, 200, result);
    }
    return send(res, 404, { error: "Not found" });
  } catch (e) {
    console.error("Lỗi:", e);
    if (!res.headersSent) {
      return send(res, 500, { error: String(e?.message || e) });
    } else {
      res.end();
    }
  }
}

function isMain() {
  if (!process.argv[1]) return false;
  try {
    const self = realpathSync.native(fileURLToPath(import.meta.url));
    const arg = resolvePath(process.argv[1]);
    for (const cand of [arg, arg + ".js"]) {
      try { if (realpathSync.native(cand) === self) return true; } catch {}
    }
  } catch {}
  return false;
}

if (isMain()) {
  const port = Number(process.env.PORT) || 8787;
  createServer(handler).listen(port, "0.0.0.0", () => {
    console.log(`VietPhish Lens server: cổng ${port}`);
    console.log(`  vision: ${visionStatus()} | safeBrowsing: ${process.env.SAFE_BROWSING_KEY ? "on" : "off"} | model: ${VISION_CONFIG.model}`);
  });
}
