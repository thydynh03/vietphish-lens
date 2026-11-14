# Person C: data, evaluation, A4, video, submission

**Owns:** `eval/`, `scripts/`, `demo-sites/`, `docs/`, `README.md`. Single exception: `extension/content.js` during step A4, 09:20–09:55.

**Read before you start:** `docs/REQUIREMENTS.md`, `AGENTS.md`, `.agent/skills/vietphish/SKILL.md`, `docs/KHAC-BIET.md` (Vietnamese: video script and comparison slide).

**Your steps, in order:** 00 → C1 → C3 script → C2 → video draft → **A4** → eval through the API → README → C3 recording → submission. Shared schedule: `docs/TASKS.md`.

## How to hand a step to the agent

Only C2 and A4 go to the agent. Open **a new agent session** for each, PowerShell at the repo root, paste the command block exactly. When the agent reports done, **you** run the step's "Nghiệm thu" (acceptance) section. If it passes, commit with the command block at the end of the step file. 00, C1 and C3 are human work.

## Schedule

| Time | Step | Wait for | Done when |
| --- | --- | --- | --- |
| 07:30–07:45 | 00 (human) | | `git pull`, check the `pre-event` tag. **Retest ChongLuaDao and J2TEAM** on the demo pages and note the results for the comparison slide. Screenshot saved as `docs/process/C-0730.png` |
| 07:45–08:10 | C1 (human) | | Following `.agent/workflows/c1-moi-truong-demo.md`: the demo Chrome opens all 4 demo pages, the extension is loaded |
| 08:10–08:30 | C3 script | | Narration following section 5 of `docs/KHAC-BIET.md`, with the K1, K2 and K3 scenes |
| 08:30–08:50 | C2 | B says "B2 đã push" | `node eval/run_eval.js` prints `TP 11, FP 0, TN 15, FN 2`. Commit, push |
| 08:50–09:15 | Draft | | Arrange screen, slides, narration. No server yet: use the A1 overlay with `vpSend` |
| 09:15 | CP1 | | Record video draft 1, export MP4 |
| 09:20–09:55 | **A4** | A says "A1 đã push" | `git pull` first. The A4 acceptance table passes with `vpSend`, no server needed. Commit, push, **tell A "A4 đã push"**. After this, do not touch `extension/` again |
| 09:55–10:15 | Eval through the API | B sends the Cloud Run URL | `node eval/run_eval.js --api <URL>` runs all 3 configurations |
| 10:15–10:45 | README, rehearsal | | `README.md` has real numbers. Read the video script with a timer, under 2:00 |
| 10:45–11:20 | C3 recording | | Following section 5 of `docs/KHAC-BIET.md`. Record the K1 scene against Cloud Run with real Gemini. K3 scene: set a wrong `API_BASE` or go offline, then F5 the fake VCB page |
| 11:20–12:00 | Submission | A has tagged | Make the repo public, then follow "Nộp bài" (submission) in `docs/NGAY-THI.md` |

## Prompts

### C2

```powershell
agy --model gemini-4-argon-medium --mode accept-edits -i "Read AGENTS.md and .agent/skills/vietphish/SKILL.md, then follow .agent/workflows/c2-eval.md exactly. Read the whole step file before writing the first line of code. Only create or modify the files listed in its 'File được sửa' section. Run node eval/run_eval.js and paste the real output. Do not run git add, git commit or git push. Stop when the step is done."
```

### A4

```powershell
agy --model gemini-4-argon-medium --mode accept-edits -i "Read AGENTS.md and .agent/skills/vietphish/SKILL.md, then follow .agent/workflows/a4-khoa-o-nhap.md exactly. This is the exception in the Folder ownership table of AGENTS.md: C may edit extension/content.js, only in this step. Change only the 3 places listed in the step file, do not touch getSignals, render or STYLE. Run node --check extension/content.js and paste the output. Do not run git add, git commit or git push. Stop when the step is done."
```

## Who to notify

| When | Message | Recipient |
| --- | --- | --- |
| A4 pushed | "A4 đã push" | A, for step 4 of the A5 acceptance |
| Submitted | Screenshot of the submission confirmation | Team Zalo group with the mentor |

## When late

Cut the confirmation dialog (K2) in A4, keep the form lock (K1). If eval through the API cannot run, use the local numbers and still state the sample size of 28 URLs. Never move the 10:45 recording time.
