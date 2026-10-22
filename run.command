#!/bin/sh
cd "$(dirname "$0")"
printf '\nZylith is running at http://localhost:4173\nPress Ctrl+C in this window to stop it.\n\n'
open 'http://localhost:4173' 2>/dev/null || true
python3 -m http.server 4173
