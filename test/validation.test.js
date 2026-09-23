import test from 'node:test';
import assert from 'node:assert/strict';
import { isUuid, normalizeMessage, validateModerationMinutes, validateUsername } from '../lib/validation.js';

test('accepts a conventional username', () => {
  assert.equal(validateUsername('Flavia'), null);
});

test('accepts a username followed by emoji', () => {
  assert.equal(validateUsername('Flavia 🌿'), null);
});

test('rejects short and padded usernames', () => {
  assert.match(validateUsername('ab'), /at least 3/);
  assert.match(validateUsername(' Flavia'), /start or end/);
});

test('rejects non-emoji content after a username space', () => {
  assert.match(validateUsername('Flavia Dervishaj'), /emoji only/);
});

test('recognizes valid UUIDs', () => {
  assert.equal(isUuid('b742df2a-bcf2-4ee5-8498-82a6ac7e4f15'), true);
  assert.equal(isUuid('not-a-uuid'), false);
});

test('normalizes, trims and limits messages', () => {
  assert.equal(normalizeMessage('  hello  '), 'hello');
  assert.equal(normalizeMessage('12345', 3), '123');
});

test('validates moderation timeout limits', () => {
  assert.equal(validateModerationMinutes('60'), 60);
  assert.equal(validateModerationMinutes(0), null);
  assert.equal(validateModerationMinutes(43_201), null);
  assert.equal(validateModerationMinutes('1.5'), null);
});
