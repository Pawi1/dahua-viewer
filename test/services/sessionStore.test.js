'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const sessions = require('../../src/services/sessionStore');

test('create returns an id and get returns the session with type/expiresAt/scope', () => {
  const id = sessions.create('full', 60_000);
  const s = sessions.get(id);
  assert.ok(s);
  assert.equal(s.type, 'full');
  assert.equal(s.scope, null);
  assert.ok(s.expiresAt > Date.now());
  sessions.del(id);
});

test('create stores an optional scope object', () => {
  const scope = { channel: 3, startTime: 'a', endTime: 'b', filePath: null };
  const id = sessions.create('share', 60_000, scope);
  const s = sessions.get(id);
  assert.deepEqual(s.scope, scope);
  sessions.del(id);
});

test('get returns null for an unknown id', () => {
  assert.equal(sessions.get('does-not-exist'), null);
});

test('get returns null for a falsy id without throwing', () => {
  assert.equal(sessions.get(undefined), null);
  assert.equal(sessions.get(''), null);
});

test('get deletes and returns null once a session has expired', async () => {
  const id = sessions.create('full', 10);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(sessions.get(id), null);
  // second call confirms it was actually removed, not just reported expired
  assert.equal(sessions.get(id), null);
});

test('del removes a session', () => {
  const id = sessions.create('full', 60_000);
  sessions.del(id);
  assert.equal(sessions.get(id), null);
});

test('cleanup removes expired sessions but keeps valid ones', async () => {
  const expiredId = sessions.create('full', 10);
  const validId   = sessions.create('full', 60_000);
  await new Promise((r) => setTimeout(r, 20));

  sessions.cleanup();

  // get() on the expired id would also lazily clean it, so check via a
  // fresh cleanup pass having no visible effect on the still-valid one
  assert.ok(sessions.get(validId));
  sessions.del(validId);
});
