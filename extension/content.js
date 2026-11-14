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
    if (close) close.addEventListener("click", clearOverlay);
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

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === "getSignals") sendResponse(getSignals());
    else if (msg.type === "verdict") render(msg.result);
    else if (msg.type === "clear") clearOverlay();
  });
})();
