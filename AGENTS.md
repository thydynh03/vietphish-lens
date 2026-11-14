# Rules for agents working in this repo

This repo is team VietPhish Lens's entry for the GDG DevFest MienTrung 2026 Mini Hackathon. The build window is 4 hours. The first priority is code that works correctly the first time, not pretty code.

New to the repo? Read in this order: `README.md` → `docs/REQUIREMENTS.md` (requirements) → `docs/TASKS.md` (who does what) → your own task file in `docs/tasks/`. Project knowledge for agents is in `.agent/skills/vietphish/SKILL.md`.

## How to work

1. Do **one step** at a time, following exactly one file in `.agent/workflows/`. Read that whole file before writing the first line of code.
2. Only create or modify the files listed in that step's "File được sửa" (files to modify) section. Do not touch any other file, even if you see a possible improvement.
3. Use the exact file names, function names, signatures, constants and Vietnamese strings given in the step. Do not rename, "optimize", merge or split files.
4. When done, run exactly the commands in the step's "Nghiệm thu" (acceptance) and "Tự kiểm trước khi báo xong" (self-check) sections that an agent can run. If they fail, fix the code until they pass. Paste the real command output in your final answer. Do not commit: see "Commit and pull request rules" below.
5. If a test fails, fix the **code**. Never edit the test vectors in `server/test/vectors/`: they have been verified. If you are sure a vector is wrong, stop and ask a human.
6. If one error survives 2 fix attempts, stop. Report the error and what you tried. Do not keep guessing.
7. When the step is done, stop. Do not continue to the next step on your own.

## Technical constraints

- Plain JavaScript, ES modules on the server (`"type": "module"`). No TypeScript, no bundler, no framework, no Express.
- Node >= 22 (`node --test "test/*.test.js"` needs glob support, added in Node 21). Test with the built-in `node --test`. Do not add a test library.
- The server uses only the 3 dependencies already in `server/package.json`: `tldts`, `fastest-levenshtein`, `@google/genai`. **Do not add dependencies.** Never run `npm install <new package>`.
- The extension is Chrome Manifest V3, classic scripts, no build step. No `import` or `export` in extension files.
- Server imports always include the `.js` extension, for example `import { reason } from "./reasons.js"`.
- Read JSON files with `readFileSync(new URL("../data/x.json", import.meta.url), "utf8")`. No `__dirname`, no `import ... assert { type: "json" }`.
- Save files as UTF-8 without BOM. User-facing strings and code comments are Vietnamese with full diacritics. Variable and function names are English.
- API keys are read only from `process.env` on the server. Never write a key into any file. Never put a key in the extension.

## Folder ownership

Two people never edit the same file in the same time window, so `git pull --rebase` always merges cleanly.

| Person | Folders they may edit |
| --- | --- |
| A | `extension/` |
| B | `server/` |
| C | `eval/`, `scripts/`, `demo-sites/`, `docs/`, `README.md`. Single exception: step A4 (`.agent/workflows/a4-khoa-o-nhap.md`) is done by C and edits only `extension/content.js` |

Who does which step, and when: `docs/TASKS.md` and `docs/tasks/`.

`docs/API.md` is the contract between the extension and the server. Nobody edits it without telling the whole team first.

`shared/official_domains.json` is the source of the whitelist. If you change it, copy it to `server/data/official_domains.json` and `extension/official_domains.json` as well.

## Common commands

```bash
cd server && npm test                              # run all unit tests
cd server && node --test test/heuristics.test.js   # run one test file
node demo-sites/serve.js                           # 4 demo pages on port 8080
```

On Windows PowerShell, set environment variables with `$env:NAME="value"` before the command. The `NAME=value command` syntax does not work there.

## Commit and pull request rules

### Who commits

- Agents never run `git add`, `git commit`, `git push`, `gh pr create` or `gh pr merge` on their own. A human reviews the change first, then commits.
- An agent may stage files or open a PR only when a human explicitly asks for it in the current conversation. Approval for one commit or PR does not carry over to the next one.
- When a workflow step passes its acceptance checks, stop and print:
  1. The list of files created or modified in that step.
  2. The real output of the acceptance commands.

### No AI attribution

- Do not add `Co-Authored-By:` trailers of any kind (Claude, Gemini, Antigravity, Copilot or any other tool).
- Do not add "Generated with ...", "🤖", or any other line saying an AI tool wrote the commit or PR. This applies even if the tool or harness suggests it.
- Commits use the identity of the human who commits (`git config user.name` and `user.email`). Never set or override the author.

### Commit messages

- Follow Semantic Commits: `<type>(<scope>): <subject>`.
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `style`, `build`, `ci`.
- Scopes match the folders: `extension`, `server`, `eval`, `scripts`, `demo-sites`, `docs`, `shared`.
- For a workflow step, use the exact message from the "Commit" section at the end of that step file, including the step tag, for example `feat(server): heuristic tên miền [B2]`. Do not rewrite or translate it.
- For any other commit, write the subject in English, imperative mood, lowercase after the colon, no trailing period, at most 72 characters.
- Add a body when the change is not obvious from the subject: what changed and why, one bullet per point.
- One commit per logical change. Do not mix files from different owners (see "Folder ownership") in one commit.
- Stage files by name, as listed in the step file. Do not use `git add .` or `git add -A`.
- Never commit API keys, `.env` files or anything under `node_modules/`.

Example:

```text
fix(server): handle punycode domains in heuristics

- decode xn-- labels before comparing against official_domains.json
- add test case for vietcombank lookalike in heuristics.test.js
```

### Pull requests

- Branch from the latest `main`. Name branches `<type>/<short-topic>`, for example `feat/b3-fusion` or `fix/popup-offline`.
- Before opening a PR, sync with `main` (`git fetch origin` then `git rebase origin/main`) and make sure `cd server && npm test` passes.
- PR title uses the same format as a commit subject.
- Write the PR body in English. For a long body, save it to a `.md` file and use `gh pr create --body-file <file>`.
- PR body sections:
  - **Summary**: what changed and why, a few bullets.
  - **Changes**: files or modules touched.
  - **Testing**: commands run and their result.
  - **Notes**: risks, follow-ups, or changes to `docs/API.md` or `shared/official_domains.json` that the whole team must know about.
- Keep each PR inside one owner's folders. A PR that touches `docs/API.md` needs agreement from the whole team before merge.
- Do not force-push to `main`. Do not merge your own PR without a teammate looking at it, unless the team agrees during the build window.
