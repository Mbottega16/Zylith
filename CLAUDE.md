# Zylith — repo instructions

## Purpose
A static browser-game discovery hub. It points visitors to creator-hosted games; it does not mirror/download game builds or copyrighted assets.

## Architecture
Vanilla HTML/CSS/JavaScript. No build system or runtime dependencies. `games.js` is the seed catalog; `app.js` owns browser-local search, sorting, favorites, and community submission; `styles.css` owns responsive UI. `run.command` and `run.bat` launch Python's static server.

## Rules
- Treat all game listings as unverified until the creator/page, URL, playability, and permissions have been checked.
- Do not add ROMs, binaries, extracted assets, or scraped game bodies. Use creator-authorized links and concise factual metadata.
- User submissions remain local-only unless a reviewed backend and moderation workflow are deliberately implemented.
- Do not publish or enable public hosting without user approval.
- Keep the app dependency-free unless there's a clear reason to add a package.

## Verification
Run `python3 -m http.server 4173` in this directory and check the app at `http://localhost:4173`; verify search, filters, favorites, details, and local submission. Static smoke check: `python3 -m http.server 4173` must serve `index.html`, `styles.css`, `games.js`, and `app.js`.

## Never Read / Noise Zones
No vendored game files, game archives, ROMs, or downloaded content belong in this repo. Ignore `.DS_Store`, `__pycache__/`, and local screenshots.

## Session Handoff (Last Worked On · Current State · Next Up)
- 2026-10-22: Static MVP pushed to private `Mbottega16/Zylith` on `main`. Anonymous Vercel preview: `https://rapid-emerald-a7uwg1m.tmp.now` (expires after 60 minutes). Verified page and assets return HTTP 200. GitHub Pages could not be enabled because the current plan does not allow Pages from private repos. Next: connect an authorized hosting account/project for a permanent URL, verify and expand listings, then consider a moderated shared catalog. Local submissions remain browser-only.
