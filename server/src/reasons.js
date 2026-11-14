const TEMPLATES = {
  "WHITELIST": { weight: 0, text: "Tên miền {domain} nằm trong danh sách chính thức." },
  "SAFE_BROWSING_HIT": { weight: 100, text: "Google Safe Browsing đã xác định trang này là lừa đảo." },
  "BRAND_DOMAIN_MISMATCH": { weight: 40, text: "Trang này trông giống {brand} nhưng địa chỉ {domain} không phải tên miền chính thức ({official})." },
  "ASKS_OTP": { weight: 20, text: "Trang yêu cầu nhập mã OTP. Ngân hàng và cơ quan nhà nước không bao giờ hỏi OTP trên trang lạ." },
  "ASKS_PASSWORD": { weight: 20, text: "Trang yêu cầu mật khẩu đăng nhập {brand} trên một tên miền lạ." },
  "ASKS_CARD": { weight: 20, text: "Trang yêu cầu số thẻ hoặc CVV, dấu hiệu đánh cắp thông tin thẻ." },
  "LOOKALIKE_DOMAIN": { weight: 40, text: "Tên miền {domain} gần giống {official} (chỉ khác {n} ký tự)." },
  "HOMOGLYPH": { weight: 40, text: "Tên miền dùng ký tự đánh lừa thị giác: {uni} (thực chất là {puny})." },
  "SUBDOMAIN_TRICK": { weight: 40, text: "Tên miền thật là {registrable}; phần chữ {brand} phía trước chỉ là phần giả." },
  "BRAND_KEYWORD": { weight: 25, text: "Tên miền {domain} chứa tên {brand} nhưng không thuộc {brand}." },
  "SUSPICIOUS_TLD": { weight: 15, text: "Đuôi .{tld} thường bị lợi dụng trong lừa đảo." },
  "NO_HTTPS": { weight: 10, text: "Trang không dùng kết nối bảo mật HTTPS." },
  "FORM_OTHER_HOST": { weight: 10, text: "Dữ liệu bạn nhập sẽ được gửi sang máy chủ khác ({host})." },
  "URGENCY": { weight: 5, text: "Trang dùng lời lẽ hối thúc (khóa tài khoản, cập nhật gấp…)." },
  "VNEID_OFFLINE": { weight: 0, text: "VNeID chỉ xác thực qua ứng dụng chính thức và vneid.gov.vn, không qua website lạ." }
};

export function reason(code, vars = {}) {
  if (!Object.hasOwn(TEMPLATES, code)) {
    throw new Error("Mã lý do không tồn tại: " + code);
  }

  const template = TEMPLATES[code];
  const text = template.text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

  return { code, text, weight: template.weight };
}
