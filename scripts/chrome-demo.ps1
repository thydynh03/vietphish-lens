#Requires -Version 7
# Mở một Chrome riêng cho demo, trỏ 4 tên miền demo về 127.0.0.1.
# Đây là công cụ dựng môi trường demo, không phải logic sản phẩm.
# Chạy bằng pwsh 7:  pwsh -File scripts\chrome-demo.ps1
# Dùng Chrome for Testing:  pwsh -File scripts\chrome-demo.ps1 -ChromePath "<đường dẫn chrome.exe>"
param(
  [string]$ChromePath = ""
)

$domains = @("vietcombank-xacthuc.top", "vneid-capnhat.cc", "xacthuc-taikhoan.com", "tintuc-demo.vn")

if (-not $ChromePath) {
  $ChromePath = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe")
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $ChromePath -or -not (Test-Path $ChromePath)) {
  Write-Error "Không tìm thấy chrome.exe. Cài Chrome, hoặc truyền -ChromePath tới chrome.exe của Chrome for Testing."
  exit 1
}

# Profile riêng: Chrome chỉ nhận cờ dòng lệnh khi mở một tiến trình mới với profile khác profile đang chạy.
$profileDir = Join-Path $env:TEMP "vietphish-demo-profile"
$rules = ($domains | ForEach-Object { "MAP $_ 127.0.0.1" }) -join ", "

if (-not (Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue)) {
  Write-Warning "Chưa có gì nghe ở cổng 8080. Mở tab khác và chạy: node demo-sites/serve.js"
}

Start-Process -FilePath $ChromePath -ArgumentList @(
  "--user-data-dir=`"$profileDir`"",
  "--host-resolver-rules=`"$rules`"",
  "chrome://extensions"
)

Write-Host "Đã mở Chrome demo: $ChromePath"
Write-Host "Bật Developer mode, bấm Load unpacked, chọn thư mục extension."
Write-Host "Bốn URL demo:"
foreach ($d in $domains) { Write-Host "  http://${d}:8080/" }
