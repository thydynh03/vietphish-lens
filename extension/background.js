importScripts("config.js");

const CFG = self.VP_CONFIG;

const BADGES = {
  SAFE: { text: "✓", color: "#26734a" },
  SUSPICIOUS: { text: "!", color: "#a8670f" },
  DANGER: { text: "✕", color: "#c0322b" },
  CHECKING: { text: "…", color: "#566576" },
};

const inFlight = new Map();

function tabKey(tabId) {
  return "tab:" + tabId;
}

async function setBadge(tabId, kind) {
  try {
    if (!kind) {
      await chrome.action.setBadgeText({ tabId, text: "" });
      return;
    }
    const b = BADGES[kind];
    if (!b) return;
    await chrome.action.setBadgeBackgroundColor({ tabId, color: b.color });
    await chrome.action.setBadgeText({ tabId, text: b.text });
  } catch {
    // Tab có thể đã đóng
  }
}

async function saveTabResult(tabId, value) {
  try {
    await chrome.storage.session.set({ [tabKey(tabId)]: value });
  } catch (e) {
    console.warn("VietPhish: không lưu được kết quả tab", e);
  }
}

function sendToTab(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message).catch(() => undefined);
}

function lazyJson(fileName) {
  let cached = null;
  return function load() {
    if (!cached) {
      cached = fetch(chrome.runtime.getURL(fileName))
        .then((r) => {
          if (!r.ok) throw new Error("Không đọc được " + fileName);
          return r.json();
        })
        .catch((e) => {
          cached = null;
          throw e;
        });
    }
    return cached;
  };
}

const loadOfficial = lazyJson("official_domains.json");
const loadDemoCache = lazyJson("demo-cache.json");

function hostMatches(hostname, d) {
  return hostname === d || hostname.endsWith("." + d);
}

function isWhitelisted(official, hostname) {
  if (!official) return false;
  if ((official.trustedSuffixes || []).some((s) => hostMatches(hostname, s))) {
    return true;
  }
  return (official.brands || []).some((b) =>
    (b.domains || []).some((d) => hostMatches(hostname, d))
  );
}

function hostnameHasBrandKeyword(official, hostname) {
  if (!official) return false;
  return (official.brands || []).some((b) =>
    (b.keywords || []).some((k) => hostname.includes(k))
  );
}

// Cờ demo offline nằm ở storage.local để còn sau khi tắt Chrome.
async function isDemoOffline() {
  try {
    const { DEMO_OFFLINE } = await chrome.storage.local.get("DEMO_OFFLINE");
    return Boolean(DEMO_OFFLINE);
  } catch {
    return false;
  }
}

function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

async function shrinkScreenshot(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, CFG.SCREENSHOT_MAX_WIDTH / bitmap.width);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    const out = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: CFG.SCREENSHOT_QUALITY,
    });
    return "data:image/jpeg;base64," + bytesToBase64(new Uint8Array(await out.arrayBuffer()));
  } finally {
    if (bitmap.close) bitmap.close();
  }
}

async function captureScreenshot(tab) {
  let raw;
  try {
    raw = await Promise.race([
      chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 70 }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Chụp màn hình quá 3 giây")), 3000)
      ),
    ]);
  } catch (e) {
    console.warn("VietPhish: không chụp được màn hình", e);
    return null;
  }
  try {
    return await shrinkScreenshot(raw);
  } catch (e) {
    console.warn("VietPhish: không thu nhỏ được ảnh, dùng ảnh gốc", e);
    return raw;
  }
}

// Trả { brand, keyword } đầu tiên mà hostname chứa keyword, không có thì null.
function brandKeywordHit(official, hostname) {
  for (const b of official.brands || []) {
    for (const k of b.keywords || []) if (k && hostname.includes(k)) return { brand: b, keyword: k };
  }
  return null;
}

// Chế độ cơ bản (K3): server không trả lời được. Tự kết luận từ tên miền để không mất bảo vệ hoàn toàn.
function offlineResult(official, hostname) {
  const hit = brandKeywordHit(official, hostname);
  if (!hit) return null;
  const officialDomain = (hit.brand.domains || [])[0] || "";
  return {
    verdict: "SUSPICIOUS",
    riskScore: 50,
    offline: true,
    degraded: true,
    brand: officialDomain ? { id: hit.brand.id, name: hit.brand.name, officialUrl: "https://" + officialDomain } : null,
    reasons: [
      {
        code: "OFFLINE_BASIC_CHECK",
        text:
          "Không kết nối được máy chủ kiểm tra. Kiểm tra cơ bản: tên miền " + hostname + " chứa '" + hit.keyword +
          "' nhưng không phải tên miền chính thức " + officialDomain + ".",
        weight: 0,
      },
    ],
  };
}

async function callAnalyze(payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CFG.REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(CFG.API_BASE + "/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error("Server trả HTTP " + res.status);
    const data = await res.json();
    if (!data || typeof data.verdict !== "string") {
      throw new Error("Phản hồi server sai định dạng");
    }
    return data;
  } catch (e) {
    if (e && e.name === "AbortError") {
      throw new Error(
        "Server không phản hồi trong " + CFG.REQUEST_TIMEOUT_MS / 1000 + " giây"
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function check(tab) {
  if (!tab || !tab.url || typeof tab.id !== "number") return;

  let url;
  try {
    url = new URL(tab.url);
  } catch {
    return;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    await setBadge(tab.id, null);
    try {
      await chrome.storage.session.remove(tabKey(tab.id));
    } catch {
      // Bỏ qua lỗi xóa session
    }
    return;
  }

  if (inFlight.get(tab.id) === tab.url) return;

  const myUrl = tab.url;
  inFlight.set(tab.id, myUrl);

  const stillHere = async () => {
    const now = await chrome.tabs.get(tab.id).catch(() => null);
    return Boolean(now && now.url === myUrl);
  };

  // Khai báo ngoài try để khối catch (chế độ cơ bản) đọc được.
  let sensitive = false;

  // Trang đổi URL mà vẫn cùng document (SPA dùng pushState hoặc hash) sau khi đã gửi lock:
  // gỡ khóa để form không bị kẹt tới 15 giây. Chỉ gỡ khi chưa có lượt kiểm mới cho tab này,
  // vì lượt mới có thể vừa khóa trang mới và unlock của lượt cũ sẽ mở nhầm.
  const releaseStaleLock = async () => {
    if (sensitive && inFlight.get(tab.id) === myUrl) await sendToTab(tab.id, { type: "unlock" });
  };

  try {
    const official = await loadOfficial();

    if (isWhitelisted(official, url.hostname)) {
      await setBadge(tab.id, "SAFE");
      await saveTabResult(tab.id, {
        verdict: "SAFE",
        riskScore: 0,
        whitelisted: true,
        pageUrl: myUrl,
      });
      await sendToTab(tab.id, { type: "clear" });
      return;
    }

    await setBadge(tab.id, "CHECKING");
    await saveTabResult(tab.id, { checking: true, pageUrl: myUrl });

    let result = null;
    // Chế độ demo offline: tra cache theo hostname, không có thì đi tiếp bình thường.
    if (await isDemoOffline()) {
      try {
        const cache = await loadDemoCache();
        if (cache && cache[url.hostname]) result = cache[url.hostname];
      } catch (e) {
        console.warn("VietPhish: không đọc được demo-cache", e);
      }
    }

    if (!result) {
      const signals = (await sendToTab(tab.id, { type: "getSignals" })) || {};
      if (!(await stillHere())) return;

      sensitive = Boolean(signals.hasPasswordField || signals.hasOtpField || signals.hasCardField);
      // K1: trang lạ có ô nhạy cảm thì khóa gửi biểu mẫu trong lúc chờ kết luận (content.js, bước A4).
      if (sensitive) await sendToTab(tab.id, { type: "lock" });
      let screenshot;
      if (sensitive || hostnameHasBrandKeyword(official, url.hostname)) {
        const fresh = await chrome.tabs.get(tab.id).catch(() => null);
        if (fresh && fresh.active && fresh.url === myUrl) {
          screenshot = (await captureScreenshot(fresh)) || undefined;
        }
        if (!(await stillHere())) {
          await releaseStaleLock();
          return;
        }
      }

      result = await callAnalyze({
        url: url.origin + url.pathname,
        title: tab.title || "",
        screenshot,
        signals,
        mode: "full",
      });
    }

    if (!(await stillHere())) {
      await releaseStaleLock();
      return;
    }

    await setBadge(tab.id, BADGES[result.verdict] ? result.verdict : null);
    await saveTabResult(tab.id, { ...result, pageUrl: myUrl });

    if (result.verdict !== "SAFE") {
      await sendToTab(tab.id, { type: "verdict", result });
    } else {
      await sendToTab(tab.id, { type: "clear" });
    }
  } catch (e) {
    console.warn("VietPhish: lỗi khi kiểm tra", e);
    if (await stillHere()) {
      let local = null;
      try {
        // new URL(myUrl), không dùng biến url: tùy cách viết bước 2, url có thể không nằm trong phạm vi của catch.
        local = offlineResult(await loadOfficial(), new URL(myUrl).hostname);
      } catch (e2) {
        local = null;
      }
      if (local && sensitive) {
        // Trang đòi mật khẩu/OTP/số thẻ: hiện dải vàng, content script chuyển sang hỏi lại khi bấm vào ô (A4).
        // Không lưu trường error: popup của A3 xét error trước verdict, sẽ hiện "Chưa kiểm tra" lệch với dải vàng.
        await setBadge(tab.id, "SUSPICIOUS");
        await saveTabResult(tab.id, { ...local, pageUrl: myUrl });
        await sendToTab(tab.id, { type: "verdict", result: local });
      } else if (local) {
        // Không đòi dữ liệu nhạy cảm: chỉ đổi huy hiệu, không phủ dải (tránh làm phiền trang công ty con của ngân hàng).
        await setBadge(tab.id, "SUSPICIOUS");
        await saveTabResult(tab.id, { ...local, pageUrl: myUrl });
        await sendToTab(tab.id, { type: "unlock" });
      } else {
        await setBadge(tab.id, null);
        await saveTabResult(tab.id, { error: String((e && e.message) || e), pageUrl: myUrl });
        await sendToTab(tab.id, { type: "unlock" });
      }
    } else {
      await releaseStaleLock();
    }
  } finally {
    if (inFlight.get(tab.id) === myUrl) inFlight.delete(tab.id);
  }
}

// Trang tải mãi không xong (quảng cáo, kết nối treo) thì Chrome không bao giờ báo "complete".
// Vì vậy khi trang bắt đầu tải, hẹn thêm một lượt kiểm tra dự phòng. Lượt nào chạy trước thì lượt sau bỏ qua.
const FALLBACK_CHECK_MS = 5000;
const fallbackTimers = new Map(); // tabId -> id của setTimeout
const autoChecked = new Map(); // tabId -> URL đã được kiểm tra tự động trong lần tải này

function autoCheck(tabId, url) {
  if (autoChecked.get(tabId) === url) return;
  chrome.tabs
    .get(tabId)
    .then((fresh) => {
      if (!fresh || !fresh.active || fresh.url !== url || autoChecked.get(tabId) === url) return;
      autoChecked.set(tabId, url);
      return check(fresh);
    })
    .catch(() => {});
}

function clearFallback(tabId) {
  const t = fallbackTimers.get(tabId);
  if (t !== undefined) clearTimeout(t);
  fallbackTimers.delete(tabId);
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "loading") {
    chrome.storage.session.remove(tabKey(tabId)).catch(() => {});
    autoChecked.delete(tabId);
    clearFallback(tabId);
    if (tab.url) {
      const url = tab.url;
      fallbackTimers.set(
        tabId,
        setTimeout(() => {
          fallbackTimers.delete(tabId);
          autoCheck(tabId, url);
        }, FALLBACK_CHECK_MS)
      );
    }
    return;
  }
  if (info.status === "complete" && tab.active && tab.url) {
    clearFallback(tabId);
    const url = tab.url;
    setTimeout(() => autoCheck(tabId, url), 300);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  inFlight.delete(tabId);
  autoChecked.delete(tabId);
  clearFallback(tabId);
  chrome.storage.session.remove(tabKey(tabId)).catch(() => {});
});

// Tin từ popup. Trả lời đồng bộ nên KHÔNG return true.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "recheck" && typeof msg.tabId === "number") {
    chrome.tabs.get(msg.tabId).then((tab) => check(tab)).catch((e) => console.warn("VietPhish: recheck lỗi", e));
    sendResponse({ ok: true });
  }
});
