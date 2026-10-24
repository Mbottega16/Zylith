# Zylith

A browser hub where you click a game and play it. Zylith has two kinds of games:

1. **Catalog games.** Real browser games, with a focus on reverse-engineered and re-implemented ones, on their creators' own pages. Each one was loaded in a real browser and acted like a game. Most play inside Zylith. Pages that block embedding open in a new tab.
2. **Your games.** Paste a GitHub link or drop a zip, an HTML file, or a folder. Zylith scans the code, runs the game in a locked box, and tells you if it is really a game. Games you keep stay in your browser.

Zylith hosts no game files. Catalog entries are links. Your own games never leave your device.

## Run locally

- **Windows:** double-click `run.bat` (needs Python 3), or run `py -m http.server 4173` here and open <http://localhost:4173>.
- **Mac:** double-click `run.command`, or run `python3 -m http.server 4173`.

No install and no build step. Open the page over `http://`, not `file://`.

## Add a game

Open **Add a game**. Three ways in:

| Way | What it does |
|---|---|
| **GitHub link** | Reads the repo's file list, finds the folder with the page (`index.html`, `docs/`, `dist/`, or a `gh-pages` branch), downloads those files, then scans and tests them. |
| **Upload files** | Reads a `.zip` (including GitHub "Download ZIP"), a single `.html` file, or a folder. |
| **Hosted page link** | Saves a link to a page that is already online. Zylith cannot scan a remote page, so it opens in a new tab. |

A repo that only holds source code (it needs `npm run build`) cannot run. Zylith says so and shows the repo's hosted page if it has one.

## How Zylith tests a game

Each package goes through four steps.

1. **Fetch.** Size limits: 300 MB unpacked, 4,000 files, 80 MB per file. A zip bomb stops early.
2. **Static scan** (`lab/scan.js`). The scan never runs the code. It checks:
   - file types (programs, installers, and scripts block the package; a `.png` that is really a program blocks it too);
   - dangerous code: crypto miners, chat-webhook or IP-logger exfiltration, shell commands, the "paste this into a terminal" clipboard trick, decode-then-run code, redirects, password or card fields, scare text, hidden frames, remote code loading;
   - whether it looks like a game: graphics, a loop, input, sound, game words, a known engine.
3. **Sandbox test** (`lab/frame.js`). The game runs for about nine seconds, and you can play it in the preview. A probe records canvas draws, animation frames, input listeners, page changes, errors, and every blocked request. Zylith also sends a few key presses and a click, because many games wait for input.
4. **Verdict.** Four outcomes: *Looks like a game, and it behaves*; *Caution*; *Not a game*; *Blocked / unsafe*. You can add a game only if it is not blocked. A *Caution* game needs a tick in a box first.

Tests help you judge a game. They cannot prove it is harmless. That is why every added game always runs in the locked box.

### The locked box

- The frame uses `sandbox="allow-scripts allow-pointer-lock"` with no `allow-same-origin`. The game gets an opaque origin: it cannot read Zylith's page, storage, or cookies. It cannot open pop-ups, change the top page, submit forms, or download files.
- A Content-Security-Policy allows only the game's own files (as `blob:` URLs) and a short list of library CDNs. Every other network request is blocked, so a game cannot send data out.
- WebSocket, WebRTC, `sendBeacon`, clipboard, camera, and microphone calls are refused and logged.
- The game gets a private `localStorage`. Zylith saves it for that game only, up to 2 MB.
- If the game tries to leave or reload its frame, Zylith stops it.

Known limits: games that use IndexedDB, cookies, or service workers will not run (an opaque origin has none). ES-module games that build import paths at run time may fail. Games that need a server (online play) cannot connect.

## Catalog

`games.js` holds the playable catalog. Every row was loaded in a real browser, inside the same iframe flags the player uses, and acted like a game. No row needs a game you own: pages that ask for ROMs, ISOs, or "your game files" are dropped.

Two kinds of row carry a platform tag:

- **Reverse-engineered:** remakes, re-implementations, and ports that run in a browser with their own or free assets.
- **Open-source web game:** original games with a live page, found through GitHub.

How the catalog was built (tools in `tools/`):

1. `node tools/harvest.mjs out.json` searches GitHub topics for open-source browser games that have a live page.
2. `node tools/reverse-harvest.mjs repos.json out.json` reads the old decompilation index through the GitHub GraphQL API, adds a topic search, and keeps repos with a live home page.
3. `node tools/curated.mjs out.json` checks a short hand-picked list.
4. `node tools/verify.mjs in.json out.jsonl` opens each page in Chromium and records whether it draws, loops, reads input, and asks for game files. Needs Playwright (`PLAYWRIGHT=<module url>`).
5. `node tools/build-catalog.mjs harvest.json,... verified.jsonl,... tools/exclude.txt` writes `games.js`. Reverse-engineered rows from search must be listed in `tools/reverse-include.txt` (hand-checked).

### What the numbers say

Most reverse-engineering projects cannot run in a browser. A decompilation is C or C++ source that you compile for a computer, and it needs the ROM or disc of a game you own. Of the 2,285 rows in the old link index, about 700 had a live home page, and only a handful of those pages were a playable game without your own files. The old index is in git history (commit `743a7ad`, `games.js`). It is not part of the app.

To add a reverse-engineered game that does run in a browser, use **Add a game** with its GitHub link. If the repo has a web build, Zylith runs it. If it is native source, Zylith says so.

Access types: `instant` (plays now) and `local` (games you added).

## Tests

```
node tests/scan.test.mjs                          # scanner rules (no browser)
PLAYWRIGHT=<url> node tests/e2e-frame.mjs         # sandbox: games run, escapes are caught
PLAYWRIGHT=<url> node tests/e2e-ui.mjs [--net]    # whole page; --net also imports from GitHub
```

## Files

- `index.html`, `styles.css`, `app.js` — page, styling, catalog browsing
- `lab/scan.js` — static scanner · `lab/zip.js` — zip reader · `lab/pack.js` — GitHub, zip, and folder loading
- `lab/frame.js` — sandbox frame and probe · `lab/store.js` — IndexedDB store · `lab/lab-ui.js` — player and Add-a-game dialogs · `lab/lab.css`
- `games.js` — catalog data · `tools/` — catalog builders · `tests/`

## Hosting

The repository is public at <https://github.com/Mbottega16/Zylith>. GitHub Pages serves the `main` branch root at <https://mbottega16.github.io/Zylith/>. A push to `main` updates the live site.

GitHub imports use two public APIs from the browser: `api.github.com` (repo details) and jsDelivr (file list and files). Repos over about 50 MB cannot be fetched that way. Download the ZIP and upload it instead.

## Rights

Zylith links to creator-hosted pages and never mirrors game files. Linked games keep their own licenses. A listing is not an endorsement or a rights check. Unofficial ports of commercial games are not listed. Nothing in the catalog needs a game you own.
