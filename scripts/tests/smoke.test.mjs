import assert from 'node:assert/strict';
import test from 'node:test';
import { smoke } from '../smoke.mjs';

function requestFor({ readiness = 200, asset = true, unknown = 404 } = {}) {
  return async url => {
    const path = url.pathname;
    if (path === '/') return new Response('<title>Patroller Audit</title><script src="/assets/app.js"></script>');
    if (path === '/assets/app.js') return new Response(asset ? 'Patroller Audit' : '', { status: asset ? 200 : 404 });
    if (path === '/api/health') return new Response('', { status: readiness });
    if (path === '/api/not-a-feature') return new Response('', { status: unknown });
    return new Response('Healthy');
  };
}

test('read-only smoke checks the packaged app and distinguishes unknown API routes', async () => {
  await smoke('https://app.example.com', { request: requestFor() });
  await assert.rejects(smoke('https://app.example.com', { request: requestFor({ unknown: 200 }) }));
});

test('liveness alone cannot pass when storage readiness or packaged JavaScript fails', async () => {
  await assert.rejects(smoke('https://app.example.com', { request: requestFor({ readiness: 503 }) }));
  await assert.rejects(smoke('https://app.example.com', { request: requestFor({ asset: false }) }));
});

test('cloud checks reject plaintext, credentialed, and non-root targets before requests', async () => {
  for (const url of ['http://app.example.com', 'https://user:password@app.example.com', 'https://app.example.com/path']) {
    await assert.rejects(smoke(url, { request: () => { throw new Error('Must not send a request.'); } }));
  }
});
