import assert from 'node:assert/strict';
import test from 'node:test';
import { deploy, rollback, servingRevision } from '../deployment.mjs';

const digest = `sha256:${'a'.repeat(64)}`;
const image = `patrolregistry.azurecr.io/patroller-audit@${digest}`;
const oldImage = `patrolregistry.azurecr.io/patroller-audit@sha256:${'b'.repeat(64)}`;
const env = {
  AZURE_RESOURCE_GROUP: 'patrol-test', NAME_PREFIX: 'patrolapp', ACR_NAME: 'patrolregistry',
  ACR_LOGIN_SERVER: 'patrolregistry.azurecr.io', FIREBASE_PROJECT_ID: 'patroller-audit-test',
  RING: 'test', SOURCE_REF: 'refs/heads/main', IMAGE_DIGEST: digest, REVISION_SUFFIX: 'r123-1',
};

function model({ exists = true, predecessorImage = image } = {}) {
  const old = 'patrolapp-test--old';
  const candidate = 'patrolapp-test--r123-1';
  const revisions = new Map([[old, { image: oldImage, active: true }]]);
  let serving = old;
  const calls = [];
  function app(name = 'patrolapp-test') {
    return { name, properties: {
      latestReadyRevisionName: name === 'patrolapp-test' ? serving : `${name}--ready`,
      latestRevisionName: `${name}--pending`,
      configuration: { ingress: { fqdn: 'app.example.com', traffic: [{ latestRevision: true, weight: 100 }] } },
    } };
  }
  function run(args) {
    calls.push(args);
    const command = args.slice(0, 3).join(' ');
    const argument = name => args[args.indexOf(name) + 1];
    if (command === 'acr repository show') return { digest };
    if (command === 'containerapp list --resource-group') return exists ? [{ name: 'patrolapp-test' }] : [];
    if (command === 'containerapp show --resource-group') return app(argument('--name'));
    if (command === 'containerapp revision show') {
      const name = argument('--revision');
      const value = revisions.get(name) ?? { image: predecessorImage, active: true };
      return { name, properties: { active: value.active, healthState: 'Healthy', template: { containers: [{ image: value.image }] } } };
    }
    if (command === 'deployment group create') {
      revisions.set(candidate, { image, active: true });
      serving = candidate;
      return { properties: { outputs: { baseUrl: { value: 'https://app.example.com' } } } };
    }
    if (command === 'containerapp ingress traffic') { serving = argument('--revision-weight').split('=')[0]; return null; }
    if (command === 'containerapp revision activate') { revisions.get(argument('--revision')).active = true; return null; }
    if (command === 'containerapp revision deactivate') { revisions.get(argument('--revision')).active = false; return null; }
    if (command === 'containerapp revision list') return [...revisions].map(([name, value]) => ({ name, properties: { active: value.active } }));
    throw new Error(`Unexpected command: ${args.join(' ')}`);
  }
  return { run, app, calls, revisions, old, candidate, current: () => serving };
}

const options = run => ({ run, save: async () => {}, sleep: async () => {}, check: async () => {} });

test('serving revision resolves latest-ready, not an unready latest deployment', () => {
  const azure = model();
  const current = servingRevision(azure.app(), revision =>
    azure.run(['containerapp', 'revision', 'show', '--name', 'patrolapp-test', '--revision', revision]));
  assert.equal(current.name, azure.old);
  assert.equal(current.image, oldImage);
  const split = azure.app();
  split.properties.configuration.ingress.traffic = [{ revisionName: 'one', weight: 50 }, { revisionName: 'two', weight: 50 }];
  assert.throws(() => servingRevision(split, () => {}));
});

test('promotion refuses a preceding ring serving a different digest before changing Azure', async () => {
  const azure = model({ predecessorImage: oldImage });
  await assert.rejects(deploy({ ...env, RING: 'staging' }, options(azure.run)), /preceding ring/);
  assert.equal(azure.calls.some(args => args[0] === 'deployment'), false);
});

test('a successful deployment gates the candidate before deactivating the old revision', async () => {
  const azure = model();
  let checked = false;
  const result = await deploy(env, { ...options(azure.run), check: async () => {
    assert.equal(azure.revisions.get(azure.old).active, true);
    checked = true;
  } });
  assert.equal(checked, true);
  assert.equal(result.revision, azure.candidate);
  assert.equal(azure.revisions.get(azure.old).active, false);
});

test('a failed candidate smoke gate restores the old traffic and deactivates only the candidate', async () => {
  const azure = model();
  await assert.rejects(deploy(env, { ...options(azure.run), check: async () => {
    if (azure.current() === azure.candidate) throw new Error('Candidate asset is missing.');
  } }), /previous healthy revision was restored/);
  assert.equal(azure.current(), azure.old);
  assert.equal(azure.revisions.get(azure.old).active, true);
  assert.equal(azure.revisions.get(azure.candidate).active, false);
});

test('failed first deployments never invent a previous revision to restore', async () => {
  const azure = model({ exists: false });
  await assert.rejects(deploy(env, { ...options(azure.run), check: async () => { throw new Error('Not ready.'); } }), /no previous revision/);
  assert.equal(azure.calls.some(args => args.slice(0, 3).join(' ') === 'containerapp ingress traffic'), false);
});

test('Azure deployment failures use the snapshot even when no candidate revision was created', async () => {
  const azure = model();
  const run = args => {
    if (args.slice(0, 3).join(' ') === 'deployment group create') throw new Error('ARM deployment failed.');
    return azure.run(args);
  };
  await assert.rejects(deploy(env, options(run)), /previous healthy revision was restored/);
  assert.equal(azure.current(), azure.old);
  assert.equal(azure.revisions.has(azure.candidate), false);
});

test('manual rollback rejects a revision from another app without changing traffic', async () => {
  const azure = model();
  await assert.rejects(rollback({ ...env, TARGET_REVISION: 'another-app--old', ROLLBACK_REASON: 'Operator recovery' }, options(azure.run)));
  assert.equal(azure.calls.length, 0);
});

test('manual rollback bypasses predecessor promotion but verifies the retained image', async () => {
  const azure = model();
  await deploy(env, options(azure.run));
  const result = await rollback({ ...env, TARGET_REVISION: azure.old, ROLLBACK_REASON: 'Operator recovery' }, options(azure.run));
  assert.equal(result.revision, azure.old);
  assert.equal(azure.current(), azure.old);
  assert.equal(azure.revisions.get(azure.candidate).active, false);
});

test('failed manual rollback gates restore original traffic and target activation state', async () => {
  const azure = model();
  await deploy(env, options(azure.run));
  await assert.rejects(rollback({ ...env, TARGET_REVISION: azure.old, ROLLBACK_REASON: 'Operator recovery' }, {
    ...options(azure.run),
    check: async () => { if (azure.current() === azure.old) throw new Error('Restored app asset is missing.'); },
  }), /original traffic was restored/);
  assert.equal(azure.current(), azure.candidate);
  assert.equal(azure.revisions.get(azure.candidate).active, true);
  assert.equal(azure.revisions.get(azure.old).active, false);
});
