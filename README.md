# VietPhish Lens

A Chrome extension that warns Vietnamese users about pages impersonating banks, e-wallets and government services, including pages created a few hours ago that no blocklist knows yet. Core idea: a page that **looks like** brand X, whose **domain does not belong to** X, and that **asks for** a password, OTP or card number, is almost certainly phishing.

Entry for the GDG DevFest MienTrung 2026 Mini Hackathon, team of 3.

## Start here

Just cloned the repo? Read in this order:

1. [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md): what the product must do, definition of done, what is out of scope.
2. [`docs/TASKS.md`](docs/TASKS.md): who owns which file, who notifies whom, what to cut when late.
3. Your own file: [`docs/tasks/A.md`](docs/tasks/A.md) (extension), [`docs/tasks/B.md`](docs/tasks/B.md) (server, AI), [`docs/tasks/C.md`](docs/tasks/C.md) (data, A4, video, submission). Each step has a ready-to-paste agent prompt.
4. [`AGENTS.md`](AGENTS.md): rules for agents, commit and pull request rules.
5. [`.agent/skills/vietphish/SKILL.md`](.agent/skills/vietphish/SKILL.md): project knowledge for agents: architecture, how to run, known traps.
6. [`docs/KHAC-BIET.md`](docs/KHAC-BIET.md) (Vietnamese): how we differ from ChongLuaDao and J2TEAM Security, video script.
7. [`docs/DATA-SOURCES.md`](docs/DATA-SOURCES.md): community phishing data (vn-badsite-filter, PhishVN, OpenPhish, PhishTank) and how the blocklist layer works. Implemented in the sandbox repo, not in this one.

Step specs in `.agent/workflows/` stay in Vietnamese: they were verified line by line, and the user-facing strings they contain must stay Vietnamese.

## Current state

**Before 07:30 on 14 Nov 2026 this repo is an empty skeleton.** The server only has `GET /health`, the extension only prints "hello". The repo holds data, demo pages, the API contract and step-by-step specs for agents. All detection logic, the warning UI and the evaluation script are written during the build window.

Prebuilt code is 73 lines (server `/health`, service worker stub, demo page server, demo Chrome launcher), about 4.5% of the 1,637 lines of a full implementation. The full list of what existed before the event is in [`docs/PREBUILT.md`](docs/PREBUILT.md). The boundary is the `pre-event` tag:

```powershell
git log pre-event..HEAD --oneline    # commits written during the build window
```

## Four-layer architecture

1. **Whitelist:** official domains of banks and e-wallets, plus every `.gov.vn` domain. A match means SAFE, nothing is sent anywhere.
2. **Google Safe Browsing:** pages already reported are blocked at once.
3. **Domain heuristics:** punycode, look-alike names, deceptive subdomains, risky TLDs, forms posting to another host.
4. **Gemini reads a screenshot:** which brand the page looks like, and whether it asks for sensitive data. Comparing the brand with the domain is done in code, never by the model.

The last three layers run in parallel. The server merges them into a 0–100 score with reasons in Vietnamese. The extension shows a green badge (SAFE), a yellow banner (SUSPICIOUS) or a full red overlay (DANGER). A screenshot is sent only when the page is not whitelisted and has a sensitive input field or a brand name in its domain.

On top of that, steps A4 and A5 add what ChongLuaDao and J2TEAM do not have: the form is locked while the page is being checked, the user is asked again before typing a secret on a suspicious page, and a basic offline mode keeps warning when the server is down. See `docs/KHAC-BIET.md`.

## Google technology

| Technology | Used for |
| --- | --- |
| Gemini API | Recognize the brand from a page screenshot, JSON output with a schema |
| Google Cloud Run | Host the `/analyze` server |
| Safe Browsing API v4 | Blocklist layer |
| Antigravity | Agents write the code during the build window, following `.agent/workflows/` |

## Folder layout

```text
extension/    Chrome MV3, plain JavaScript, no build step; official_domains.json is a copy of the whitelist
server/       Node.js, GET /health and POST /analyze; data/ holds a whitelist copy, test/vectors/ holds expected results
shared/       official_domains.json (16 brands), source of the whitelist
eval/         domains.csv (28 labelled URLs) and the evaluation script
demo-sites/   3 static demo pages with a watermark, and serve.js serving them locally for 4 fake domains on port 8080
scripts/      chrome-demo.ps1 opens a separate Chrome profile for the demo
docs/         REQUIREMENTS.md, TASKS.md, tasks/, DATA-SOURCES.md, API.md, NGAY-THI.md, PREBUILT.md, KE-HOACH.md, KHAC-BIET.md, DEBUG-CHROME.md
.agent/       workflows/: step specs for agents (00, A1 to A5, B1 to B6, C1 to C3); skills/vietphish/: project knowledge
AGENTS.md     shared rules for agents working in this repo
```

## How to run

Needs Node 22 or later and PowerShell 7 (`pwsh`).

```powershell
cd server
npm install
cd ..
node server/src/index.js          # server on port 8787
node demo-sites/serve.js          # demo pages on port 8080, in another tab
pwsh -File scripts\chrome-demo.ps1
```

In the Chrome window that opens: turn on Developer mode, click Load unpacked, pick the `extension` folder. Then open `http://vietcombank-xacthuc.top:8080/`.

The server reads its keys from the environment variables `GEMINI_API_KEY` and `SAFE_BROWSING_KEY`. Keys are never in the repo or in the extension.

The demo pages were built by the team, carry a watermark, send their forms nowhere, and run only on the local machine. The team does not visit or spread real phishing pages.

## Results

Filled in during the build window.

| Configuration | TP | FP | TN | FN | Precision | Recall | False positive rate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [...] | | | | | | | |

Sample size: [...]. Limitations: small sample, the fake pages were named by the team.

## Demo video

Filled in during the build window: [video link].

Cloud Run URL: [filled in during the build window].
