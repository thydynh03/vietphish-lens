# Build-day task split, 14 Nov 2026

This file is the **single source** for who does what, when, and what to paste into the agent. When all three people finish their part, the whole project is done: every file in the "Chưa có, viết trong ngày thi" (not yet written) table of `docs/PREBUILT.md` has exactly one owner (section 6).

Step details live in `.agent/workflows/`. The original hourly schedule is in `docs/NGAY-THI.md`. This file adds two steps, **A4** and **A5** (our differentiators against ChongLuaDao and J2TEAM, see `docs/KHAC-BIET.md`), and reorders the schedule to fit them.

## 1. How to use it, in one minute

1. Open **a new agent session for every step**. Never do two steps in one session.
2. Open PowerShell at the repo root and paste the step's command. All commands follow the same template, only the step file changes. The ready-to-paste version of every step is in `docs/tasks/`:

```powershell
agy --model gemini-4-argon-medium --mode accept-edits -i "Read AGENTS.md and .agent/skills/vietphish/SKILL.md, then follow .agent/workflows/<STEP>.md exactly. Read the whole step file before writing the first line of code. Only create or modify the files listed in its 'File được sửa' section. Run the check commands an agent can run and paste their real output. When the checks pass, follow Who commits in AGENTS.md: English commit message with the step tag, push a branch, open a PR and merge it. If the acceptance needs a human in Chrome, push and open the PR, then stop and ask before merging. Stop when the step is done."
```

   In the Antigravity IDE: open the repo folder, start a new agent conversation and paste the quoted part.

3. The agent runs the checks, then commits with an English message and the step tag, pushes a branch, opens a PR and merges it ("Who commits" in `AGENTS.md`). Steps whose acceptance needs Chrome stop before the merge: **a human** checks, then tells the agent to merge. If it goes wrong, see "Khi agent làm sai" (when the agent gets it wrong) in `docs/NGAY-THI.md`.
4. Steps marked "human" are never given to an agent. Follow the checklist in your task file.

The repo path may differ on each laptop. Everyone `cd`s to their own path.

## 2. Who owns which file, and when

Two people **never** edit the same file in the same time window. That is why `git pull --rebase` always merges cleanly.

| File | Person and step | Time window |
| --- | --- | --- |
| `server/**` | B: B1 to B5 | 07:45–09:25, bug fixes until 10:45 |
| `deploy.env.yaml` (never committed) | B: B6 | 09:25–10:15 |
| `extension/manifest.json` | A: A1, then A3 | Sequential |
| `extension/background.js`, `extension/config.js` | A: A2, then A5, then A3 | Sequential, never two sessions at once |
| `extension/content.js` | A: A1 (07:45–08:30). **C: A4 (09:20–09:55)**. Back to A after 09:55 for UI fixes | No overlap |
| `extension/popup.html`, `popup.js`, `demo-cache.json` | A: A3 | 10:00–10:40 |
| `eval/**`, `scripts/**`, `demo-sites/**` | C: C1, C2 | All day |
| `README.md`, `docs/**` except `docs/process/` | C | All day |
| `docs/process/A-*`, `docs/process/B-*`, `docs/process/C-*` | Each person writes only files with their own prefix | All day |
| `docs/API.md`, `shared/**` | Nobody edits without telling the whole team | |
| Tag `v1.0-demo` | A | 11:20 |

A4 is the one exception to the folder ownership table in `AGENTS.md`: C edits `extension/content.js`, only in step A4, while A does not touch that file.

## 3–5. Each person's work

The hourly schedule, who to wait for, and **the full agent prompt for every step** are in each person's own file:

| Person | File | Steps |
| --- | --- | --- |
| A | [`docs/tasks/A.md`](tasks/A.md) | 00, A1, A2, A5, A3, tag |
| B | [`docs/tasks/B.md`](tasks/B.md) | 00, B1, B2, B4, B3, B5, B6 |
| C | [`docs/tasks/C.md`](tasks/C.md) | 00, C1, C3, C2, A4, eval through the API, README, submission |

Product requirements and the definition of done: [`docs/REQUIREMENTS.md`](REQUIREMENTS.md).

## 6. "Whole project done" check

Every row of the "Chưa có, viết trong ngày thi" table in `docs/PREBUILT.md`, plus the two new steps, has exactly one owner:

| Part | File | Step | Person |
| --- | --- | --- | --- |
| Whitelist, Vietnamese reasons | `server/src/official.js`, `server/src/reasons.js` | B1 | B |
| Domain heuristics | `server/src/heuristics.js` | B2 | B |
| Score fusion, hard rule | `server/src/fusion.js` | B3 | B |
| Gemini, Safe Browsing | `server/src/vision.js`, `server/src/safebrowsing.js` | B4 | B |
| `/analyze` | `server/src/analyze.js`, `server/src/index.js` | B5 | B |
| Tests | `server/test/*.test.js`, `smoke.js`, `try-gemini.js` | B1 to B5 | B |
| Deploy | Cloud Run, `deploy.env.yaml` | B6 | B |
| Page signals, overlay | `extension/content.js` | A1 | A |
| Check flow, screenshot, badge | `extension/background.js`, `extension/config.js` | A2 | A |
| **Form lock, confirm before typing (K1, K2)** | `extension/content.js` | **A4** | **C** |
| **Lock message, basic offline mode, strip query (K1, K3, K4)** | `extension/background.js` | **A5** | **A** |
| Popup, offline demo | `extension/popup.*`, `extension/demo-cache.json` | A3, optional | A |
| Evaluation script | `eval/run_eval.js` | C2 | C |
| Video, README, comparison slide | `README.md`, MP4 file | C3 | C |
| Process evidence | `docs/process/` | Every step | One prefix per person |
| Tag, submission | `v1.0-demo` | | A tags, C submits |

If every row above is committed by 11:20 (A3 may be missing), the project is done.

## 7. What to cut when late

1. A3 (popup). Drop it if it does not pass by 10:40.
2. The second half of A4: the K2 confirmation dialog. Keep the K1 form lock.
3. Evaluation through the API. Keep the local evaluation numbers.

**Never cut:** the DANGER overlay, Vietnamese reasons, A5 (basic mode answers "what if the server is down"), the video.

## 8. Messages to send in the team Zalo group

| Who | Message | Who is waiting |
| --- | --- | --- |
| A | "A1 đã push" (A1 pushed) | C, to start A4 |
| B | "B1 đã push", "B2 đã push" | C, for C2 |
| B | "B5 đã push" | A, to accept A2 |
| B | "URL Cloud Run: …" | A updates `API_BASE`, C runs eval through the API |
| C | "A4 đã push" | A, for step 4 of the A5 acceptance |
| All 3 | "Đã push xong" (all pushed) at 11:20 | A, to tag |
