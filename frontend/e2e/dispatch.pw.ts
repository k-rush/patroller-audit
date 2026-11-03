import { randomUUID } from 'node:crypto';
import { test, expect, type APIRequestContext } from '@playwright/test';

const authUrl = process.env.AUTH_EMULATOR_URL ?? 'http://127.0.0.1:29099';
const projectId = 'demo-patroller-audit-local';
const accounts: string[] = [];

async function dispatcher(request: APIRequestContext, claims: Record<string, unknown> = {
  dispatcher: true, resortId: 'summit-west',
}) {
  // Never run identity fixtures against a cloud project or non-loopback emulator.
  const url = new URL(authUrl);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname))
    throw new Error('Acceptance requires a loopback Firebase emulator.');
  const email = `fictional-dispatch-${randomUUID()}@example.test`;
  const password = randomUUID();
  const created = await request.post(`${authUrl}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local-emulator`, {
    data: { email, password, returnSecureToken: true },
  });
  expect(created.ok()).toBeTruthy();
  const { localId } = await created.json();
  accounts.push(localId);
  const update = await request.post(`${authUrl}/identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`, {
    headers: { Authorization: 'Bearer owner' },
    data: { localId, customAttributes: JSON.stringify(claims) },
  });
  expect(update.ok()).toBeTruthy();
  const login = await request.post(`${authUrl}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-emulator`, {
    data: { email, password, returnSecureToken: true },
  });
  expect(login.ok()).toBeTruthy();
  const { idToken } = await login.json();
  return { email, password, headers: { Authorization: `Bearer ${idToken}` } };
}

test.beforeEach(async ({ request }) => {
  const config = await (await request.get('/api/config')).json();
  expect(config.projectId).toBe(projectId);
  expect(config.emulatorUrl).toBe(authUrl);
});

test.afterAll(async ({ request }) => {
  for (const localId of accounts) {
    await request.post(`${authUrl}/identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:delete`, {
      headers: { Authorization: 'Bearer owner' }, data: { localId },
    });
  }
});

test('real Firebase authorization, Cosmos persistence, validation and exact retry identity', async ({ request }) => {
  expect((await request.get('/api/incidents')).status()).toBe(401);
  const denied = await dispatcher(request, { dispatcher: true, resortId: 'another-resort' });
  expect((await request.get('/api/incidents', { headers: denied.headers })).status()).toBe(403);
  const nonDispatcher = await dispatcher(request, { resortId: 'summit-west' });
  expect((await request.post('/api/incidents', { headers: nonDispatcher.headers,
    data: { id: randomUUID(), latitude: 47.42, longitude: -121.42 } })).status()).toBe(403);
  const first = await dispatcher(request);
  const second = await dispatcher(request);
  const id = randomUUID();
  const input = { id, latitude: 47.4206, longitude: -121.4213 };
  const before = Date.now();
  const response = await request.post('/api/incidents', { headers: first.headers,
    data: { ...input, createdAt: '2000-01-01T00:00:00Z', createdBy: 'untrusted', resortId: 'another-resort' } });
  expect(response.status()).toBe(201);
  const saved = await response.json();
  expect(saved.resortId).toBe('summit-west');
  expect(saved.createdBy).not.toBe('untrusted');
  expect(Date.parse(saved.createdAt)).toBeGreaterThanOrEqual(before - 1000);
  expect(Date.parse(saved.createdAt)).toBeLessThanOrEqual(Date.now() + 1000);
  expect(await (await request.post('/api/incidents', { headers: first.headers, data: input })).json()).toEqual(saved);
  expect((await request.post('/api/incidents', { headers: first.headers,
    data: { ...input, latitude: 48 } })).status()).toBe(409);
  expect((await request.post('/api/incidents', { headers: second.headers, data: input })).status()).toBe(409);
  expect((await request.post('/api/incidents', { headers: first.headers,
    data: { ...input, id: randomUUID(), latitude: 91 } })).status()).toBe(400);
  expect(await (await request.get(`/api/incidents/${id}`, { headers: second.headers })).json()).toEqual(saved);
  const list = await (await request.get('/api/incidents', { headers: second.headers })).json();
  expect(list.items).toContainEqual(saved);
});

test('map click, popout, marker reopen, list navigation and reload use real saved incidents', async ({ page, request }, testInfo) => {
  const account = await dispatcher(request);
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create at map center' })).toBeEnabled();
  const map = page.getByLabel('Summit West incident map');
  const point = await map.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    for (let y = 100; y < 350; y += 50)
      for (let x = 80; x < 400; x += 50) {
        const hit = document.elementFromPoint(bounds.left + x, bounds.top + y);
        if (hit && !hit.closest('.leaflet-marker-icon, .leaflet-control')) return { x, y };
      }
    throw new Error('No empty map location is available.');
  });
  const creation = page.waitForResponse(response =>
    response.url().endsWith('/api/incidents') && response.request().method() === 'POST');
  await map.click({ position: point });
  expect((await creation).status()).toBe(201);
  const popout = page.getByRole('dialog');
  await expect(popout).toBeVisible();
  await expect(popout.getByText('Saved to Summit West')).toBeVisible();
  const id = await popout.locator('.incident-id').innerText();
  expect((await (await creation).json()).id).toBe(id);
  await expect(popout).toContainText('Pacific');
  const marker = page.getByTitle(`Incident ${id}`, { exact: true });
  await page.getByRole('button', { name: 'Close incident popout' }).click();
  await expect(popout).not.toBeVisible();
  await marker.click();
  await expect(popout).toContainText(id);
  await page.getByRole('button', { name: /^Incidents / }).click();
  await page.getByRole('button', { name: new RegExp(`Incident ${id.slice(0, 8).toUpperCase()}`) }).click();
  await expect(popout).toContainText(id);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Create at map center' })).toBeEnabled();
  await page.getByTitle(`Incident ${id}`, { exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(id);
  await page.screenshot({ path: testInfo.outputPath('dispatch-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Close incident popout' })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('dispatch-mobile.png'), fullPage: true });
});

test('a lost real save response survives reload and retries without duplicating the incident', async ({ page, request }) => {
  const account = await dispatcher(request);
  let saved: { id: string; createdAt: string } | undefined;
  const bodies: string[] = [];
  await page.route('**/api/incidents', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    bodies.push(route.request().postData()!);
    if (bodies.length === 1) {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      saved = await response.json();
      return route.abort('failed');
    }
    return route.continue();
  });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const create = page.getByRole('button', { name: 'Create at map center' });
  await expect(create).toBeEnabled();
  await create.click();
  await expect(page.getByRole('alert')).toContainText('Save not confirmed');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('earlier save was not confirmed');
  await page.getByRole('button', { name: 'Retry save' }).click();
  await expect(page.getByRole('dialog')).toContainText(saved!.id);
  expect(bodies[1]).toBe(bodies[0]);
  const stored = await (await request.get(`/api/incidents/${saved!.id}`, { headers: account.headers })).json();
  expect(stored.createdAt).toBe(saved!.createdAt);
});
