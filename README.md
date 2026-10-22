# Zylith

A responsive discovery hub for browser-playable indie games and unusual internet finds. Zylith is a **directory**: listings link to creator-hosted pages and do not bundle or mirror game files.

## Run locally

- **Mac:** double-click `run.command` (first time, Control-click → Open if macOS asks), or run `python3 -m http.server 4173` from this folder and open <http://localhost:4173>.
- **Windows:** double-click `run.bat` (requires Python 3), or run `py -m http.server 4173` from this folder and open <http://localhost:4173>.

No package install or build step is needed. Google Fonts are an optional external enhancement; the app falls back to system fonts offline.

## Current features

- Responsive arcade-style landing page with custom CSS artwork.
- Search by title, creator, genre, mood, and description; genre/mood filters; sorting; grid/list view.
- Favorites and community-submitted listings saved in the current browser's local storage.
- Game detail dialog and external creator-page launch in a new tab.
- Keyboard shortcut `⌘K` / `Ctrl+K` to focus search; reduced-motion support.
- Starter directory entries are links to creator-hosted pages. Confirm current link, browser-playability, source attribution, and any display/reuse permissions before treating a listing as approved.

## Important MVP limitations

- “Submit a game” stores it only in the current browser. There is no shared database, moderation inbox, accounts, or cross-device sync yet.
- This build does not crawl or download games. Discovery ingestion should use creator-provided APIs/feeds or a reviewed submission queue, and should store links/metadata only unless distribution rights are explicit.
- Static hosting can serve the directory, but cannot provide shared submissions without adding a backend.

## Deploy

The app is static and can be hosted by GitHub Pages, Cloudflare Pages, or another static host. GitHub Pages deployment should only be enabled after deciding the repository/site visibility and confirming the public listing content. For a quick private local run on another computer, clone the repository and use the included launcher.

## Files

- `index.html` — structure and dialogs
- `styles.css` — responsive design and art direction
- `games.js` — starter game listings
- `app.js` — filters, favorites, dialogs, and local submission workflow

## GitHub Pages

`.github/workflows/pages.yml` deploys the static app from the private `main` branch. The GitHub Pages site setting must be enabled for this repository/account; if the account plan does not permit Pages from private repositories, keep the repository private and use a host that can deploy from private source rather than changing repository visibility.
