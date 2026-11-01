# Zylith — rules & map (read this first)

A browser hub where you click a game and play it, plus a safe way to add your own.

**History:** [`HISTORY.md`](HISTORY.md), newest first — read it when a task touches past
work. **Business side:** the my-brain vault, `projects/zylith/context.md`.

## What this is
- **What:** a hub for reverse-engineered, re-implemented and open-source games that run in
  a browser tab. Two kinds of games: a checked **catalog** (each one loaded in a real
  browser and seen to act like a game; links to the creators' own pages) and **your
  games** (paste a GitHub link or drop a zip, HTML file or folder; Zylith scans it, runs
  it in a locked sandbox, and says whether it is really a game).
- **For:** anyone who wants to play browser games without owning anything.
- **Platform:** a static site — vanilla HTML/CSS/JavaScript, no build, no dependencies.
  Live on GitHub Pages at <https://mbottega16.github.io/Zylith/>; **a push to `main`
  updates the live site.**
- **What "done" looks like:** click a game, it plays. Nothing in the catalog needs a game
  the player owns, and nothing unsafe gets through the Add-a-game checks.
- **Direction:** grow the reverse-engineered shelf by hand; keep the scanner and sandbox
  strict.
- **Full design:** `README.md` (how the scan, sandbox and verdicts work).

## Settled decisions (don't re-argue)
- **Nothing in the catalog may require owning the game.** Drop pages that ask for ROMs,
  ISOs or game files. Do not list unofficial ports of commercial games.
- **Catalog rows are links.** No ROMs, binaries, extracted assets or scraped game bodies
  in the repo.
- **Added games run only inside the sandbox iframe** (`sandbox="allow-scripts
  allow-pointer-lock"`, no `allow-same-origin`) with the CSP from `lab/frame.js`.
- **Added games stay in the player's browser** (IndexedDB). No server, no sharing.
- **Favorites were removed on purpose** (owner's call, 2026-10-24). Do not add them back.
- **Dependency-free** unless there is a clear reason to add a package.

## How it's built
| | |
|---|---|
| `games.js` | The catalog (about 70 rows, all checked in a browser) |
| `app.js` | Browsing and the game dialog |
| `lab/` | Adding games: `scan.js` (static scanner), `zip.js`, `pack.js` (GitHub, zip, folder), `frame.js` (sandbox iframe and probe), `store.js` (IndexedDB), `lab-ui.js` (player and Add dialogs) |
| `tools/` | Builds the catalog; `tools/reverse-include.txt` is the hand list for the reverse-engineered shelf |
| `tests/` | Offline unit tests (scanner, frame judge) and two Playwright suites |

## Commands & Verification
- `node --test tests/` — **offline, no browser:** `scan.test.mjs` (scanner, 65 tests) and
  `frame-judge.test.mjs` (frame verdict judge, 9 tests). Run from the repo root; it must
  end with `fail 0`.
- `node tests/scan.test.mjs` — the scanner alone, no browser (the crew's gate).
- **Needs a browser (Playwright):** `tests/e2e-frame.mjs` and `tests/e2e-ui.mjs`. Not part of
  `node --test`.
- `PLAYWRIGHT=<playwright module url> node tests/e2e-frame.mjs` (sandbox) and
  `... node tests/e2e-ui.mjs --net` (whole page, GitHub import). Playwright: PC
  `~/OneDrive/Desktop/Chegga/web/node_modules/playwright`; Mac
  `~/Desktop/my-brain/projects/elo-bot-ascent/app/node_modules/playwright`. Run browser
  suites with few workers: the PC has 8 GB of RAM.
- Manual: `run.bat` / `run.command`, or `py -m http.server 4173` (Mac:
  `python3 -m http.server 4173`) and open http://localhost:4173 — over `http://`, not
  `file://`.

## Never Read / Noise Zones (Do Not Scan)
No vendored game files, game archives, ROMs or downloaded content belong in this repo.
Ignore `.DS_Store`, `__pycache__/`, and local screenshots.

## Rules & Gotchas
- **Never loosen the sandbox flags or the CSP** without re-running `tests/e2e-frame.mjs`.
- Write files with LF or CRLF consistently; this repo's checked-out files are CRLF on
  Windows.
- The pre-rebuild 2,285-row link index is at commit `743a7ad`, if it is ever needed.

## Session Handoff (Last Worked On · Current State · Next Up)

*Overwrite this at the end of every session; move the previous handoff into `HISTORY.md` first.*

- **Last Worked On (2026-10-31):** the scanner runs in a worker for packages over 8 MB.
  `scanAsync` in `lab/scan.js` picks the worker (`lab/scan-worker.js`) or the inline scan;
  `lab/lab-ui.js` awaits it. Two new tests in `tests/scan.test.mjs` check that large and
  small inputs give identical results.
- **Current State:** the last recorded live site is `main` at `54b0188`. `769557f`,
  `d03ebc0` and `984e087` are not confirmed live. Offline run on this tree:
  `node --test tests/` → 76 pass, 0 fail (`scan.test.mjs` 67, `frame-judge.test.mjs` 9).
  `node tests/scan.test.mjs` → 67 pass, 0 fail. The browser suites (`tests/e2e-frame.mjs`,
  `tests/e2e-ui.mjs --net`) were not run, and the browser path of the worker is unchecked.
- **Next Up:**
  1. Grow the reverse-engineered shelf. Only a few browser-playable ones exist; add more
     by hand through `tools/reverse-include.txt`.
  2. Check the Web Worker scan path in a real browser, then run both browser suites on the
     current tree before the next push.
