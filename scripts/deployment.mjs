import { spawnSync } from 'node:child_process';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { validateDeploymentRef, validateDigest } from './release-policy.mjs';
import { smoke } from './smoke.mjs';

export function azure(args) {
  const result = spawnSync('az', [...args, '--output', 'json', '--only-show-errors'], {
    encoding: 'utf8',
    timeout: args[0] === 'deployment' && args[2] === 'create' ? 25 * 60 * 1000 : 60 * 1000,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message ?? result.stderr?.trim() ?? 'Azure command failed.');
  }
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}

export function servingRevision(app, readRevision) {
  const traffic = app.properties.configuration.ingress.traffic;
  const serving = traffic.filter(entry => entry.weight > 0);
  if (serving.length !== 1 || serving[0].weight !== 100) throw new Error('Exactly one revision must serve all traffic.');
  const name = serving[0].latestRevision ? app.properties.latestReadyRevisionName : serving[0].revisionName;
  if (!name) throw new Error('No ready serving revision exists.');
  const revision = readRevision(name);
  if (!revision.properties.active || revision.properties.healthState !== 'Healthy') {
    throw new Error('The serving revision must be active and healthy.');
  }
  return { name, image: revision.properties.template.containers[0].image };
}

function settings(env) {
  for (const key of ['AZURE_RESOURCE_GROUP', 'NAME_PREFIX', 'ACR_NAME', 'ACR_LOGIN_SERVER', 'FIREBASE_PROJECT_ID', 'RING', 'SOURCE_REF']) {
    if (!env[key]) throw new Error(`${key} is required.`);
  }
  if (!/^[a-z][a-z0-9]{2,9}$/.test(env.NAME_PREFIX) ||
      !/^[a-z0-9]{5,50}$/.test(env.ACR_NAME) ||
      env.ACR_LOGIN_SERVER !== `${env.ACR_NAME}.azurecr.io` ||
      !/^[a-z][a-z0-9-]{5,29}$/.test(env.FIREBASE_PROJECT_ID) ||
      env.FIREBASE_PROJECT_ID.startsWith('demo-')) {
    throw new Error('Invalid cloud prefix, registry, or Firebase configuration.');
  }
  validateDeploymentRef(env.RING, env.SOURCE_REF);
  return { appName: `${env.NAME_PREFIX}-${env.RING}`, group: env.AZURE_RESOURCE_GROUP };
}

export async function deploy(env, { run = azure, check = smoke, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), save = saveState } = {}) {
  const { appName, group } = settings(env);
  validateDigest(env.IMAGE_DIGEST);
  if (!/^r\d+-\d+$/.test(env.REVISION_SUFFIX ?? '') || env.REVISION_SUFFIX.length > 24) {
    throw new Error('A bounded workflow revision suffix is required.');
  }
  const expected = `${env.ACR_LOGIN_SERVER}/patroller-audit@${env.IMAGE_DIGEST}`;
  const readApp = name => run(['containerapp', 'show', '--resource-group', group, '--name', name]);
  const readRevision = (name, revision) => run(['containerapp', 'revision', 'show', '--resource-group', group, '--name', name, '--revision', revision]);
  const predecessor = { staging: 'test', production: 'staging' }[env.RING];
  if (predecessor) {
    const previousAppName = `${env.NAME_PREFIX}-${predecessor}`;
    const preceding = readApp(previousAppName);
    if (servingRevision(preceding, revision => readRevision(previousAppName, revision)).image !== expected) {
      throw new Error('The preceding ring must actually serve the identical image digest.');
    }
    await check(`https://${preceding.properties.configuration.ingress.fqdn}`);
  }

  run(['acr', 'repository', 'show', '--name', env.ACR_NAME, '--image', `patroller-audit@${env.IMAGE_DIGEST}`]);
  const apps = run(['containerapp', 'list', '--resource-group', group]);
  const existing = apps.find(app => app.name === appName);
  const previous = existing ? servingRevision(readApp(appName), revision => readRevision(appName, revision)) : null;
  const state = { resourceGroup: group, appName, previous, candidate: `${appName}--${env.REVISION_SUFFIX}`, image: expected };
  await save(state);

  try {
    const result = run(['deployment', 'group', 'create', '--name', `${appName}-${env.REVISION_SUFFIX}`,
      '--resource-group', group, '--template-file', 'infrastructure/app.bicep', '--parameters',
      `namePrefix=${env.NAME_PREFIX}`, `ring=${env.RING}`, `imageDigest=${env.IMAGE_DIGEST}`,
      `firebaseProjectId=${env.FIREBASE_PROJECT_ID}`, `revisionSuffix=${env.REVISION_SUFFIX}`]);
    const baseUrl = result.properties.outputs.baseUrl.value;
    let lastError = new Error('Candidate readiness deadline expired.');
    const deadline = Date.now() + 5 * 60 * 1000;
    for (let attempt = 0; attempt < 30 && Date.now() < deadline; attempt++) {
      try {
        const current = servingRevision(readApp(appName), revision => readRevision(appName, revision));
        if (current.name !== state.candidate || current.image !== expected) throw new Error('Candidate is not yet serving the expected image.');
        await check(baseUrl);
        if (previous && previous.name !== current.name) {
          run(['containerapp', 'revision', 'deactivate', '--resource-group', group, '--name', appName, '--revision', previous.name]);
        }
        return { baseUrl, revision: current.name };
      } catch (error) {
        lastError = error;
        if (attempt < 29) await sleep(10000);
      }
    }
    throw lastError;
  } catch (error) {
    if (!previous) throw new Error(`First deployment failed; there is no previous revision to restore: ${error.message}`);
    run(['containerapp', 'revision', 'activate', '--resource-group', group, '--name', appName, '--revision', previous.name]);
    run(['containerapp', 'ingress', 'traffic', 'set', '--resource-group', group, '--name', appName, '--revision-weight', `${previous.name}=100`]);
    const restored = readApp(appName);
    const restoredRevision = servingRevision(restored, revision => readRevision(appName, revision));
    if (restoredRevision.name !== previous.name || restoredRevision.image !== previous.image) {
      throw new Error(`Deployment failed and rollback did not restore the previous image: ${error.message}`);
    }
    await check(`https://${restored.properties.configuration.ingress.fqdn}`);
    const revisions = run(['containerapp', 'revision', 'list', '--resource-group', group, '--name', appName]);
    if (revisions.some(revision => revision.name === state.candidate && revision.properties.active)) {
      run(['containerapp', 'revision', 'deactivate', '--resource-group', group, '--name', appName, '--revision', state.candidate]);
    }
    throw new Error(`Deployment failed; the previous healthy revision was restored: ${error.message}`);
  }
}

export async function rollback(env, { run = azure, check = smoke, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), save = saveState } = {}) {
  const { appName, group } = settings(env);
  if (env.SOURCE_REF !== 'refs/heads/main' || !env.ROLLBACK_REASON?.trim()) throw new Error('Rollback requires main and an operator reason.');
  if (!env.TARGET_REVISION?.startsWith(`${appName}--`) || !/^[a-z0-9-]+$/.test(env.TARGET_REVISION)) {
    throw new Error('Rollback revision must belong to the selected app.');
  }
  const readApp = () => run(['containerapp', 'show', '--resource-group', group, '--name', appName]);
  const readRevision = revision => run(['containerapp', 'revision', 'show', '--resource-group', group, '--name', appName, '--revision', revision]);
  const previous = servingRevision(readApp(), readRevision);
  const target = readRevision(env.TARGET_REVISION);
  const image = target.properties.template.containers[0].image;
  if (!image.startsWith(`${env.ACR_LOGIN_SERVER}/patroller-audit@`)) throw new Error('Rollback requires an immutable image from this app registry.');
  validateDigest(image.split('@')[1]);
  await save({ resourceGroup: group, appName, previous, candidate: env.TARGET_REVISION, image, reason: env.ROLLBACK_REASON });
  run(['containerapp', 'revision', 'activate', '--resource-group', group, '--name', appName, '--revision', env.TARGET_REVISION]);
  let healthy = false;
  const deadline = Date.now() + 5 * 60 * 1000;
  for (let attempt = 0; attempt < 30 && Date.now() < deadline; attempt++) {
    const targetState = readRevision(env.TARGET_REVISION).properties;
    if (targetState.active && targetState.healthState === 'Healthy') { healthy = true; break; }
    if (attempt < 29) await sleep(10000);
  }
  if (!healthy) {
    if (!target.properties.active) run(['containerapp', 'revision', 'deactivate', '--resource-group', group, '--name', appName, '--revision', env.TARGET_REVISION]);
    throw new Error('Rollback target is unhealthy; traffic was not changed.');
  }
  run(['containerapp', 'ingress', 'traffic', 'set', '--resource-group', group, '--name', appName, '--revision-weight', `${env.TARGET_REVISION}=100`]);
  try {
    const restored = readApp();
    const serving = servingRevision(restored, readRevision);
    if (serving.name !== env.TARGET_REVISION || serving.image !== image) throw new Error('Rollback target is not serving.');
    const baseUrl = `https://${restored.properties.configuration.ingress.fqdn}`;
    await check(baseUrl);
    if (previous.name !== serving.name) run(['containerapp', 'revision', 'deactivate', '--resource-group', group, '--name', appName, '--revision', previous.name]);
    return { baseUrl, revision: serving.name };
  } catch (error) {
    run(['containerapp', 'revision', 'activate', '--resource-group', group, '--name', appName, '--revision', previous.name]);
    run(['containerapp', 'ingress', 'traffic', 'set', '--resource-group', group, '--name', appName, '--revision-weight', `${previous.name}=100`]);
    const original = readApp();
    const serving = servingRevision(original, readRevision);
    if (serving.name !== previous.name || serving.image !== previous.image) throw new Error('Original traffic could not be restored.');
    await check(`https://${original.properties.configuration.ingress.fqdn}`);
    if (!target.properties.active && env.TARGET_REVISION !== previous.name) {
      run(['containerapp', 'revision', 'deactivate', '--resource-group', group, '--name', appName, '--revision', env.TARGET_REVISION]);
    }
    throw new Error(`Rollback gate failed; original traffic was restored: ${error.message}`);
  }
}

async function saveState(state) {
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/deployment-state.json', `${JSON.stringify(state, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = process.argv[2] === 'rollback' ? await rollback(process.env) : await deploy(process.env);
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `base_url=${result.baseUrl}\nrevision=${result.revision}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `Deployed ${process.env.RING}: ${result.baseUrl}\nRevision: ${result.revision}\n`);
    console.log(`Serving ${result.baseUrl} (${result.revision}).`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
