/**
 * Tests for the P0 reverence pre-filter. Run with:
 *   node --import tsx --test packages/shared/src/reverenceFilter.test.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { closeScope } from './flowEngine.js';
import { detectClosedDoor, normalizeForReverence } from './reverenceFilter.js';
import { initialStateSnapshot } from './sethScaffold.js';

test('intercepts explicit closed-door phrases', () => {
  const utterances = [
    "I'd rather not talk about that.",
    'Please stop asking about my father.',
    "I don't want to answer that question.",
    "Can we not talk about the war?",
    "That's private.",
    "Let's move on, please.",
    'Honestly, I would prefer not to get into it.',
  ];
  for (const u of utterances) {
    const hit = detectClosedDoor(u);
    assert.ok(hit, `expected a closed-door match for: ${u}`);
    assert.ok(hit!.phrase.length > 0);
  }
});

test('matches despite STT dropping the apostrophe', () => {
  // Common STT rendering of "I'd rather not".
  assert.ok(detectClosedDoor('id rather not'), 'should match apostrophe-stripped form');
});

test('does not fire on benign reminiscence', () => {
  const benign = [
    'I want to talk about my grandmother for a while.',
    'My father taught me to fish on that lake.',
    "Let's start with my childhood home.",
    'That was a private school, actually.',
  ];
  for (const u of benign) {
    assert.equal(detectClosedDoor(u), null, `should NOT close on: ${u}`);
  }
});

test('normalization lowercases and strips punctuation but keeps apostrophes', () => {
  assert.equal(normalizeForReverence("I'd RATHER not!!"), "i'd rather not");
});

test('a closed scope is recorded once and never removed', () => {
  let snap = initialStateSnapshot();
  snap = closeScope(snap, 'stop talking about');
  snap = closeScope(snap, 'stop talking about'); // idempotent
  assert.equal(snap.closedScopes.length, 1);
  assert.equal(snap.closedScopes[0]!.phrase, 'stop talking about');
});
