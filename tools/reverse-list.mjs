// Parse tools/reverse-include.txt: one "owner/repo" per line.
// Blank lines and "#" comments (whole-line or trailing) are skipped; names are trimmed and lowercased; duplicates collapse.
// GitHub names cannot contain "#", so cutting at the first "#" is safe.
export function parseList(text) {
  return new Set(text.split(/\r?\n/).map(l => l.replace(/#.*$/, '').trim().toLowerCase()).filter(Boolean));
}
