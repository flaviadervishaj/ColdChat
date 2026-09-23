import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('every client-side ID selector exists in the app shell', async () => {
  const [html, script] = await Promise.all([
    readFile(new URL('index.html', root), 'utf8'),
    readFile(new URL('app.js', root), 'utf8'),
  ]);
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  const selectors = [...script.matchAll(/\$\('#([^']+)'\)/g)].map(match => match[1]);
  const missing = [...new Set(selectors.filter(selector => !ids.has(selector)))];
  assert.deepEqual(missing, []);
});

test('authentication page references local assets', async () => {
  const html = await readFile(new URL('login.html', root), 'utf8');
  assert.match(html, /href="\/styles\.css"/);
  assert.match(html, /src="\/login\.js"/);
  assert.doesNotMatch(html, /(?:src|href)="https?:\/\//);
});

test('application shell has no remote script or stylesheet dependency', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  assert.doesNotMatch(html, /<(?:script|link)[^>]+(?:src|href)="https?:\/\//i);
});

test('Vercel routes specific endpoints before the native wildcard', async () => {
  const config = JSON.parse(await readFile(new URL('vercel.json', root), 'utf8'));
  const sources = config.rewrites.map(route => route.source);
  assert.ok(sources.indexOf('/standalone/auth/google') < sources.indexOf('/standalone/:path*'));
  assert.ok(sources.indexOf('/standalone/reset-chat') < sources.indexOf('/standalone/:path*'));
  assert.equal(config.rewrites.find(route => route.source === '/login').destination, '/login.html');
});
