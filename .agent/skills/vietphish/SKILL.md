---
name: vietphish
description: Project knowledge for VietPhish Lens, a Chrome extension plus Node server that warns Vietnamese users about pages impersonating banks, e-wallets and government services. Use before any coding, review or debugging task in this repo, including any step in .agent/workflows/.
---

# VietPhish Lens

## What the product does

A Chrome MV3 extension checks every page the user opens. A Node server scores the page and returns `SAFE`, `SUSPICIOUS` or `DANGER` with reasons in Vietnamese. The extension shows a green badge, a yellow banner, or a full red overlay with a button back to the official site.

The core rule, which every part of the code must respect:

> A page is DANGER only when it **looks like brand X**, its **domain does not belong to X**, and it **asks for a secret** (password, OTP, card number).

Consequences:

- A page that is not on any blocklist yet can still be caught. Brand look-alike plus wrong domain plus a secret request is enough.
- The AI layer never decides alone. A news article that mentions Vietcombank but has no input field stays SAFE (score 19).
- Every warning lists concrete Vietnamese reasons built from those three questions.

Scope: 16 Vietnamese brands in `shared/official_domains.json` (banks, MoMo, ZaloPay, VNeID, dichvucong, tax, social insurance).

## Architecture

```text
extension/content.js     read page signals (password/OTP/card fields, form action), draw overlay/banner, lock form (A4)
extension/background.js  whitelist check, screenshot, call server, badge, offline basic mode (A5)
extension/popup.*        verdict of the current tab, recheck, demo-offline toggle (A3)
        |
        | POST /analyze  (contract: docs/API.md)
        v
server/src/index.js      HTTP, rate limit, cache
server/src/analyze.js    orchestrates the layers
  official.js   whitelist (eTLD+1 via tldts)
  safebrowsing.js  Google Safe Browsing
  heuristics.js    domain heuristics: punycode, look-alike, brand keyword, risky TLD, deceptive subdomain (max 60)
  vision.js        Gemini reads the screenshot: which brand, which secrets it asks for
  fusion.js        score 0-100 and verdict: >= 70 DANGER, >= 40 SUSPICIOUS, hard rule forces >= 85
  reasons.js       Vietnamese reason templates
```

Layers run in this order: whitelist → Safe Browsing → heuristics → vision → fusion. A whitelisted domain returns SAFE immediately and never sends a screenshot.

## Where things are

| Need | File |
| --- | --- |
| Requirements and acceptance | `docs/REQUIREMENTS.md` |
| Who does which step, schedule | `docs/TASKS.md`, `docs/tasks/A.md`, `B.md`, `C.md` |
| Step-by-step specs for agents | `.agent/workflows/*.md` |
| API contract | `docs/API.md` |
| Test vectors (do not edit) | `server/test/vectors/*.json` |
| Why we differ from ChongLuaDao and J2TEAM | `docs/KHAC-BIET.md` |
| What existed before the build window | `docs/PREBUILT.md` |
| Demo pages (local only, never online) | `demo-sites/`, served by `node demo-sites/serve.js` on port 8080 |

## How to run

```powershell
cd server; npm install; npm test                       # unit tests
$env:VISION_MOCK="1"; node server/src/index.js         # server without Gemini, port 8787
node demo-sites/serve.js                               # demo pages
powershell -File scripts/chrome-demo.ps1               # Chrome with demo domains mapped to 127.0.0.1
```

Load the extension with `chrome://extensions` → Developer mode → Load unpacked → `extension/`. After every change to the extension: reload it there, then F5 the demo tab.

## Rules that matter most

- Follow `AGENTS.md`: one workflow step per session, only the files listed in that step, no new dependencies, agents commit, push, open and merge their own PR only after the checks pass, English commit messages with the step tag, no AI attribution in commits or PRs.
- User-facing text is Vietnamese with diacritics, copied exactly from the step file. Code identifiers are English.
- Every value from the server that goes into `innerHTML` passes through `escapeHtml`. Shadow roots are `mode: "closed"`. Only `https://` URLs become the "back to official site" button.
- Never put an API key in the extension or in any committed file.

## Known traps (each one has happened in this project)

| Trap | Effect | Fix |
| --- | --- | --- |
| `chrome.tabs.sendMessage` targets a tab, not a page | Signals or screenshot of the next page get sent for the old URL | Re-check `stillHere()` after every `await` in `check()` (A2) |
| `captureVisibleTab` captures the visible tab of the window | Screenshot of a different page is sent to the server | Only capture when the tab is active and its URL still matches |
| `return true` in an `onMessage` listener that answers synchronously | The other side waits for a reply that never comes | Answer synchronously, no `return true` |
| Declaring `let sensitive` inside `try` and reading it in `catch` | ReferenceError swallowed by an inner `catch`, offline basic mode never runs | Declare before `try` (A5) |
| Saving the offline result together with `error` | Popup checks `error` before `verdict` and shows "Chưa kiểm tra" next to a yellow banner | Save `error` only when there is no verdict (A5) |
| Form lock armed by the content script itself | Real bank login pages get locked, because the whitelist only lives in the service worker | Only lock on the `lock` message from the service worker, auto-unlock after 15 s (A4) |
| Lock timeout shorter than `REQUEST_TIMEOUT_MS` (10 s) | Lock releases before offline mode can decide | Keep `LOCK_TIMEOUT_MS = 15000` |
| Editing `server/test/vectors/` to make a test pass | Hides a real bug, breaks the shared contract | Fix the code; ask a human if a vector looks wrong |
| `git add .` | Commits another owner's files or `.env` | Stage files by name |

## Demo environment

Demo domains (`vietcombank-xacthuc.top`, `vneid-capnhat.cc`, `xacthuc-taikhoan.com`, `tintuc-demo.vn`) resolve to `127.0.0.1` only inside the demo Chrome profile. The pages carry a "TRANG DEMO" watermark and their forms send nothing. Never deploy them.

If port 8080 is taken on a laptop, start the demo server with `$env:PORT="8090"` and open the pages on that port.
