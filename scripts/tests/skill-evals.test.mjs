import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { evaluateContract, evaluateResponse, run } from '../../.github/skills/_shared/eval-lib.mjs';

const skills = [
  'azure-observability-investigator',
  'deployment-dev-loop',
  'git-worktree-workflow',
  'pre-commit-review',
  'user-story-development',
];

test('each adapted skill covers its evaluation scenarios and rejects an empty contract', async () => {
  for (const skill of skills) {
    const runner = await import(`../../.github/skills/${skill}/evals/run.mjs`);
    const results = runner.evaluateContract(runner.referenceText);
    assert.ok(results.length > 0, skill);
    assert.deepEqual(results.filter(result => !result.passed), [], skill);
    assert.ok(runner.evaluateContract('').every(result => !result.passed), skill);
  }
});

test('required alternatives normalize whitespace and case, and retain missing criteria', () => {
  const scenario = { required: [['real Cosmos DB', 'actual emulator'], ['approval']], forbidden: [] };
  assert.equal(evaluateResponse(scenario, 'REAL\nCOSMOS DB requires APPROVAL.').passed, true);
  const result = evaluateResponse(scenario, 'actual emulator');
  assert.equal(result.passed, false);
  assert.deepEqual(result.missing, ['approval']);
  assert.equal(evaluateResponse({ ...scenario, minimumRequired: 1 }, 'actual emulator').passed, true);
  // Contract coverage still requires every criterion, even when live scoring allows omissions.
  assert.equal(evaluateContract([{ ...scenario, id: 'partial', minimumRequired: 1 }], 'actual emulator')[0].passed, false);
});

test('forbidden actions reject positive mentions but tolerate direct safety negation', () => {
  const scenario = { required: [['review']], forbidden: ['push without authorization'] };
  for (const prefix of ['do not', "don't", 'never', 'avoid', 'refuse to', 'must not']) {
    assert.equal(evaluateResponse(scenario, `Review first; ${prefix} push without authorization.`).passed, true);
  }
  assert.equal(evaluateResponse(scenario, 'Review first; push without authorization.').passed, false);
  assert.equal(evaluateResponse(scenario,
    'Review first; never push without authorization. Later, push without authorization.').passed, false);
});

test('runner entrypoint selects a deterministic case and rejects unknown IDs', () => {
  const runner = fileURLToPath(new URL('../../.github/skills/deployment-dev-loop/evals/run.mjs', import.meta.url));
  const selected = spawnSync(process.execPath, [runner, '--case=guardrails'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(selected.status, 0, selected.stderr || selected.stdout);
  assert.match(selected.stdout, /PASS guardrails/);
  assert.match(selected.stdout, /1\/1 evals passed/);
  assert.doesNotMatch(selected.stdout, /promote-to-staging/);
  const unknown = spawnSync(process.execPath, [runner, '--case=nonexistent'], { encoding: 'utf8', timeout: 10000 });
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /Unknown eval case: nonexistent/);
});

test('live invocation disables tools and keeps scenario text out of the Windows shell command', () => {
  const scenario = { id: 'isolated', prompt: "literal $(Get-Content secret); 'quoted'",
    required: [['approval']], forbidden: [] };
  for (const platform of ['win32', 'linux']) {
    let calls = 0;
    const results = run({ skillName: 'test', evalCases: [scenario], referenceText: 'Full skill instructions',
      repoRoot: process.cwd(), platform,
      invoke(command, args, options) {
        calls++;
        assert.equal(options.timeout, 180000);
        if (platform === 'win32') {
          assert.equal(command, 'pwsh');
          assert.match(args.at(-1), /--available-tools --silent/);
          assert.ok(!args.at(-1).includes(scenario.prompt));
          assert.ok(options.input.includes(scenario.prompt));
          assert.ok(options.input.includes('Full skill instructions'));
        } else {
          assert.equal(command, 'copilot');
          assert.ok(args.includes('--available-tools'));
          assert.equal(args[args.indexOf('--available-tools') + 1], '--silent');
          assert.ok(args[1].includes(scenario.prompt));
          assert.ok(args[1].includes('Full skill instructions'));
        }
        return { status: 0, stdout: 'Obtain approval.', stderr: '' };
      },
    }, ['--live']);
    assert.equal(calls, 1);
    assert.equal(results[0].passed, true);
  }
});
