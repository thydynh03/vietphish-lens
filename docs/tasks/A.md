# Person A: extension

**Owns:** `extension/` (except `extension/content.js` between 09:20 and 09:55, when C does A4). Tags `v1.0-demo` at 11:20.

**Read before you start:** `docs/REQUIREMENTS.md`, `AGENTS.md`, `.agent/skills/vietphish/SKILL.md`.

**Your steps, in order:** 00 → A1 → A2 → **A5** → A3 (optional). Shared schedule: `docs/TASKS.md`.

## How to hand a step to the agent

Open **a new agent session** for each step, PowerShell at the repo root, paste that step's command block exactly. When the agent reports done, **you** run the step's "Nghiệm thu" (acceptance) section. If it passes, commit with the command block at the end of the step file. The agent never commits.

## Schedule

| Time | Step | Wait for | Done when |
| --- | --- | --- | --- |
| 07:30–07:45 | 00 (human) | | `git pull`, Load unpacked `extension/`, the service worker console prints "hello". Screenshot saved as `docs/process/A-0730.png` |
| 07:45–08:30 | A1 | | The red overlay appears on the fake VCB page when a fake result is sent with `vpSend`. Commit, push, **tell C "A1 đã push"** |
| 08:30–09:25 | A2 | | Agent done, you run the "Tự kiểm trước khi báo xong" (self-check) section |
| 09:25–09:35 | A2 acceptance | B says "B5 đã push" | `git pull`, `$env:VISION_MOCK="1"; node server/src/index.js`, run the A2 acceptance table. Commit, push |
| 09:35–10:00 | **A5** | A2 committed | The A5 acceptance table passes. Step 4 needs A4: if C has not pushed it yet, do the other steps first, then `git pull` and do step 4. Commit, push |
| Around 09:50 | Switch `API_BASE` | B sends the Cloud Run URL | Edit `API_BASE` in `extension/config.js`, reload the extension, rerun the 3 scenarios. Commit `chore(extension): point API_BASE to Cloud Run` |
| 10:00–10:40 | A3 (optional) | A5 committed | Not passing at 10:40: `git checkout -- extension/`, drop it, never commit half of it |
| 10:40–10:45 | Full check | | The 4 scenarios in section 3 of `docs/REQUIREMENTS.md` are correct against Cloud Run |
| 10:45–11:20 | C3 (human) | | Drive the machine following C's recording script |
| 11:20 | Tag | All 3 say they pushed | Follow "Tag cuối buổi" (end-of-day tag) in `docs/NGAY-THI.md` |

## Prompts

### A1

```powershell
agy --model gemini-4-argon-medium --mode accept-edits -i "Read AGENTS.md and .agent/skills/vietphish/SKILL.md, then follow .agent/workflows/a1-content-overlay.md exactly. Read the whole step file before writing the first line of code. Only create or modify the files listed in its 'File được sửa' section. Run the check commands an agent can run and paste their real output. Do not run git add, git commit or git push. Stop when the step is done."
```

### A2

```powershell
agy --model gemini-4-argon-medium --mode accept-edits -i "Read AGENTS.md and .agent/skills/vietphish/SKILL.md, then follow .agent/workflows/a2-background.md exactly. Read the whole step file before writing the first line of code. Only create or modify the files listed in its 'File được sửa' section. Run the check commands an agent can run and paste their real output. Do not run git add, git commit or git push. Stop when the step is done."
```

### A5

```powershell
agy --model gemini-4-argon-medium --mode accept-edits -i "Read AGENTS.md and .agent/skills/vietphish/SKILL.md, then follow .agent/workflows/a5-che-do-co-ban.md exactly. Change only the 4 places in extension/background.js listed in the step file. Declare let sensitive BEFORE the try block. Run node --check extension/background.js and paste the output. Do not run git add, git commit or git push. Stop when the step is done."
```

### A3 (optional)

```powershell
agy --model gemini-4-argon-medium --mode accept-edits -i "Read AGENTS.md and .agent/skills/vietphish/SKILL.md, then follow .agent/workflows/a3-popup-offline.md exactly. A5 already changed background.js before this step: insert only the 4 places of A3 and do not change any line A5 wrote. Run the check commands an agent can run and paste their real output. Do not run git add, git commit or git push. Stop when the step is done."
```

## Who to notify

| When | Message | Recipient |
| --- | --- | --- |
| A1 pushed | "A1 đã push" | C, to start A4 |
| Tag pushed | "Đã gắn v1.0-demo" | C, to submit |

## When late

Cut A3 first. Never cut A5: basic mode is the answer to "what if the server is down".
