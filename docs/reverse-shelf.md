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
