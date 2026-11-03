import { pathToFileURL } from 'node:url';

export async function smoke(baseUrl, { request = fetch, allowLocal = false } = {}) {
  const base = new URL(baseUrl);
  const deadline = AbortSignal.timeout(45000);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if ((base.protocol !== 'https:' && !(allowLocal && local && base.protocol === 'http:')) ||
      (!allowLocal && local) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('Cloud smoke checks require a root HTTPS URL without credentials.');
  }

  async function read(path, expected = 200) {
    const response = await request(new URL(path, base), {
      redirect: 'error', signal: AbortSignal.any([deadline, AbortSignal.timeout(15000)]),
    });
    if (response.status !== expected) throw new Error(`${path} returned ${response.status}, expected ${expected}.`);
    return response;
  }

  await read('/health');
  await read('/api/health');
  const html = await (await read('/')).text();
  const brand = /<title>(PatrolNotes|Patroller Audit)<\/title>/.exec(html)?.[1];
  if (!brand) throw new Error('Application shell is missing.');
  const asset = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
  if (!asset) throw new Error('Packaged application JavaScript is missing.');
  const javascript = await (await read(asset)).text();
  if (!javascript.includes(brand)) throw new Error('Packaged application JavaScript is missing.');
  await read('/api/not-a-feature', 404);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await smoke(process.env.BASE_URL);
    console.log('Read-only application and Cosmos readiness checks passed.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
