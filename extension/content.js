(function () {
  if (window.__vietphishLensLoaded) return;
  window.__vietphishLensLoaded = true;

  const ROOT_ID = "vietphish-lens-root";

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getSignals() {
    const inputs = [...document.querySelectorAll("input")];
    const text = (el) =>
      [el.name, el.id, el.placeholder, el.getAttribute("autocomplete")]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
    const hasPasswordField = inputs.some(
      (el) => (el.type || "").toLowerCase() === "password"
    );
    const hasOtpField = inputs.some((el) =>
      /otp|one-time-code|mã xác thực|ma xac thuc/.test(text(el))
    );
    const hasCardField = inputs.some((el) =>
      /card|cc-number|cvv|số thẻ/.test(text(el))
    );
    let formActionHost = null;
    const form = document.querySelector("form[action]");
    if (form) {
      try {
        formActionHost = new URL(form.action, location.href).hostname || null;
      } catch {
        formActionHost = null;
      }
    }
    return { hasPasswordField, hasOtpField, hasCardField, formActionHost };
  }

  let host = null;

  function clearOverlay() {
    if (host) host.remove();
    const leftover = document.getElementById(ROOT_ID);
    if (leftover) leftover.remove();
    host = null;
  }

  const STYLE = `
    :host { all: initial }
    * { box-sizing: border-box }
    .overlay { position: fixed; inset: 0; z-index: 2147483647; background: rgba(150,20,20,.96); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); color: #fff; display: flex; align-items: center; justify-content: center; padding: 24px; font-family: "Segoe UI", Roboto, "Noto Sans", Arial, sans-serif; overflow: auto }
    a.primary:focus-visible, button:focus-visible { outline: 3px solid #ffd54a; outline-offset: 2px }
    .card { max-width: 640px; width: 100% }
    h1 { margin: 0 0 12px; font-size: 30px; line-height: 1.25 }
    .score { margin: 0 0 20px; font-size: 18px; opacity: .92 }
    ul { margin: 0 0 28px; padding-left: 22px; font-size: 19px; line-height: 1.5 }
    li { margin-bottom: 8px }
    .actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center }
    a.primary { display: inline-block; background: #fff; color: #8f1a14; font-weight: 700; font-size: 18px; padding: 14px 22px; border-radius: 8px; text-decoration: none }
    button { font: inherit; cursor: pointer }
    button.secondary { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,.7); font-size: 15px; padding: 12px 18px; border-radius: 8px }
    .banner { position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647; background: #a8670f; color: #fff; display: flex; align-items: center; gap: 12px; padding: 10px 16px; font-size: 15px; line-height: 1.4; font-family: "Segoe UI", Roboto, "Noto Sans", Arial, sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,.35) }
    .banner .msg { flex: 1 }
    .banner button { background: rgba(255,255,255,.18); color: #fff; border: 1px solid rgba(255,255,255,.6); border-radius: 6px; padding: 6px 14px; font-size: 14px }
  `;

  function mount(html) {
    clearOverlay();
    host = document.createElement("div");
    host.id = ROOT_ID;
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = "<style>" + STYLE + "</style>" + html;
    const close = shadow.querySelector("[data-close]");
    if (close)
      close.addEventListener("click", () => {
        clearOverlay();
        onUserDismiss();
      });
    document.documentElement.appendChild(host);
    return shadow;
  }

  function render(result) {
    clearOverlay();
    if (!result || (result.verdict !== "DANGER" && result.verdict !== "SUSPICIOUS")) {
      return;
    }
    const score = Math.round(Number(result.riskScore)) || 0;
    const reasons = Array.isArray(result.reasons) ? result.reasons : [];

    if (result.verdict === "DANGER") {
      const items = reasons
        .slice(0, 4)
        .map((r) => "<li>" + escapeHtml(r && r.text) + "</li>")
        .join("");
      const degraded = result.degraded ? " · chưa có kết quả phân tích hình ảnh" : "";
      const official =
        result.brand && typeof result.brand.officialUrl === "string"
          ? result.brand.officialUrl
          : "";
      const primary = /^https:\/\//i.test(official)
        ? '<a class="primary" rel="noopener noreferrer" href="' +
          escapeHtml(official) +
          '">Về trang chính thức ' +
          escapeHtml(result.brand.name) +
          "</a>"
        : "";
      const shadow = mount(
        '<div class="overlay" role="alertdialog" aria-modal="true"><div class="card">' +
          "<h1>⚠ CẢNH BÁO: CÓ THỂ LÀ TRANG GIẢ MẠO</h1>" +
          '<p class="score">Điểm rủi ro ' +
          score +
          "/100" +
          escapeHtml(degraded) +
          "</p>" +
          "<ul>" +
          items +
          "</ul>" +
          '<div class="actions">' +
          primary +
          '<button class="secondary" data-close>Tôi hiểu rủi ro, vẫn tiếp tục</button></div>' +
          "</div></div>"
      );
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      const focusTarget = shadow.querySelector("a.primary") || shadow.querySelector("[data-close]");
      if (focusTarget) focusTarget.focus({ preventScroll: true });
      return;
    }

    const first = reasons[0] && reasons[0].text ? " " + reasons[0].text : "";
    mount(
      '<div class="banner" role="alert"><span class="msg"><strong>Trang đáng ngờ (' +
        score +
        "/100):</strong>" +
        escapeHtml(first) +
        "</span><button data-close>Đóng</button></div>"
    );
  }

  // ---------- A4: khóa ô nhập (K1) và hỏi lại (K2) ----------
  const LOCK_TIMEOUT_MS = 15000; // dài hơn REQUEST_TIMEOUT_MS 10 giây của config.js cộng thời gian chụp ảnh
  const CHIP_ID = "vietphish-lens-chip";
  const ASK_ID = "vietphish-lens-ask";
  const UI_FONT = 'font-family: "Segoe UI", Roboto, "Noto Sans", Arial, sans-serif;';
  const SUBMIT_LIKE = 'button, input[type="submit"], input[type="button"], input[type="image"], [role="button"]';
  let lockState = "off"; // "off" | "checking" | "danger" | "suspicious"
  let lockTimer = null;
  let hideChipTimer = null;
  let lockBrand = null; // { name, officialUrl } hoặc null
  const confirmed = new WeakSet(); // ô người dùng đã chọn "vẫn nhập"
  let chipHost = null;
  let askHost = null;

  function sensitiveKind(el) {
    if (!el || el.tagName !== "INPUT") return null;
    if ((el.type || "").toLowerCase() === "password") return "password";
    const t = [el.name, el.id, el.placeholder, el.getAttribute("autocomplete")]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (/otp|one-time-code|mã xác thực|ma xac thuc/.test(t)) return "otp";
    if (/card|cc-number|cvv|số thẻ/.test(t)) return "card";
    return null;
  }

  function pageHasSensitive() {
    return [...document.querySelectorAll("input")].some((el) => sensitiveKind(el));
  }

  function ownUi(e) {
    const path = typeof e.composedPath === "function" ? e.composedPath() : [];
    const hosts = [host, chipHost, askHost].filter(Boolean);
    return hosts.some((h) => path.includes(h));
  }

  function hideChip() {
    clearTimeout(hideChipTimer);
    hideChipTimer = null;
    if (chipHost) chipHost.remove();
    const leftover = document.getElementById(CHIP_ID);
    if (leftover) leftover.remove();
    chipHost = null;
  }

  function showChip(text) {
    hideChip();
    chipHost = document.createElement("div");
    chipHost.id = CHIP_ID;
    const shadow = chipHost.attachShadow({ mode: "closed" });
    shadow.innerHTML =
      "<style>" +
      ":host{all:initial}" +
      ".chip{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:2147483647;background:#26323f;color:#fff;padding:10px 16px;border-radius:999px;font-size:14px;line-height:1.4;box-shadow:0 4px 14px rgba(0,0,0,.35);" +
      UI_FONT +
      "}" +
      "</style>" +
      '<div class="chip" role="status">' +
      escapeHtml(text) +
      "</div>";
    document.documentElement.appendChild(chipHost);
  }

  function closeAsk() {
    if (askHost) askHost.remove();
    const leftover = document.getElementById(ASK_ID);
    if (leftover) leftover.remove();
    askHost = null;
  }

  function ask(el, kind) {
    closeAsk();
    const what = { password: "mật khẩu", otp: "mã OTP", card: "số thẻ" }[kind];
    const official =
      lockBrand && typeof lockBrand.officialUrl === "string" && /^https:\/\//i.test(lockBrand.officialUrl)
        ? lockBrand.officialUrl
        : "";
    const leaveLabel = official
      ? "Rời trang, về trang chính thức " + (lockBrand.name || "")
      : "Rời trang này";
    askHost = document.createElement("div");
    askHost.id = ASK_ID;
    const shadow = askHost.attachShadow({ mode: "closed" });
    shadow.innerHTML =
      "<style>" +
      ":host{all:initial}" +
      "*{box-sizing:border-box}" +
      ".back{position:fixed;inset:0;z-index:2147483647;background:rgba(20,24,30,.55);display:flex;align-items:center;justify-content:center;padding:16px;" +
      UI_FONT +
      "}" +
      ".card{background:#fff;color:#1d2733;max-width:460px;width:100%;border-radius:12px;padding:22px;border-top:6px solid #a8670f;box-shadow:0 12px 32px rgba(0,0,0,.28)}" +
      "h2{margin:0 0 10px;font-size:20px;line-height:1.3}" +
      "p{margin:0 0 18px;font-size:15px;line-height:1.5}" +
      ".row{display:flex;flex-wrap:wrap;gap:10px}" +
      "button{font:inherit;cursor:pointer;padding:10px 14px;border-radius:8px;font-size:14px}" +
      ".leave{background:#a8670f;color:#fff;font-weight:700;border:0}" +
      ".stay{background:transparent;color:#1d2733;border:1px solid #9aa5b1}" +
      "button:focus-visible{outline:3px solid #1d63c8;outline-offset:2px}" +
      "</style>" +
      '<div class="back"><div class="card" role="alertdialog" aria-modal="true" aria-labelledby="t">' +
      '<h2 id="t">Trang này đáng ngờ. Bạn chắc muốn nhập ' +
      escapeHtml(what) +
      "?</h2>" +
      "<p>VietPhish thấy dấu hiệu giả mạo trên trang này. Ngân hàng và cơ quan nhà nước không bao giờ yêu cầu " +
      escapeHtml(what) +
      " qua một trang lạ.</p>" +
      '<div class="row"><button class="leave" data-leave>' +
      escapeHtml(leaveLabel) +
      '</button><button class="stay" data-stay>Tôi hiểu rủi ro, vẫn nhập</button></div>' +
      "</div></div>";
    const leaveBtn = shadow.querySelector("[data-leave]");
    const stayBtn = shadow.querySelector("[data-stay]");
    if (leaveBtn) {
      leaveBtn.addEventListener("click", () => {
        closeAsk();
        if (official) {
          location.href = official;
        } else if (history.length > 1) {
          history.back();
        } else {
          location.replace("about:blank");
        }
      });
    }
    if (stayBtn) {
      stayBtn.addEventListener("click", () => {
        closeAsk();
        confirmed.add(el);
        try {
          el.focus({ preventScroll: true });
        } catch {}
      });
    }
    document.documentElement.appendChild(askHost);
    if (leaveBtn) leaveBtn.focus({ preventScroll: true });
  }

  function setLock(state, brand) {
    lockState = state;
    if (brand !== undefined) lockBrand = brand;
    clearTimeout(lockTimer);
    lockTimer = null;
    if (state === "checking") {
      showChip("VietPhish đang kiểm tra trang này. Tạm khóa gửi biểu mẫu.");
      lockTimer = setTimeout(() => {
        if (lockState !== "checking") return;
        lockState = "off";
        showChip("Chưa kiểm tra xong. Hãy tự kiểm tra địa chỉ trang trước khi nhập mật khẩu hoặc OTP.");
        hideChipTimer = setTimeout(hideChip, 6000);
      }, LOCK_TIMEOUT_MS);
    } else {
      hideChip();
    }
    if (state !== "suspicious") closeAsk();
  }

  function lockFromVerdict(result) {
    const brand =
      result && result.brand && typeof result.brand.officialUrl === "string"
        ? result.brand
        : null;
    if (!result || result.verdict === "SAFE") {
      setLock("off", null);
    } else if (result.verdict === "DANGER") {
      setLock("danger", brand);
    } else {
      setLock("suspicious", brand);
    }
  }

  function onUserDismiss() {
    if (lockState === "danger") lockState = "suspicious";
  }

  function blocking() {
    return lockState === "checking" || lockState === "danger";
  }

  function stop(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (lockState === "checking") {
      showChip("Đợi VietPhish kiểm tra xong trang này rồi hãy gửi.");
    }
  }

  window.addEventListener(
    "submit",
    (e) => {
      if (blocking() && !ownUi(e)) stop(e);
    },
    true
  );

  window.addEventListener(
    "keydown",
    (e) => {
      if (blocking() && !ownUi(e) && e.key === "Enter" && e.target && e.target.tagName === "INPUT") {
        stop(e);
      }
    },
    true
  );

  window.addEventListener(
    "click",
    (e) => {
      const targetEl =
        e.target && typeof e.target.closest === "function"
          ? e.target
          : e.target && e.target.parentElement;
      if (
        blocking() &&
        !ownUi(e) &&
        targetEl &&
        typeof targetEl.closest === "function" &&
        targetEl.closest(SUBMIT_LIKE) &&
        pageHasSensitive()
      ) {
        stop(e);
      }
    },
    true
  );

  window.addEventListener(
    "focusin",
    (e) => {
      if (lockState !== "suspicious" || ownUi(e)) return;
      const kind = sensitiveKind(e.target);
      if (!kind || confirmed.has(e.target)) return;
      if (typeof e.target.blur === "function") e.target.blur();
      ask(e.target, kind);
    },
    true
  );

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === "getSignals") sendResponse(getSignals());
    else if (msg.type === "verdict") {
      render(msg.result);
      lockFromVerdict(msg.result);
    } else if (msg.type === "clear") {
      clearOverlay();
      setLock("off", null);
    } else if (msg.type === "lock") {
      if (lockState === "off") setLock("checking");
    } else if (msg.type === "unlock") {
      if (lockState === "checking") setLock("off");
    }
  });
})();
