import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evaluateContract as contract, evaluateResponse, run } from '../../_shared/eval-lib.mjs';

export const evalCases = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8'));
export const referenceText = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
export const evaluateContract = skill => contract(evalCases, skill);
export { evaluateResponse };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run({ skillName: 'pre-commit-review', evalCases, referenceText,
    repoRoot: fileURLToPath(new URL('../../../../', import.meta.url)) });
}
