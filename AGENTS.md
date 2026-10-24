# Zylith — repo instructions

## Purpose
A browser hub for reverse-engineered, re-implemented, and open-source games that run in a browser tab, plus a safe way to add your own. Click a game and play. Nothing in the catalog may need a game the player owns.

## Architecture
Vanilla HTML/CSS/JavaScript. No build system or runtime dependencies. `games.js` is the catalog (about 70 rows, all checked in a browser). `app.js` owns browsing and the game dialog. `lab/` owns adding games: `scan.js` (static scanner), `zip.js`, `pack.js` (GitHub, zip, folder), `frame.js` (sandbox iframe and probe), `store.js` (IndexedDB), `lab-ui.js` (player and Add dialogs). `tools/` builds the catalog. `tests/` holds the scanner unit tests and two Playwright suites.

## Rules
- Nothing in the catalog may require owning the game. Drop pages that ask for ROMs, ISOs, or game files. Do not list unofficial ports of commercial games.
- Do not add ROMs, binaries, extracted assets, or scraped game bodies to the repo. Catalog rows are links.
- Added games run only inside the sandbox iframe (`sandbox="allow-scripts allow-pointer-lock"`, no `allow-same-origin`) with the CSP from `lab/frame.js`. Never loosen the sandbox flags or the CSP without re-running `tests/e2e-frame.mjs`.
- Added games stay in the player's browser (IndexedDB). There is no server and no sharing.
- Favorites were removed on purpose (owner's call, 2026-10-24). Do not add them back.
- Keep the app dependency-free unless there is a clear reason to add a package.
- Write files with LF or CRLF consistently; this repo's checked-out files are CRLF on Windows.

## Verification
- `node tests/scan.test.mjs` (scanner, no browser).
- `PLAYWRIGHT=<playwright module url> node tests/e2e-frame.mjs` (sandbox) and `... node tests/e2e-ui.mjs --net` (whole page, GitHub import). Playwright lives in `~/OneDrive/Desktop/Chegga/web/node_modules/playwright`. Run browser suites with few workers: the PC has 8 GB of RAM.
- Manual: `py -m http.server 4173` and open http://localhost:4173.

## Never Read / Noise Zones
No vendored game files, game archives, ROMs, or downloaded content belong in this repo. Ignore `.DS_Store`, `__pycache__/`, and local screenshots.

## Session Handoff (Last Worked On · Current State · Next Up)
- 2026-10-24: Rebuilt around playable games. Added Add-a-game (GitHub link, zip, HTML file, folder) with a static scanner, a sandboxed test run, and local storage. Replaced the 2,285-row link index with a 74-row checked catalog (9 reverse-engineered). Removed favorites, the "bring your game files" tab, and the source-project tab. The old index is at commit 743a7ad.
- Next: grow the reverse-engineered shelf. Only a few browser-playable ones exist; add more by hand through `tools/reverse-include.txt`. Consider a worker thread for the scanner on very large packages.
