# VietPhish Lens requirements

Read this before writing code. It answers three questions: what the product must do, what "done" means, and what we do **not** build.

Reading order for a fresh clone: `README.md` → this file → `docs/TASKS.md` → your own file in `docs/tasks/` → `AGENTS.md`.

## 1. Problem

Vietnamese users get lured onto fake bank, e-wallet, VNeID and public-service pages, then type their password or OTP. Blocklists are always one step behind, because a fake page lives only a few hours. ChongLuaDao and J2TEAM Security both rely on lists, so a page created minutes ago is not caught (see `docs/KHAC-BIET.md`).

**Core rule:** a page that **looks like** brand X, whose **domain does not belong to** X, and that **asks for** a password, OTP or card number, is almost certainly phishing. No one has to report it first.

Scope: the 16 brands in `shared/official_domains.json`.

## 2. Functional requirements

| ID | Requirement | Step |
| --- | --- | --- |
| R1 | Whitelisted page: green badge, no screenshot, no Gemini call | B1, A2 |
| R2 | Unknown page: send URL, title and page signals (password, OTP, card fields, where the form posts) to `/analyze`. Take a screenshot only when the page has a sensitive field or a brand name in its domain | A1, A2 |
| R3 | The server scores with 4 layers: whitelist, Safe Browsing, domain heuristics, Gemini on the screenshot. Merged score 0–100: 70 and above is DANGER, 40 and above is SUSPICIOUS | B2–B5 |
| R4 | Hard rule: looks like a brand, wrong domain, asks for a secret gives a score of at least 85 | B3 |
| R5 | DANGER: full red overlay, at most 4 reasons in Vietnamese, a "Về trang chính thức" (back to official site) button. SUSPICIOUS: yellow banner along the top edge | A1 |
| R6 | Concrete reasons, for example "Trang này trông giống Vietcombank nhưng địa chỉ … không phải tên miền chính thức (vietcombank.com.vn)" | B1, B3 |
| R7 | **K1.** Unknown page with a sensitive field: block form submission while waiting for the verdict, auto-unlock after 15 seconds | A4, A5 |
| R8 | **K2.** SUSPICIOUS page: ask again before the user types into a password, OTP or card field | A4 |
| R9 | **K3.** Server down: basic mode still warns about pages with a brand name in their domain | A5 |
| R10 | **K4.** Send only `origin + pathname`, never the query or hash | A5 |
| R11 | Popup shows the tab's verdict and a "Kiểm tra lại" (recheck) button. Offline demo mode. Optional, cut first | A3 |
| R12 | Measurable: evaluation of 3 configurations (blocklist only, heuristics, heuristics + Gemini) on `eval/domains.csv` | C2 |

## 3. Four required demo scenarios

| # | Page | Expected |
| --- | --- | --- |
| 1 | `https://www.vietcombank.com.vn` | Green badge, no overlay |
| 2 | `http://vietcombank-xacthuc.top:8080/` | "Checking" chip, the login button does not submit, then a red overlay with Vietnamese reasons and the back-to-official-site button |
| 3 | `http://vneid-capnhat.cc:8080/` | Red overlay with OTP and VNeID reasons |
| 4 | `http://tintuc-demo.vn:8080/` | No warning (a news article that mentions Vietcombank is not a false positive) |

Extra scene for the video: stop the server, then reopen scenario 2. The yellow "basic mode" banner must appear, and clicking the password field must open the confirmation dialog.

## 4. Non-functional requirements

- **Security:** every string from the server goes through `escapeHtml` before `innerHTML`. Closed Shadow DOM. The back-to-official-site button only accepts `https://`.
- **Privacy:** whitelisted pages are never captured. No query or hash is sent. Server logs keep the hostname only.
- **No wrong lock:** a real bank page is never locked. Every lock releases on its own.
- **Secrets:** API keys live only in the server's environment variables. No key in the extension or in any commit.
- **Latency:** mock server under 1 second. Real Gemini takes a few seconds, with a 10-second timeout.

## 5. Definition of done

- [ ] `cd server && npm test` passes in full (`# pass 96`, `# fail 0` after B5)
- [ ] `node server/test/smoke.js <URL>` prints 6/6 `ĐẠT` against the Cloud Run server
- [ ] The 4 scenarios in section 3 are correct in the demo Chrome with `API_BASE` set to the Cloud Run URL
- [ ] The A4 and A5 acceptance tables pass
- [ ] `node eval/run_eval.js` prints `TP 11, FP 0, TN 15, FN 2`, with numbers for all 3 configurations
- [ ] `README.md` has real numbers and the video link
- [ ] MP4 video under 2:00, with sound, with the K1 and K3 scenes
- [ ] Tag `v1.0-demo` on GitHub, repo made public, repo link and video link submitted

## 6. Out of scope

- No brands beyond the 16 (Facebook, Shopee come after the competition).
- No new dependencies, no TypeScript, no bundler, no framework.
- Demo pages never go online.
- Do not copy code from `VietPhish_Demo` into the code folders. All logic is written during the build window following `.agent/workflows/`.
- Do not edit `docs/API.md` or `shared/` without telling the whole team.

## 7. Competition constraints

- The project brought to the event may be at most 30% complete. The boundary is the `pre-event` tag. Every commit after the tag is build-window work (`docs/PREBUILT.md`).
- 4-hour build, feature freeze at CP2 10:15, video recording at 10:45, submission 11:20–12:00 (`docs/NGAY-THI.md`).
- The repo stays private until submission. Make it public before submitting the link.
