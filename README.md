# Zylith

A responsive discovery hub for browser-playable indie games and unusual internet finds. Zylith is a **directory**: listings link to creator-hosted pages and do not bundle or mirror game files.

## Run locally

- **Mac:** double-click `run.command` (first time, Control-click → Open if macOS asks), or run `python3 -m http.server 4173` from this folder and open <http://localhost:4173>.
- **Windows:** double-click `run.bat` (requires Python 3), or run `py -m http.server 4173` from this folder and open <http://localhost:4173>.

No package install or build step is needed. Google Fonts are an optional external enhancement; the app falls back to system fonts offline.

To get it onto another Windows desktop, open PowerShell and run:

```powershell
git clone https://github.com/Mbottega16/Zylith.git "$HOME\OneDrive\Desktop\Zylith"
cd "$HOME\OneDrive\Desktop\Zylith"
./run.bat
```

The repository is private, so sign in to GitHub in Git Credential Manager when prompted. The app opens at `http://localhost:4173` on that computer.

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

## Files

- `index.html` — structure and dialogs
- `styles.css` — responsive design and art direction
- `games.js` — starter game listings
- `app.js` — filters, favorites, dialogs, and local submission workflow

## Hosting status

The source repository is private at `https://github.com/Mbottega16/Zylith`. This GitHub account plan does not permit GitHub Pages for a private repository, and we are keeping the source private. The anonymous Vercel preview is temporary and expires after 60 minutes; it is only a first live look. A persistent public URL needs a logged-in hosting account/project.
