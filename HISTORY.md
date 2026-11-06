# Zylith — history

Every session's log, **newest first**. Read on demand, not at startup. The current
snapshot is the Session Handoff at the bottom of `CLAUDE.md`.

**Adding an entry:** at the end of a session, move the old handoff here as a new entry
at the top, then overwrite the handoff. One entry per session, 5–10 lines:

```
## YYYY-MM-DD — <what, in a few words>
*<machine: Mac | PC> · <agent: Claude | Antigravity> · commits `abc1234`*
- **Changed:** what is different now, for the player and in the code.
- **Why:** the ask or the problem, and any decision made (with its reason).
- **Verified:** what was run and what it said; what was NOT checked.
- **Left open:** anything unfinished or waiting on the owner.
```

This repo is public, so private planning notes stay in the owner's vault
(`projects/zylith/history.md` and `context.md`), not here.

---

## 2026-11-06 — surface missing download files in Add-a-game report

*Mac · Antigravity · commits on `crew/jmw4ipaoi965c`*
- **Changed:** In `lab/lab-ui.js`, checked `cur.info.missing` in `renderReport()`, `decide()`, and `analyse()`. Rendered a warning panel listing each missing file (`#labMissing`). If the entry page failed to download (`!scan.entry && missing.length`), clarified that download failed rather than claiming no web game exists. Added styling in `lab/lab.css` for `.lab-panel h3.warn` and `.lab-list code`. Added browser test steps in `tests/e2e-ui.mjs`.
- **Why:** When repository files failed to download during GitHub import (particularly the HTML entry page), the report previously claimed "Not a runnable web game" / "No HTML page found" without explaining that the download failed or which files were missing.
- **Verified:** `node tests/scan.test.mjs` → 67 pass, 0 fail. `node --test tests/` → 100 pass, 0 fail. `node tests/e2e-ui.mjs` → 9 pass, 0 fail (including entry download failure and non-entry missing files tests). `node tests/e2e-frame.mjs` → 7 pass, 0 fail. `node tests/e2e-remove.mjs` → 6 pass, 0 fail.
- **Left open:** none.

## 2026-11-06 — support multi-word queries in library search

*Mac · Antigravity · commits on `crew/jmw4ied3o20c0`*
- **Changed:** `filteredGames()` in `app.js` splits the search string on whitespace into terms and verifies that the game's searchable text contains every term (`words.every(w => text.includes(w))`). Added test step in `tests/e2e-ui.mjs` verifying multi-word queries match regardless of word order.
- **Why:** searches with multiple words (e.g. "3d racing" vs "racing 3d") failed to match games where words appeared non-consecutively or in different order across metadata fields.
- **Verified:** `node tests/scan.test.mjs` → 67 pass, 0 fail. `node --test tests/` → 100 pass, 0 fail. `node tests/e2e-ui.mjs` → 7 pass, 0 fail. `node tests/e2e-frame.mjs` → 7 pass, 0 fail. `node tests/e2e-remove.mjs` → 6 pass, 0 fail.
- **Left open:** none.

## 2026-11-05 — synchronously flush sandbox storage before frame unmount

*Mac · Antigravity · commits on `crew/jmw34jt6ie5c6`*
- **Changed:** `loader()` tracks pending storage writes in `localStorage` and exposes `_flush()` to synchronously cancel pending debounce timers and post save data to parent on `pagehide`, `beforeunload`, and explicit `zy: 'flush'` messages. `ZylithFrame.mount()` adds an explicit `flush()` trigger and calls it in `destroy()` prior to removing the iframe DOM node, while retaining the message listener and window reference to process incoming synchronous flush saves. Added unit tests in `tests/frame-judge.test.mjs` and `storage-destroy-reload` test in `tests/e2e-frame.mjs`.
- **Why:** data written to localStorage immediately prior to calling `destroy()` was debounced with a 1500ms timer and lost when the iframe was unmounted.
- **Verified:** `node tests/scan.test.mjs` → 67 pass, 0 fail. `node --test tests/` → 100 pass, 0 fail (2 new unit tests in `tests/frame-judge.test.mjs`). `node tests/e2e-frame.mjs` → 7 pass, 0 fail (new `storage-destroy-reload` case). `node tests/e2e-ui.mjs` → 6 pass, 0 fail. `node tests/e2e-remove.mjs` → 6 pass, 0 fail.
- **Left open:** none.

## 2026-11-05 — authenticate sandbox frame messages to prevent probe spoofing

*Mac · Antigravity · commits on `crew/jmw343qgi4c86`*
- **Changed:** `ZylithFrame.mount()` generates a cryptographically random session token via `crypto.randomUUID()` (with fallback to `crypto.getRandomValues`). The token is sent to the frame during the boot handshake message. The sandbox frame's internal probe `post()` helper attaches the token to all outgoing messages (`probe`, `save`, `navigated`, `fatal`, `booted`). `onMsg` in `mount()` rejects any message where `m.token !== token` (ignoring spoofed `parent.postMessage` calls).
- **Why:** untrusted code running inside the sandbox iframe could call `parent.postMessage({ zy: 1, t: 'probe', ... })` or fake saves/navigation to spoof probe checks.
- **Verified:** `node tests/scan.test.mjs` → 67 pass, 0 fail. `node --test tests/` → 98 pass, 0 fail (3 new unit tests in `tests/frame-judge.test.mjs`). `node tests/e2e-frame.mjs` → 6 pass, 0 fail (new `spoof` test case in Chromium verifying calls lacking the token are ignored). `node tests/e2e-ui.mjs` → 6 pass, 0 fail. `node tests/e2e-remove.mjs` → 6 pass, 0 fail.
- **Left open:** none.

## 2026-11-01 — players can remove hosted links from their list

*Mac · Claude · commits `56e7b75` on `crew/jmvyaxjb1673b`*
- **Changed:** a hosted-page row (id starts with `submitted-`) shows a "Remove from my list" button in the game dialog. It asks first, then drops the row from `userGames`, saves and re-renders. Catalog and local games do not show it.
- **Why:** hosted links could be added but not removed. The button sits beside Delete, which is only for local games.
- **Verified:** `node tests/scan.test.mjs` → 67 pass, 0 fail. `node --test tests/` → 81 pass, 0 fail. Browser check not run: headless Chromium cannot launch in the sandbox (`bootstrap_check_in` permission denied), so add → remove → reload is untested in a real browser.
- **Left open:** run the add/remove/reload path in a browser; `tests/e2e-ui.mjs --net` not run.

## 2026-10-31 — CLAUDE.md commands section; scanner worker for big packages

*Mac · Claude · commits on `crew/jmvx36bai5c25`*
- **Changed:** `CLAUDE.md` Commands now list `node --test tests/` as the offline run and mark the two Playwright suites as browser-only. The scanner gets `scanAsync`: a package over 8 MB goes to `lab/scan-worker.js` (a Web Worker in the page, a `worker_threads` Worker in Node). The result is the same object `scan()` returns. `lab-ui.js` awaits it.
- **Why:** big uploads froze the page during the scan; the handoff's Next Up item 2 asked for it. Worker failure falls back to the inline scan.
- **Verified:** `node --test tests/` → 76 pass, 0 fail (two new tests: large package via the worker equals the inline scan; small package equals on both paths). Browser check not run: headless Chromium cannot launch in the sandbox.
- **Left open:** `tests/e2e-ui.mjs --net` not run since `lab-ui.js` became async.

## 2026-10-30 — caught up HISTORY, refreshed handoff

*Mac · Claude · docs only, no code touched · commits `6afe21b`*
- **Changed:** `HISTORY.md` now records the 2026-10-24 rebuild (`54b0188`) in the four-line
  format, and the handoff was refreshed.
- **Why:** the log was behind the rebuild; the handoff had to name the three commits since.
- **Verified:** not run as tests; the handoff's `node tests/scan.test.mjs` 65/65 figure
  was recorded from the earlier session.
- **Left open:** the browser suites were not run.

## 2026-10-24 — docs restructured to the uniform standard

*Mac · Claude · docs only, no code touched*
- **Changed:** `CLAUDE.md` now has the owner's standard seven sections (What this is ·
  Settled decisions · How it's built · Commands & Verification · Never Read · Rules &
  Gotchas · Session Handoff), with the big picture at the top. This file is new.
- **Why:** one structure across every repo: a short always-read file, and a log read only
  when needed.
- **Verified:** every line of the old `CLAUDE.md` checked against the new files.
- **Left open:** none.

## 2026-10-24 — rebuilt around playable games

*Mac · Claude · commits `54b0188`*
- **Changed:** Added Add-a-game (GitHub link, zip, HTML file, folder). A static scanner blocks miners, exfiltration, shell commands and disguised programs; a sandboxed run (opaque-origin iframe, strict CSP) checks that the game draws, loops and reads input; games stay in IndexedDB. The 2,285-row link index became a 74-row checked catalog (9 reverse-engineered). Favorites, the "bring your game files" tab and the source-project tab were removed.
- **Why:** Click a game and it plays, with nothing in the catalog needing a game the player owns and nothing unsafe getting through Add-a-game. Favorites removal was the owner's call. The old index is kept at `743a7ad`.
- **Verified:** The commit message states every catalog row was loaded in a real browser; not re-checked for this entry. On the current tree, `node tests/scan.test.mjs` passes 65/65 (run at `984e087`). Not checked: `tests/e2e-frame.mjs` and `tests/e2e-ui.mjs --net`.
- **Left open:** Grow the reverse-engineered shelf by hand through `tools/reverse-include.txt`. Consider a worker thread for the scanner on very large packages.

## Before 2026-10-24

Earlier work (the 2026-10-10 "Arcade" start on the PC, the 2026-10-22 catalog expansion
and first hosting) is logged in the owner's vault and in `git log`.
