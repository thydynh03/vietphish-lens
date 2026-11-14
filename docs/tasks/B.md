# Person B: server and AI

**Owns:** `server/`, `deploy.env.yaml` (repo root, holds keys, **never committed**). Never edits anything in `extension/`.

**Read before you start:** `docs/REQUIREMENTS.md`, `AGENTS.md`, `.agent/skills/vietphish/SKILL.md`, `docs/API.md`.

**Your steps, in order:** 00 → B1 → B2 and B4 in parallel → B3 → B5 → B6. Shared schedule: `docs/TASKS.md`.

## How to hand a step to the agent

Open **a new agent session** for each step, PowerShell at the repo root, paste that step's command block exactly. B4 runs in a second terminal tab, in parallel with B2 and B3. When the agent reports done, **you** run the step's "Nghiệm thu" (acceptance) section. If it passes, commit with the command block at the end of the step file. If a test fails, make the agent fix the code. Never edit `server/test/vectors/`.

## Schedule

| Time | Step | Wait for | Done when |
| --- | --- | --- | --- |
| 07:30–07:45 | 00 (human) | | `git pull`, `cd server; npm install`, `node src/index.js`, `/health` returns `ok`. Screenshot saved as `docs/process/B-0730.png` |
| 07:45–07:55 | B1 | | `node --test test/official.test.js test/reasons.test.js` prints `# pass 22`. Commit, push, **tell C "B1 đã push"** |
| 07:55–08:20 | B2 (session 1) | | `node --test test/heuristics.test.js` prints `# pass 24`. Commit, push, **tell C "B2 đã push"** |
| 07:55–08:45 | B4 (session 2) | B1 committed | `node --test test/vision.test.js test/safebrowsing.test.js` prints `# pass 16`. You run the real Gemini check with `node test/try-gemini.js <image>` |
| 08:20–08:45 | B3 (session 1) | B2 committed | `node --test test/fusion.test.js` prints `# pass 15` |
| 08:45–09:25 | B5 | B1 to B4 committed | `npm test` prints `# pass 96`, `# fail 0`. `node test/smoke.js http://127.0.0.1:8787` against the mock server prints 6/6 `ĐẠT`. Commit, push, **tell A "B5 đã push"** |
| 09:25–09:50 | B6 D1–D3 (human) | B5 pushed | Following `b6-deploy-cloud-run.md`, deploy to Cloud Run with `VISION_MOCK=1`, `node test/smoke.js $URL` prints 6/6. **Send A and C the Cloud Run URL** |
| 09:50–10:15 | B6 D4–D6 (human) | | Turn on real Gemini and Safe Browsing, `/health` shows `vision: on` |
| 10:15–10:45 | Bug fixes | | Only inside `server/`. Warm the server up with a few requests before 10:45 |
| 10:45–11:20 | C3 (human) | | Read the solution part of the video script |
| 11:20 | Report pushed | | Check on GitHub that `server/` is complete, tell A |

## Prompts

### B1

```powershell
agy --model gemini-4-argon-medium --mode accept-edits -i "Read AGENTS.md and .agent/skills/vietphish/SKILL.md, then follow .agent/workflows/b1-official-reasons.md exactly. Read the whole step file before writing the first line of code. Only create or modify the files listed in its 'File được sửa' section. Run the step's test command and paste the real output. Do not edit server/test/vectors/. Do not run git add, git commit or git push. Stop when the step is done."
```

### B2

```powershell
agy --model gemini-4-argon-medium --mode accept-edits -i "Read AGENTS.md and .agent/skills/vietphish/SKILL.md, then follow .agent/workflows/b2-heuristics.md exactly. Read the whole step file before writing the first line of code. Only create or modify the files listed in its 'File được sửa' section. Run the step's test command and paste the real output. Do not edit server/test/vectors/. Do not run git add, git commit or git push. Stop when the step is done."
```

### B4 (second terminal tab)

```powershell
agy --model gemini-4-argon-medium --mode accept-edits -i "Read AGENTS.md and .agent/skills/vietphish/SKILL.md, then follow .agent/workflows/b4-vision-safebrowsing.md exactly. Read the whole step file before writing the first line of code. Only create or modify the files listed in its 'File được sửa' section. Run the step's test command and paste the real output. Do not call the real Gemini API, the human will run try-gemini.js. Do not run git add, git commit or git push. Stop when the step is done."
```

### B3

```powershell
agy --model gemini-4-argon-medium --mode accept-edits -i "Read AGENTS.md and .agent/skills/vietphish/SKILL.md, then follow .agent/workflows/b3-fusion.md exactly. Read the whole step file before writing the first line of code. Only create or modify the files listed in its 'File được sửa' section. Run the step's test command and paste the real output. Do not edit server/test/vectors/. Do not run git add, git commit or git push. Stop when the step is done."
```

### B5

```powershell
agy --model gemini-4-argon-medium --mode accept-edits -i "Read AGENTS.md and .agent/skills/vietphish/SKILL.md, then follow .agent/workflows/b5-analyze-server.md exactly. Read the whole step file before writing the first line of code. Only create or modify the files listed in its 'File được sửa' section. Run npm test in server/ and the smoke test against the mock server, paste the real output. Do not run git add, git commit or git push. Stop when the step is done."
```

### B6 (you run the deploy commands yourself)

```powershell
agy --model gemini-4-argon-medium --mode accept-edits -i "Read .agent/workflows/b6-deploy-cloud-run.md. Only help read errors and look things up in the step file when the human asks. Do not run gcloud commands, do not create or edit any file that holds keys, do not run git."
```

## Who to notify

| When | Message | Recipient |
| --- | --- | --- |
| B1, B2 pushed | "B1 đã push", "B2 đã push" | C, for step C2 |
| B5 pushed | "B5 đã push" | A, to accept A2 |
| Deploy done | "URL Cloud Run: …" | A updates `API_BASE`, C runs eval through the API |

## When late

If B4 is not done at 09:15, finish B4 before moving to B5. The real Gemini check moves to B6. If Gemini still fails at 10:15, run with `degraded` results from the heuristics and say so plainly in the video.
