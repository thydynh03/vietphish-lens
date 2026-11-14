// Popup của extension: nói cho người dùng phổ thông biết trang đang mở có an toàn không và nên làm gì.
// Mọi chữ hiển thị đều gán bằng textContent. Kết quả đọc từ chrome.storage.session (khóa "tab:" + tabId) do background.js ghi.
(function () {
  const $ = (id) => document.getElementById(id);
  const MAX_REASONS = 4;
  const RING = 2 * Math.PI * 52; // chu vi vòng tròn trong popup.html (r = 52)

  // Lời lẽ cho từng trạng thái. Tránh thuật ngữ, nói thẳng việc cần làm.
  const VIEWS = {
    SAFE: {
      sym: "✓", lvl: "Rủi ro thấp", ring: 1,
      title: "Trang này an toàn",
      advice: "Chưa thấy dấu hiệu lừa đảo. Bạn vẫn nhớ: ngân hàng và cơ quan nhà nước không bao giờ hỏi mã OTP trên trang web.",
    },
    SUSPICIOUS: {
      sym: "!", lvl: "Rủi ro vừa", ring: 1,
      title: "Hãy cẩn thận với trang này",
      advice: "Trang có dấu hiệu đáng ngờ. Hãy xem kỹ địa chỉ trên thanh trình duyệt trước khi làm gì tiếp.",
      todo: ["Không nhập mật khẩu, mã OTP, số thẻ khi chưa chắc đây là trang thật"],
    },
    DANGER: {
      sym: "✕", lvl: "Rủi ro cao", ring: 1,
      title: "Trang lừa đảo, đừng nhập gì cả!",
      advice: "Kẻ gian dựng trang này để lấy tiền và tài khoản của bạn.",
      todo: ["Không nhập mật khẩu, mã OTP, số thẻ", "Không chuyển tiền theo hướng dẫn trên trang"],
    },
    CHECKING: {
      sym: "•••", lvl: "", ring: 0.25,
      title: "Đang kiểm tra trang…",
      advice: "Chờ vài giây. Trong lúc này đừng nhập mật khẩu hay mã OTP.",
    },
    NONE: {
      sym: "?", lvl: "", ring: 0,
      title: "Chưa có kết quả cho trang này",
      advice: "Bấm \"Kiểm tra lại\" để kiểm tra ngay.",
    },
    ERROR: {
      sym: "?", lvl: "", ring: 0,
      title: "Chưa kiểm tra được trang này",
      advice: "Có thể mạng đang chập chờn hoặc máy chủ kiểm tra đang bận. Bấm \"Kiểm tra lại\" sau ít phút. Trong lúc chờ, đừng nhập mật khẩu hay mã OTP nếu bạn không chắc đây là trang thật.",
    },
    NONWEB: {
      sym: "–", lvl: "", ring: 0,
      title: "Trang này không cần kiểm tra",
      advice: "VietPhish Lens chỉ kiểm tra các trang web có địa chỉ bắt đầu bằng http hoặc https.",
    },
  };

  let tab = null;
  let isWeb = false;
  let result = null;
  let open = false;

  function safeHttpsUrl(raw) {
    try {
      const u = new URL(raw);
      return u.protocol === "https:" ? u.href : null;
    } catch {
      return null;
    }
  }

  function kindOf(r) {
    if (!isWeb) return "NONWEB";
    if (!r) return "NONE";
    if (r.checking) return "CHECKING";
    if (r.error && !r.verdict) return "ERROR";
    if (VIEWS[r.verdict]) return r.verdict;
    return "NONE";
  }

  function render() {
    const kind = kindOf(result);
    const view = VIEWS[kind];
    const r = result || {};
    const brand = r.brand && r.brand.name ? r.brand : null;
    const hasVerdict = kind === "SAFE" || kind === "SUSPICIOUS" || kind === "DANGER";

    document.body.className = kind;

    // Vòng tròn
    const fill = $("ringFill");
    fill.style.strokeDasharray = String(RING);
    fill.style.strokeDashoffset = String(RING * (1 - view.ring));
    $("sym").textContent = view.sym;
    $("lvl").textContent = r.whitelisted ? "Trang chính thức" : view.lvl;

    $("title").textContent = view.title;
    let advice = view.advice;
    if (kind === "DANGER" && brand) advice = "Trang này đang giả mạo " + brand.name + ". " + advice;
    if (kind === "SAFE" && r.whitelisted) advice = "Đây là trang chính thức đã được xác minh. Bạn có thể dùng bình thường.";
    $("advice").textContent = advice;

    // Việc không được làm
    const todo = $("todo");
    todo.textContent = "";
    for (const text of view.todo || []) {
      const li = document.createElement("li");
      li.textContent = text;
      todo.appendChild(li);
    }
    todo.hidden = !(view.todo && view.todo.length);

    // Ghi chú phụ, nói bằng lời thường
    let note = "";
    if (hasVerdict && r.offline) {
      note = "Không kết nối được máy chủ kiểm tra, đây mới là kiểm tra cơ bản dựa trên địa chỉ trang.";
    } else if (hasVerdict && r.degraded && kind !== "SAFE") {
      note = "Một phần kiểm tra chưa chạy được nên kết quả có thể chưa đầy đủ.";
    }
    $("note").textContent = note;
    $("note").hidden = !note;

    // Nút hành động chính
    $("closeTab").hidden = kind !== "DANGER" || !tab;
    const official = $("official");
    const officialUrl = brand ? safeHttpsUrl(brand.officialUrl) : null;
    if ((kind === "DANGER" || kind === "SUSPICIOUS") && officialUrl) {
      official.textContent = "Mở trang thật của " + brand.name;
      official.dataset.url = officialUrl;
      official.hidden = false;
    } else {
      official.hidden = true;
    }

    // Lý do, gói trong "Xem chi tiết"
    const list = $("reasons");
    list.textContent = "";
    const reasons = hasVerdict && Array.isArray(r.reasons) ? r.reasons.filter((x) => x && x.text).slice(0, MAX_REASONS) : [];
    for (const x of reasons) {
      const li = document.createElement("li");
      li.textContent = x.text;
      list.appendChild(li);
    }
    const toggle = $("toggle");
    toggle.hidden = reasons.length === 0;
    toggle.className = "btn " + (official.hidden ? "primary" : "ghost");
    toggle.textContent = open ? "Ẩn chi tiết −" : "Xem chi tiết +";
    toggle.setAttribute("aria-expanded", String(open));
    $("details").hidden = !open || reasons.length === 0;

    // Nút phụ
    $("recheck").disabled = !tab || !isWeb || kind === "CHECKING";
    $("report").disabled = !tab || !isWeb || !hasVerdict || $("report").dataset.done === "1";

    // Thông tin kỹ thuật
    const score = Math.max(0, Math.min(100, Math.round(Number(r.riskScore)) || 0));
    const tech = [];
    if (self.VP_CONFIG && self.VP_CONFIG.API_BASE) tech.push("Máy chủ: " + self.VP_CONFIG.API_BASE);
    if (hasVerdict) tech.push("Kết luận: " + r.verdict + ", điểm " + score + "/100");
    if (r.error) tech.push("Lỗi: " + r.error);
    $("tech").textContent = tech.join(" · ");
  }

  async function loadResult() {
    if (!tab || !isWeb) return null;
    const key = "tab:" + tab.id;
    const saved = (await chrome.storage.session.get(key))[key] || null;
    // Bỏ kết quả của trang trước trong cùng tab
    if (saved && saved.pageUrl && saved.pageUrl !== tab.url) return null;
    return saved;
  }

  async function init() {
    // Ô tích demo offline (giấu trong phần kỹ thuật)
    const demo = $("demo");
    try {
      const { DEMO_OFFLINE } = await chrome.storage.local.get("DEMO_OFFLINE");
      demo.checked = Boolean(DEMO_OFFLINE);
    } catch {
      // Giữ ô tích chưa tích
    }
    demo.addEventListener("change", () => {
      chrome.storage.local.set({ DEMO_OFFLINE: demo.checked }).catch(() => {});
    });

    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      try {
        const u = new URL(tab.url);
        isWeb = u.protocol === "http:" || u.protocol === "https:";
        $("host").textContent = isWeb ? u.hostname : "";
      } catch {
        isWeb = false;
      }
    }

    result = await loadResult();
    render();

    // Popup tự cập nhật khi background.js ghi kết quả mới, không cần mở lại
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "session" || !tab) return;
      const change = changes["tab:" + tab.id];
      if (!change) return;
      const v = change.newValue || null;
      result = v && v.pageUrl && v.pageUrl !== tab.url ? null : v;
      render();
    });

    $("toggle").addEventListener("click", () => {
      open = !open;
      render();
    });

    $("recheck").addEventListener("click", () => {
      if (!tab) return;
      result = { checking: true, pageUrl: tab.url };
      render();
      chrome.runtime.sendMessage({ type: "recheck", tabId: tab.id }).catch(() => {
        result = { error: "Không gửi được yêu cầu kiểm tra", pageUrl: tab.url };
        render();
      });
    });

    $("closeTab").addEventListener("click", () => {
      if (tab) chrome.tabs.remove(tab.id).catch(() => {}).finally(() => window.close());
    });

    $("official").addEventListener("click", () => {
      const url = $("official").dataset.url;
      if (url) chrome.tabs.create({ url }).catch(() => {}).finally(() => window.close());
    });

    const report = $("report");
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
        report.textContent = "Cảm ơn, đã ghi nhận";
        report.dataset.done = "1";
        report.disabled = true;
      } catch {
        report.textContent = "Chưa ghi được, thử lại";
      }
    });
  }

  init().catch((e) => {
    result = { error: (e && e.message) || String(e) };
    isWeb = true;
    render();
  });
})();
