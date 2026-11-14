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
    // A3 chèn nhánh DEMO_OFFLINE ở đây

    if (!result) {
      const signals = (await sendToTab(tab.id, { type: "getSignals" })) || {};
      if (!(await stillHere())) return;

      const sensitive =
        signals.hasPasswordField || signals.hasOtpField || signals.hasCardField;
      let screenshot;
      if (sensitive || hostnameHasBrandKeyword(official, url.hostname)) {
        const fresh = await chrome.tabs.get(tab.id).catch(() => null);
        if (fresh && fresh.active && fresh.url === myUrl) {
          screenshot = (await captureScreenshot(fresh)) || undefined;
        }
        if (!(await stillHere())) return;
      }

      result = await callAnalyze({
        url: tab.url,
        title: tab.title || "",
        screenshot,
        signals,
        mode: "full",
      });
    }

    if (!(await stillHere())) return;

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
      await setBadge(tab.id, null);
      await saveTabResult(tab.id, {
        error: String((e && e.message) || e),
        pageUrl: myUrl,
      });
    }
  } finally {
    if (inFlight.get(tab.id) === myUrl) inFlight.delete(tab.id);
  }
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "loading") {
    chrome.storage.session.remove(tabKey(tabId)).catch(() => {});
    return;
  }
  if (info.status === "complete" && tab.active && tab.url) {
    setTimeout(() => {
      chrome.tabs
        .get(tabId)
        .then((fresh) => {
          if (fresh && fresh.active && fresh.url === tab.url) return check(fresh);
        })
        .catch(() => {});
    }, 300);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  inFlight.delete(tabId);
  chrome.storage.session.remove(tabKey(tabId)).catch(() => {});
});
