const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { Strategy } = require('passport-local');
const { createApp, User } = require('../app');
const errors = require('passport-local-mongoose').errors;

async function fixture(t, overrides = {}) {
  const user = { id: '507f1f77bcf86cd799439011', _id: '507f1f77bcf86cd799439011', username: 'Test User', series: [], movies: [] };
  const updates = [];
  const model = {
    createStrategy: () => new Strategy((name, password, done) => done(null, name === 'test' && password === 'password' ? user : false)),
    findById: async () => user,
    find: async () => [user],
    register: async () => user,
    updateOne: async (...args) => { updates.push(args); },
    ...overrides,
  };
  const lookups = [];
  const app = createApp({ userModel: model, env: { SESSION_SECRET: 'test-only-secret', OMDB_API_KEY: 'test-key' },
    fetchImpl: async url => { lookups.push(url); return { ok: true, json: async () => ({ Response: 'True', Type: url.searchParams.get('t') === 'A & B' ? 'movie' : 'series', Title: url.searchParams.get('t') }) }; }
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  let cookie = '';
  const request = async (route, data) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${route}`, {
      method: data ? 'POST' : 'GET', redirect: 'manual',
      headers: { ...(cookie ? { cookie } : {}), ...(data ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      ...(data ? { body: new URLSearchParams(data) } : {}),
    });
    if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
    return res;
  };
  return { request, updates, lookups };
}
test('public pages render with EJS, nested lists load assets, and missing IDs return 404', async t => {
  const { request } = await fixture(t);
  for (const route of ['/', '/login', '/register', '/lists', '/lists/507f1f77bcf86cd799439011', '/css/styles.css']) {
    const res = await request(route);
    assert.equal(res.status, 200, `${route}: ${await res.text()}`);
  }
  assert.equal((await request('/lists/invalid')).status, 404);
  assert.equal((await request('/auth/google')).status, 503);
});
test('login, session deserialization, encoded movie and series submissions, and logout', async t => {
  const { request, updates, lookups } = await fixture(t);
  for (const route of ['/submit', '/submit/movie', '/submit/tv_series']) {
    const res = await request(route, route === '/submit' ? undefined : { movie_name: 'test' });
    assert.equal(res.headers.get('location'), '/login');
  }
  assert.equal((await request('/login', { username: 'test', password: 'wrong' })).headers.get('location'), '/login');
  assert.equal((await request('/login', { username: 'test', password: 'password' })).headers.get('location'), '/lists');
  assert.equal((await request('/submit')).status, 200);
  assert.equal((await request('/submit/movie', { movie_name: 'A & B' })).headers.get('location'), '/submit');
  assert.equal((await request('/submit/tv_series', { series_name: 'Example' })).status, 302);
  assert.equal(lookups[0].searchParams.get('t'), 'A & B');
  assert.equal(updates[0][1].$push.movies.Title, 'A & B');
  assert.equal(updates[1][1].$push.series.Title, 'Example');
  assert.equal((await request('/logout')).headers.get('location'), '/');
  assert.equal((await request('/submit')).headers.get('location'), '/login');
});
test('registration uses promise API and handles duplicate usernames', async t => {
  const { request } = await fixture(t);
  assert.equal((await request('/register', { username: 'test', password: 'password' })).headers.get('location'), '/submit');
  const duplicate = await fixture(t, { register: async () => { throw new errors.UserExistsError(); } });
  assert.equal((await duplicate.request('/register', { username: 'test', password: 'password' })).headers.get('location'), '/register');
});
test('missing users and rejected database queries complete with an error response', async t => {
  const missing = await fixture(t, { findById: async () => null });
  assert.equal((await missing.request('/lists/507f1f77bcf86cd799439011')).status, 404);
  const failed = await fixture(t, { find: async () => { throw new Error('Database unavailable'); } });
  assert.equal((await failed.request('/lists')).status, 500);
});
test('current password plugin hashes, authenticates, and validates without legacy callbacks', async () => {
  const user = new User({ username: 'test' });
  await user.setPassword('password');
  await user.validate();
  assert.ok((await user.authenticate('password')).user);
  assert.equal((await user.authenticate('wrong')).user, false);
});
