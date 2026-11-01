# Add a game: scan, sandbox test, verdict

This page describes what Zylith does with a game you add, step by step. Each step names the code that does it, so you can check the claims against the source.

The flow lives in `lab/lab-ui.js` (the Add dialog and the report), with the work done by `lab/pack.js` (loading), `lab/scan.js` (static scan), and `lab/frame.js` (sandbox test and judge).

## 1. Fetch

`lab/pack.js` reads the package from a GitHub link, a `.zip`, a single `.html` file, or a folder. Zylith rejects a package before scanning when it is too big:

- 300 MB unpacked (`LIMITS.totalBytes`)
- 4,000 files (`LIMITS.files`)
- 80 MB per file (`LIMITS.fileBytes`)

`lab/zip.js` reads the zip index first and stops as soon as the unpacked size passes the limit, so a zip bomb cannot fill memory.

A repo with no HTML page gets no scan and no test. Zylith shows *Not a runnable web game* (see the verdict table below).

## 2. Static scan

`lab/scan.js` reads every file as data. It never runs the code. The scan has five parts.

**Size and path checks.** Too many files, a package over 300 MB, a file over 80 MB, or a path that leaves the package (`..`, a leading `/`, or a drive letter). Each of these is critical.

**File types.**

- Programs, installers, and shell scripts (`.exe`, `.dll`, `.msi`, `.apk`, `.dmg`, `.sh`, and similar) are critical.
- Server code and archives (`.php`, `.py`, `.zip`, and similar) are medium.
- A file whose content is a program or script under a media name is critical. Examples: an MZ, ELF, or Mach-O header, a `#!` line, or a `.png` that starts with `<script>`.
- Unfamiliar types are low, or medium when there are more than ten.

**Entry page.** The entry is the shallowest `index.html`, or else the shallowest other `.html` file. If there is none, the scan rejects the package. If the repo has a `package.json` with a `build` script, the message says it needs `npm run build`.

**Dangerous code.** Each of the 31 rules in `RULES` searches the text of the page and its scripts. The rules cover:

| Severity | What it finds |
|---|---|
| Critical | Crypto miners; chat-webhook data theft and IP loggers; operating-system shell commands; the "paste this into a terminal" clipboard trick |
| High | Extension installs; decode-then-run code; redirects and top-page navigation; password, card, and seed-phrase fields or wording; scare text; hidden frames; executable downloads; clipboard reads; loading code from outside hosts |
| Medium | Packed or obfuscated code; reaching the page that holds it; cookies; `sendBeacon`; WebSockets to outside servers; embedded outside pages; camera, microphone, location, or device access; service workers; tab traps |
| Low | Pop-ups; device fingerprinting; file downloads; a page's own security policy |

A rule that matches is counted once, with its count and a short sample of the text. Outside hosts that are not on the library list (`CDN_HOSTS`) are reported as one finding. The sandbox also blocks them.

**Game signals.** Zylith looks for graphics (canvas, WebGL, or a known engine), a loop or timers, key, mouse, or touch input, sound, a known engine name, and game words (score, level, lives, and so on). The game verdict needs one of these combinations:

- graphics and input, or
- input, a loop, and at least two game words, or
- a known engine and input.

Otherwise the package does not look like a game.

### The scanner's pass rule

The scan's verdict is set in `scan()` in this order. The first match wins.

Points: high = 5, medium = 3, low = 1. Critical findings do not add points; they block at once.

| Order | Condition | Scan verdict |
|---|---|---|
| 1 | Any critical finding | `block` |
| 2 | No entry page | `reject` |
| 3 | Points ≥ 8 | `review` (several risky behaviors) |
| 4 | Does not look like a game | `review` |
| 5 | Points ≥ 4 | `review` |
| 6 | Otherwise | `pass` |

So `pass` needs all of these: no critical finding, an entry page, points below 4, and a look of a game. The test suite checks this in `tests/scan.test.mjs`. Run `node tests/scan.test.mjs` from the repo root; it must print `fail 0`. At the time of writing it reports 67 tests, all passing.

## 3. Sandbox test

The scan is skipped if the verdict is `block` or `reject`. Otherwise `lab/lab-ui.js` mounts the game with `Frame.mount()` in `lab/frame.js`.

- **The locked box.** `sandbox="allow-scripts allow-pointer-lock"`, with no `allow-same-origin`. The page's Content-Security-Policy (`csp()`) allows only `blob:` URLs and the short CDN list. Every other request is blocked and logged.
- **The probe.** Inside the frame, `loader()` counts canvas draws, animation frames, timers, page changes, input listeners, audio, errors, distinct canvas snapshots, and blocked requests. It refuses and logs pop-ups, dialogs, WebSockets, WebRTC, `sendBeacon`, clipboard, camera and microphone, and downloads. It also tries to stop the game leaving its frame.
- **The run.** The game runs for 9 seconds (`TEST_MS`). Zylith sends key presses and a click at about 1.6 s and 4.2 s, because many games wait for input. The probe reports every 0.7 s, so the report updates while the test runs. The player can open the game in the preview during the test.
- **The judge.** `judge()` in `lab/frame.js` turns the last probe into one of four results:

| Result | Rule |
|---|---|
| `escape` | The game left the page or opened a pop-up |
| `game` | All four core checks pass: it loads without a fatal error, draws something (20 or more canvas draw calls, 20 or more page changes, or a non-blank canvas), runs a loop (30 animation frames or 8 timer calls), and listens for key, mouse, or touch input |
| `maybe` | Draws, and runs a loop or listens for input, but not all four core checks passed |
| `notgame` | Anything else |

The picture-change check (2 or more distinct canvas snapshots, or 30 or more page changes) is shown in the report but is not one of the four core checks.

The judge also counts blocked attempts: requests, clipboard calls, camera or microphone calls, and downloads. Any of them makes the verdict at least *Caution*, even when the scan passed.

## 4. Verdict

`decide()` in `lab/lab-ui.js` combines the scan verdict and the sandbox result. These are the outcomes a player sees, checked in order:

| Outcome (heading shown) | When | Can add? |
|---|---|---|
| **Blocked: dangerous content** | Scan verdict `block` | No |
| **Not a runnable web game** | Scan verdict `reject`: no HTML page, source that needs a build, native source (C, C++, Rust, and so on), or an empty package | No |
| **Unsafe: it tried to escape its box** | Sandbox result `escape` | No |
| **It does not behave like a game** | Sandbox result `notgame` | No |
| **Caution: check the notes first** | Scan verdict `review`, or sandbox result `maybe`, or any blocked attempt | Yes, after the box "I read the notes and want to keep it" is ticked |
| **Looks like a game, and it behaves** | None of the above | Yes |

While the test runs, the heading is *Testing in the sandbox...* and the add button is off.

The game runs in the locked box in every case. A *Caution* game does not run outside it.

## Verdict reference

Every verdict string the Add flow can return, with what triggers it and what to do next. The strings are copied from the code, so search for them to find the source.

### Scan verdict (`scan.verdict`, set in `lab/scan.js`)

| Verdict | Trigger | Next step: player | Next step: maintainer |
|---|---|---|---|
| `block` | Any critical finding (a program or script file, a path that leaves the package, a crypto miner, a data-theft webhook, a shell command, a "paste into a terminal" trick, a size limit hit) | Cannot add. Nothing runs. Fix or remove the flagged files and add again. | Read the findings list (file and rule). Do not add an override. |
| `reject` | No entry page, or the package is native source, needs a build, or is empty | Cannot add. If the repo links a hosted page, open it (the dialog shows a button). Otherwise upload the built folder that holds `index.html`. | Same as the player. Native-source projects are not browser games; skip them. |
| `review` | Points ≥ 4 (or ≥ 8), or the code does not look like a game. Points: high = 5, medium = 3, low = 1 | Test runs. Read the notes, play the preview, then tick "I read the notes and want to keep it" to add. | Treat as a judgment call on the notes. It stays in the locked box. |
| `pass` | No critical finding, an entry page, points under 4, and a look of a game | Test still runs. Add is enabled once the sandbox test finishes. | None unless the test later fails. |

### Scan headlines (`scan.headline`)

Shown in the report and, on replay, when a saved game is blocked or rejected.

| Headline | Verdict |
|---|---|
| `Blocked: contains dangerous content.` | `block` |
| `Not a runnable web game.` | `reject` (also used when the package has no files) |
| `High caution: several risky behaviors.` | `review` (points ≥ 8) |
| `Does not look like a game from its code. Run the sandbox test.` | `review` (no game signals) |
| `Looks like a game, with some behaviors to check.` | `review` (points ≥ 4) |
| `Looks like a game. No dangerous code found.` | `pass` |

### Sandbox result (`judged.result`, set in `judge()` in `lab/frame.js`)

| Result | Trigger | Next step: player | Next step: maintainer |
|---|---|---|---|
| `escape` | The game tried to leave the page or open a pop-up | Cannot add. The game was stopped and Zylith will not keep it. | Check the probe log. Treat as unsafe. |
| `game` | All four core checks pass: it loads without a fatal error, draws, runs a loop, and reads input | Can add (unless the scan says `review` or a blocked attempt happened). | None. |
| `maybe` | It draws, and runs a loop or reads input, but not all four core checks passed | Caution path: read the notes, tick the box, then add. | Check which core check failed. |
| `notgame` | Anything else | Cannot add. If it really is a game, fix the package (a missing build or missing files) and press "Test again". | Same as the player. |

A blocked attempt (a request, clipboard call, camera or microphone call, or download) makes the outcome at least Caution, even when the sandbox result is `game`.

### Final outcome (report heading, from `decide()` in `lab/lab-ui.js`)

| Heading | Shown when | Can add? | Next step |
|---|---|---|---|
| `Testing in the sandbox...` | The test has not finished, or has not started | No | Wait, or play the preview. |
| `Blocked: dangerous content` | Scan `block` | No | See `block` above. |
| `Not a runnable web game` | Scan `reject` | No | See `reject` above. |
| `Unsafe: it tried to escape its box` | Sandbox `escape` | No | See `escape` above. |
| `It does not behave like a game` | Sandbox `notgame` | No | See `notgame` above. |
| `Caution: check the notes first` | Scan `review`, sandbox `maybe`, or a blocked attempt | Yes, after the box is ticked | Read the notes, then add or leave it. |
| `Looks like a game, and it behaves` | None of the above | Yes | Add. |

The step list reads `3 · Sandbox test skipped` when the scan blocks or rejects the package. Its `fail` mark is not a verdict.

### Play-time messages (not verdicts)

These appear when a saved game is opened. They do not change the saved game.

- `Zylith will not run this game.` (`lab/lab-ui.js` `playLocal`): the rescan returned `block` or `reject`.
- `The game tried to leave or reload itself.` followed by `Zylith stopped it.` and a Restart button: the game navigated away while it ran.

## Limits

- The scan reads text and headers. It cannot read packed or obfuscated code, and it does not follow every link a game builds at run time.
- The test is a short run. Passing it does not prove a game is safe, which is why every added game always runs in the locked box.
- Games that need IndexedDB, cookies, service workers, or a server will not run in the box. See the README's *Known limits*.
