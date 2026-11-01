// Run: node --test tests/
// Guards the reverse-include list parser (tools/reverse-list.mjs) that decides which reverse-engineered repos enter the catalog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseList } from '../tools/reverse-list.mjs';

const LIST = fileURLToPath(new URL('../tools/reverse-include.txt', import.meta.url));

test('blank lines and whitespace-only lines are skipped', () => {
  assert.deepEqual([...parseList('\n\na/b\n   \n\t\nc/d\n\n')], ['a/b', 'c/d']);
});

test('whole-line comments are skipped, indented ones too', () => {
  assert.deepEqual([...parseList('# top comment\na/b\n   # indented comment\n\t#tab comment\nc/d')], ['a/b', 'c/d']);
});

test('leading and trailing spaces and tabs are trimmed', () => {
  assert.deepEqual([...parseList('   a/b   \n\tc/d\t\n  e/f')], ['a/b', 'c/d', 'e/f']);
});

test('CRLF line endings parse the same as LF', () => {
  assert.deepEqual([...parseList('# hand list\r\n\r\na/b\r\n  c/d  \r\n')], ['a/b', 'c/d']);
});

test('duplicate entries collapse to one', () => {
  assert.deepEqual([...parseList('a/b\na/b\n  a/b  \n')], ['a/b']);
});

test('names are lowercased so case variants are duplicates', () => {
  assert.deepEqual([...parseList('Owner/Repo\nowner/repo\nOWNER/REPO')], ['owner/repo']);
});

test('a trailing "#" comment on a name line is dropped, not kept in the name', () => {
  assert.deepEqual([...parseList('foo/bar   # trailing note\nbaz/qux#no-space')], ['foo/bar', 'baz/qux']);
});

test('a byte-order mark at the start of the file does not change the first name', () => {
  assert.deepEqual([...parseList('﻿a/b\nc/d')], ['a/b', 'c/d']);
});

test('empty input gives an empty list', () => {
  assert.equal(parseList('').size, 0);
  assert.equal(parseList('# only comments\n\n').size, 0);
});

test('the shipped reverse-include.txt parses to its listed repos', () => {
  const names = [...parseList(readFileSync(LIST, 'utf8'))];
  assert.ok(names.length > 0, 'the list is not empty');
  assert.equal(new Set(names).size, names.length);
  for (const name of names) assert.match(name, /^[^\s/#]+\/[^\s/#]+$/, `"${name}" is owner/repo`);
});
