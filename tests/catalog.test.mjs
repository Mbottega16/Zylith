// Run: node --test tests/
// Guards the checked catalog (games.js): every row has a verdict, a unique id and a well-formed https game path.
// Also checks that the scanner's 18 self-checks (the named tests at the top of scan.test.mjs) all pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CATALOG = fileURLToPath(new URL('../games.js', import.meta.url));
const SCANNER_TESTS = fileURLToPath(new URL('./scan.test.mjs', import.meta.url));
const EXPECTED_ROWS = 74;   // bump on purpose when the shelf grows
const SCANNER_SELF_CHECKS = [
  'plain canvas game passes',
  'DOM clicker game passes',
  'game with assets and cdn library passes',
  'crypto miner is blocked',
  'discord webhook exfil is blocked',
  'ClickFix clipboard command is blocked',
  'executable file is blocked',
  'png that is really a program is blocked',
  'png that is really a script is blocked',
  'path traversal is blocked',
  'eval of decoded string needs review at least',
  'login form page is not a pass',
  'redirect and top navigation are flagged',
  'script from unknown host is flagged',
  'repo without html says it needs a build',
  'empty package is rejected',
  'obfuscated code is flagged medium',
  'entry picks the shallowest index.html',
];

const loadRows = () => {
  const sandbox = { window: {} };
  runInNewContext(readFileSync(CATALOG, 'utf8'), sandbox);
  return sandbox.window.ZYLITH_GAMES;
};

const isGamePath = url => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname !== '' && !/\s/.test(url);
  } catch {
    return false;
  }
};

// Rows only enter the catalog after a browser check, so the verdict must be 'pass'.
function rowProblems(rows) {
  const problems = [];
  const seen = new Set();
  rows.forEach((row, i) => {
    const where = `row ${i} (${row.id ?? 'no id'})`;
    if (row.verdict !== 'pass') problems.push(`${where}: no verdict (got ${JSON.stringify(row.verdict)})`);
    if (typeof row.id !== 'string' || row.id === '') problems.push(`${where}: missing id`);
    else if (seen.has(row.id)) problems.push(`${where}: duplicate id`);
    seen.add(row.id);
    if (!isGamePath(row.url)) problems.push(`${where}: game path is not a well-formed https URL (${JSON.stringify(row.url)})`);
  });
  return problems;
}

test(`catalog has ${EXPECTED_ROWS} rows`, () => {
  assert.equal(loadRows().length, EXPECTED_ROWS);
});

test('every catalog row has a verdict, a unique id and a game path', () => {
  assert.deepEqual(rowProblems(loadRows()), []);
});

test('the row check rejects a row without a verdict', () => {
  const { verdict, ...noVerdict } = loadRows()[0];
  assert.match(rowProblems([noVerdict]).join('\n'), /no verdict/);
});

test('the row check rejects a duplicate id and a non-https game path', () => {
  const [first] = loadRows();
  const problems = rowProblems([first, { ...first, url: 'http://example.com/game' }]).join('\n');
  assert.match(problems, /duplicate id/);
  assert.match(problems, /not a well-formed https URL/);
});

test("scanner's 18 self-checks all pass", () => {
  // Throws if the scanner suite exits non-zero, so a failing check fails this test too.
  // NODE_TEST_CONTEXT is removed so the child runs its tests instead of skipping them as a nested run.
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  const tap = execFileSync(process.execPath, ['--test', '--test-reporter=tap', SCANNER_TESTS], { encoding: 'utf8', env });
  const passed = new Set(tap.split('\n').filter(l => /^ok \d+ - /.test(l)).map(l => l.replace(/^ok \d+ - /, '').replace(/ #.*$/, '')));
  const missing = SCANNER_SELF_CHECKS.filter(name => !passed.has(name));
  assert.deepEqual(missing, []);
});
