# Community data sources (blocklists)

What public phishing data exists, what we can legally use, and how it plugs into VietPhish Lens.

**Status:** implemented and tested in the sandbox repo [`VietPhish_Demo`, PR #4](https://github.com/thydynh03/VietPhish_Demo/pull/4) (`scripts/fetch-blocklists.js`, `server/src/blocklist.js`, `docs/DANH-SACH-DEN.md`). It is **not** part of this competition repo: the code is not copied here so prebuilt code stays under the 30% limit. It is a post-event feature, or a stretch step if the build window has spare time after CP2.

A blocklist only catches pages that were **already reported**. It complements our core idea (look-alike brand + wrong domain + asks for a secret), which catches pages created minutes ago.

## Sources we can use

| Source | What it has | Terms | Status (14 Nov 2026) |
| --- | --- | --- | --- |
| [vn-badsite-filter](https://gitlab.com/malware-filter/vn-badsite-filter) | ~16,800 domains targeting Vietnamese users, a mirror of the ChongLuaDao blocklist | See the project's License section | **Stale:** last updated 11 Apr 2025, because the ChongLuaDao API stopped |
| [PhishVN](https://data.mendeley.com/datasets/b97hxbxtpd) (Mendeley Data) | 53,116 labelled URLs from NCSC, ChongLuaDao, OpenPhish, Tranco | CC BY 4.0, attribution required | Version of 18 Aug 2026. Manual CSV download |
| [OpenPhish](https://openphish.com/feed.txt) community feed | Global phishing URLs, updated continuously | Free, non-commercial only | Live, ~150–300 URLs per pull |
| [PhishTank](https://phishtank.org/) | Community-submitted, verified phishing URLs | Free, register an app key, attribute PhishTank | Live, ~45,000 URLs per pull |
| Google Safe Browsing v4 | Lookup API | Free for non-commercial use; commercial use moves to Web Risk | Already layer 2 of the server |

## Sources we cannot simply download

- **ChongLuaDao community reports:** moderated internally, the public API no longer resolves. Needs a partnership.
- **NCSC** (canhbao.khonggianmang.vn): no public bulk download. Needs a partnership. The NCSC part of PhishVN is a frozen snapshot.

## How it works in the sandbox implementation

```powershell
node eval/fetch_real_data.js                    # once: downloads Tranco, needed by the popular-domain guard
node scripts/fetch-blocklists.js                # writes server/data/blocklist.json (not committed)
node scripts/fetch-blocklists.js --phishvn <file.csv> --phishvn-date 2026-08-18
$env:PHISHTANK_APP_KEY="..."; node scripts/fetch-blocklists.js
```

| Match | Verdict | Reason shown |
| --- | --- | --- |
| A fresh source (updated within 30 days) | DANGER 100 | "Trang nằm trong danh sách lừa đảo do cộng đồng báo cáo và xác minh (…)" |
| Only a stale source | Raised to at least SUSPICIOUS; badge only if the page asks for no secret | "Tên miền từng bị báo cáo lừa đảo trong … (cập nhật lần cuối …)" |

- The whitelist runs first, so official domains are never blocked.
- `server/data/blocklist.json` is generated on each machine or deploy (about 1.5 MB). It is not committed, because source terms differ.

## Lesson: blocklists cause false positives if merged naively

The first run blocked **98 domains in the Tranco top 100k**, including linkedin.com, t.me, wa.me, vk.com and gravatar.com. PhishTank and OpenPhish list phishing URLs *hosted on* those platforms (redirect links, user pages), and the first version blocked the whole domain. The fix:

1. URLs on popular domains (Tranco top 300k) and shared hosting (Google Docs, Dropbox, URL shorteners, GitHub, S3) are blocked by **path** only, and only if the path is at least 10 characters long.
2. Per-user platforms (web.app, vercel.app, github.io, blogspot…) are split per site using the Public Suffix List private section.
3. Domain-list entries that are themselves in the top 300k are dropped (dynamic DNS providers, sites that changed owner).

Result: 0 blocked in the top 300k. On unseen ranks 300k–500k: 21 DANGER + 4 SUSPICIOUS out of 200,000 (about 0.01%), mostly abused URL shorteners.

## If we add it after the event

- Run the fetch script daily (cron or at deploy) so OpenPhish and PhishTank stay "fresh".
- Add network-level blocking in the extension with `declarativeNetRequest`, like J2TEAM, so the list still works when the server is down.
- Add our own "report a phishing page" button with human review: the only way to get fresh Vietnamese community data.
