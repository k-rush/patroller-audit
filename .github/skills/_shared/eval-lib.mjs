import { spawnSync } from 'node:child_process';

function matchesAny(text, alternatives) {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ');
  return alternatives.some(value => normalized.includes(value.toLowerCase().replace(/\s+/g, ' ')));
}

function containsUnsafePhrase(text, phrase) {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ');
  const target = phrase.toLowerCase().replace(/\s+/g, ' ');
  let index = normalized.indexOf(target);
  while (index >= 0) {
    const prefix = normalized.slice(Math.max(0, index - 24), index);
    if (!/(?:do not|don't|never|avoid|refuse to|must not)\s*$/.test(prefix)) return true;
    index = normalized.indexOf(target, index + target.length);
  }
  return false;
}

export function evaluateResponse(testCase, response) {
  const missing = testCase.required.filter(alternatives => !matchesAny(response, alternatives))
    .map(alternatives => alternatives.join(' | '));
  const forbidden = testCase.forbidden.filter(value => containsUnsafePhrase(response, value));
  const matched = testCase.required.length - missing.length;
  return { passed: matched >= (testCase.minimumRequired ?? testCase.required.length) && forbidden.length === 0, missing, forbidden };
}

export function evaluateContract(evalCases, referenceText) {
  return evalCases.map(testCase => {
    const missing = testCase.required.filter(alternatives => !matchesAny(referenceText, alternatives))
      .map(alternatives => alternatives.join(' | '));
    return { id: testCase.id, passed: missing.length === 0, missing, forbidden: [] };
  });
}

function liveAttempt(testCase, { skillName, referenceText, repoRoot, invoke = spawnSync, platform = process.platform }) {
  const prompt = [
    `Use these ${skillName} skill instructions:\n${referenceText}`,
    'This is a behavioral evaluation. Do not execute tools, read files, access live services, or modify anything.',
    'Return a concise plan separating evidence from hypotheses.',
    `Scenario:\n${testCase.prompt}`,
  ].join('\n\n');
  const flags = ['--available-tools', '--silent', '--no-auto-update', '--disable-builtin-mcps', '--no-ask-user'];
  // Pass the prompt through stdin on Windows, never through shell interpolation.
  const result = platform === 'win32'
    ? invoke('pwsh', ['-NoProfile', '-NonInteractive', '-Command',
      `& copilot -p ([Console]::In.ReadToEnd()) ${flags.join(' ')}; exit $LASTEXITCODE`],
    { cwd: repoRoot, input: prompt, encoding: 'utf8', timeout: 180000 })
    : invoke('copilot', ['-p', prompt, ...flags],
      { cwd: repoRoot, encoding: 'utf8', timeout: 180000 });
  if (result.error || result.status !== 0) {
    return { passed: false, missing: [], forbidden: [],
      error: result.error?.message ?? (result.stderr?.trim() || `CLI exited ${result.status}`) };
  }
  return { ...evaluateResponse(testCase, result.stdout), response: result.stdout.trim() };
}

function liveCase(testCase, options) {
  const first = liveAttempt(testCase, options);
  if (first.passed || first.error) return { ...first, attempts: 1 };
  const second = liveAttempt(testCase, options);
  if (second.passed || second.error) return { ...second, attempts: 2 };
  const best = [first, second].sort((a, b) => a.forbidden.length - b.forbidden.length || a.missing.length - b.missing.length)[0];
  return { ...best, attempts: 2 };
}

export function run(options, argv = process.argv.slice(2)) {
  const { evalCases, referenceText } = options;
  const selectedId = argv.find(argument => argument.startsWith('--case='))?.slice(7);
  const selected = selectedId ? evalCases.filter(testCase => testCase.id === selectedId) : evalCases;
  if (!selected.length) throw new Error(`Unknown eval case: ${selectedId}`);
  const results = argv.includes('--live')
    ? selected.map(testCase => ({ id: testCase.id, ...liveCase(testCase, options) }))
    : evaluateContract(selected, referenceText);
  for (const result of results) {
    const details = [
      result.missing.length ? `missing: ${result.missing.join(', ')}` : '',
      result.forbidden.length ? `forbidden: ${result.forbidden.join(', ')}` : '',
      result.error ?? '',
    ].filter(Boolean).join('; ');
    console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.id}${details ? ` (${details})` : ''}`);
    if (argv.includes('--verbose') && result.response) console.log(result.response);
  }
  const passed = results.filter(result => result.passed).length;
  console.log(`\n${passed}/${results.length} evals passed.`);
  if (passed !== results.length) process.exitCode = 1;
  return results;
}
