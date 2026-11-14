// Popup của extension: hiện kết quả kiểm tra tab hiện tại. Mọi chữ hiển thị đều gán bằng textContent.
(function () {
  const LABELS = { SAFE: "An toàn", SUSPICIOUS: "Đáng ngờ", DANGER: "Nguy hiểm", CHECKING: "Đang kiểm tra", NONE: "Chưa kiểm tra" };

  const $ = (id) => document.getElementById(id);

  function showBadge(kind) {
    $("badge").textContent = LABELS[kind] || LABELS.NONE;
    $("badge").className = "badge " + (LABELS[kind] ? kind : "");
  }

  async function init() {
    // 1. Địa chỉ máy chủ
    $("server").textContent = "Máy chủ: " + self.VP_CONFIG.API_BASE;

    // 2. Ô tích demo offline
    const demo = $("demo");
    try {
      const { DEMO_OFFLINE } = await chrome.storage.local.get("DEMO_OFFLINE");
      demo.checked = Boolean(DEMO_OFFLINE);
    } catch (e) {
      // Bỏ qua, giữ ô tích chưa tích
    }
    demo.addEventListener("change", () => {
      chrome.storage.local.set({ DEMO_OFFLINE: demo.checked }).catch(() => {});
    });

    // 3. Tab đang hiển thị
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // 4. Tên miền
    let isWeb = false;
    if (tab && tab.url) {
      try {
        const u = new URL(tab.url);
        const hostname = u.hostname || u.protocol;
        isWeb = u.protocol === "http:" || u.protocol === "https:";
        $("host").textContent = hostname;
      } catch (e) {
        isWeb = false;
      }
    }

    // 5. Đọc kết quả đã lưu, bỏ kết quả của trang trước trong cùng tab
    let result = null;
    if (tab && isWeb) {
      const key = "tab:" + tab.id;
      result = (await chrome.storage.session.get(key))[key] || null;
      if (result && result.pageUrl && result.pageUrl !== tab.url) result = null;
    }

    // 6. Hiển thị
    if (!result) {
      showBadge("NONE");
    } else if (result.checking) {
      showBadge("CHECKING");
    } else if (result.error) {
      showBadge("NONE");
      $("error").textContent = "Lỗi: " + result.error;
      $("error").hidden = false;
    } else {
      showBadge(result.verdict);
      $("score").textContent = "Điểm rủi ro " + (Math.round(Number(result.riskScore)) || 0) + "/100";
      if (result.whitelisted) $("whitelisted").hidden = false;
      if (result.degraded) $("degraded").hidden = false;
      if (Array.isArray(result.reasons)) {
        for (const r of result.reasons) {
          const li = document.createElement("li");
          li.textContent = r && r.text ? r.text : "";
          $("reasons").appendChild(li);
        }
      }
    }

    // 7. Nút kiểm tra lại
    $("recheck").addEventListener("click", () => {
      if (!tab) {
        window.close();
        return;
      }
      chrome.runtime
        .sendMessage({ type: "recheck", tabId: tab.id })
        .catch(() => {})
        .finally(() => window.close());
    });

    // 8. Nút báo nhầm
    const report = $("report");
    if (!tab || !isWeb) report.disabled = true;
    report.addEventListener("click", async () => {
      try {
        const { reports } = await chrome.storage.local.get("reports");
        const list = Array.isArray(reports) ? reports : [];
        list.push({
          url: tab.url,
          verdict: result && result.verdict ? result.verdict : null,
          riskScore: result && typeof result.riskScore === "number" ? result.riskScore : null,
          at: new Date().toISOString(),
        });
        await chrome.storage.local.set({ reports: list });
        report.textContent = "Đã ghi nhận";
        report.disabled = true;
      } catch (e) {
        report.textContent = "Lỗi, thử lại";
      }
    });
  }

  init().catch((e) => {
    $("error").textContent = "Lỗi: " + ((e && e.message) || e);
    $("error").hidden = false;
  });
})();
