# The reverse-engineered shelf

The reverse-engineered shelf is the set of catalog rows tagged **Reverse-engineered** in `games.js`. A row gets onto the shelf only by a hand list, a browser check and a rebuild of the catalog. The static scanner (`lab/scan.js`) is **not** part of this path. It only runs on games a player adds.

## The hand list: `tools/reverse-include.txt`

- One `owner/repo` per line, as it appears on GitHub. Case does not matter (both sides are lower-cased).
- Lines starting with `#` are comments. Blank lines are ignored.
- A harvested reverse-search row is dropped unless its repo is on this list.

```
# Reverse-engineered / re-implemented games checked by hand: ...
tsherif/space-shooter.c
yancharkin/spelunkyclassichd
```

## How a row gets onto the shelf

1. **Find it.** `node tools/reverse-harvest.mjs repos.json out.json` reads the old decompilation index (`repos.json`, a list of `owner/repo`) and a GitHub topic search (`gh` CLI). It keeps repos that have a homepage, are not forks and are not on the excluded hosts (GitHub, Steam, itch.io, and similar). It then checks each homepage is live.
2. **Check it in a browser.** `PLAYWRIGHT=<module url> node tools/verify.mjs out.json verified.jsonl` opens each page in headless Chromium inside a Zylith-style iframe. It nudges the page with a click and key presses, then scores it. A page passes (`ok`) only if all three hold:
   - score of at least 3 (canvas area, draw calls, animation frames, key or input listeners, sound, game words, minus points for link-heavy or text-heavy pages and for store or marketing words);
   - at least one input listener was seen;
   - the page text does not ask for ROMs, ISOs, game files, or proof of ownership.
3. **Hand-check and list it.** A person confirms the game is a reverse-engineered or re-implemented game that runs with no files from the player, and not an unofficial port of a commercial game. Then the repo goes on `tools/reverse-include.txt`. The file is the only record of that judgment.
4. **Rebuild.** `node tools/build-catalog.mjs harvest.json,... verified.jsonl,... tools/exclude.txt` writes `games.js`.

## Add one game: step by step

Run these from the repo root. Steps 2 and 3 need tools that are not in the repo: the `gh` CLI and Playwright (see `README.md`).

1. **Check the rules.** Read the "Settled decisions" in `CLAUDE.md`. The game runs in a browser with no ROM, ISO, disc or purchased copy from the player. It is not an unofficial port of a commercial game. Search `tools/exclude.txt` for the repo and stop if it is there.
2. **Put the repo in a harvest file.** Write a JSON list with the repo, e.g. `repos.json` containing `["owner/repo"]`, then run `node tools/reverse-harvest.mjs repos.json harvest.json`. The build skips any repo that is not in a harvest file, so a line in the hand list alone does nothing.
   - **Warning:** `build-catalog.mjs` writes `games.js` from only the files you pass to it. A harvest file with one repo makes a `games.js` with one row. Step 6 must pass the full harvest and verified files that produced the current 74 rows, plus the new ones. Those files are not in this repo. If you do not have them, stop before step 6 and leave `games.js` alone.
3. **Check it in a browser.** Run `PLAYWRIGHT=<playwright module url> node tools/verify.mjs harvest.json verified.jsonl`. Open `verified.jsonl` and find the repo's line. It must say `"ok":true`. If it says `"ok":false`, stop: the game does not go on the shelf. To re-check a repo, delete its line first, because `verify.mjs` skips repos already in the file.
4. **Look at the page yourself.** Open the game and confirm it asks for no game files.
5. **Add it to the hand list.** Add `owner/repo` on its own line in `tools/reverse-include.txt`. Case does not matter.
6. **Rebuild the catalog.** Run `node tools/build-catalog.mjs harvest.json verified.jsonl tools/exclude.txt`. It prints `playable N (embed M), reverse-engineered R`. R should be one higher than before.
7. **Update the counts.** The catalog test fails until both are changed:
   - `EXPECTED_ROWS` in `tests/catalog.test.mjs` (currently `74`): raise it by the number of new rows.
   - The `games.js` line in `CLAUDE.md`: the total row count, the platform counts and the access counts.
8. **Run the scanner check.** Run `node tests/scan.test.mjs`. It must end with `ℹ fail 0` and `ℹ pass 67`. This is the crew's gate. It tests the scanner for player-added games; it does not read `tools/reverse-include.txt` or judge shelf rows.
9. **Run the offline tests.** Run `node --test tests/`. It must end with `ℹ fail 0` and `ℹ pass 95`. One of its tests, "scanner's 18 self-checks all pass", re-runs the 18 named scanner checks at the top of `tests/scan.test.mjs`. Another, "the shipped reverse-include.txt parses to its listed repos", checks the hand list with `tools/reverse-list.mjs`.
10. **Commit together.** Commit `games.js`, `tools/reverse-include.txt`, `CLAUDE.md`, `tests/catalog.test.mjs` and any harvest or verify output you keep, in one commit. Nothing is live until the owner pushes `main`.

Rows from `tools/curated.mjs` skip step 5. Their tag is set in code (the `REVERSE` set in that file), not in the hand list.

## Trial run (2026-11-02, crew worktree)

No new game was added. The checklist was followed as far as this machine allows:

| Step | Result |
|---|---|
| 1 | Done: read `CLAUDE.md`; the four hand-list repos are not in `tools/exclude.txt`. |
| 2–3 | Blocked: needs the `gh` CLI, network to GitHub, and Playwright. No candidate repo was chosen, so none was harvested or checked. |
| 4 | Blocked: needs a browser and a person to look at the page. |
| 5 | Not run: no repo passed steps 2–4, so none goes on `tools/reverse-include.txt`. |
| 6 | Not run: no harvest or verified files for the 74 rows are in this repo (see the warning in step 2). |
| 7 | Checked, no change: `tests/catalog.test.mjs` passes at `EXPECTED_ROWS = 74`, and `CLAUDE.md` matches `games.js` (74 rows: 65 open-source, 9 reverse-engineered). |
| 8 | `node tests/scan.test.mjs`: `ℹ pass 67`, `ℹ fail 0`. |
| 9 | `node --test tests/`: `ℹ pass 95`, `ℹ fail 0` (the old figure of 85 was out of date). |
| 10 | Commit only this doc. |

## What `build-catalog.mjs` checks for each reverse row

A row is written to `games.js` only if all of these hold, checked in this order:

| # | Rule |
|---|---|
| 1 | The repo is in the harvest file and has a `verified.jsonl` line. |
| 2 | The verify result is `ok`. Curated rows only need a live page (no `needs` flag). |
| 3 | The repo is not in `tools/exclude.txt`. |
| 4 | For a reverse-search row, the repo is in `tools/reverse-include.txt`. |
| 5 | Its page URL is not already in the catalog. |

Every row written gets `verdict: 'pass'`. The build does not compute a verdict; the browser check is the gate.

Rows from `tools/curated.mjs` skip rule 4. The hand-picked list in that file carries its own `REVERSE` set for the tag. Those rows are listed in code, not in `reverse-include.txt`.

## What a valid entry needs

- A GitHub `owner/repo` that exists and has a live homepage.
- A passing browser check (`ok`) with at least one input listener.
- No request for the player's own game files (ROM, ISO, disc, or a purchased copy).
- Not an unofficial port of a commercial game (a settled rule, see `CLAUDE.md`).
- Not in `tools/exclude.txt`.
- A line in `tools/reverse-include.txt` for search-found repos.
- The row count updated: `tests/catalog.test.mjs` checks `EXPECTED_ROWS`, and it must be bumped on purpose when the shelf grows.

## What the scanner does not check

`lab/scan.js` does not read `reverse-include.txt` and is not run by `build-catalog.mjs`. Rows on the shelf were never run through the scanner. Whether a repo is safe is judged by the hand check in step 3 and the browser check in step 2. Games a player adds get the scanner and the sandbox test instead; see [add-a-game.md](add-a-game.md).

## Tests

```
node tests/catalog.test.mjs     # via: node --test tests/ (catalog row checks)
```

These check that every row has a verdict, a unique id and an https game URL. They do not check that the hand list matches `games.js`.
