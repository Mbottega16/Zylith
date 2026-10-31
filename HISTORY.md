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
