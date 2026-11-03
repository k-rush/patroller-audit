import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evaluateContract as contract, evaluateResponse, run } from '../../_shared/eval-lib.mjs';

export const evalCases = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8'));
export const referenceText = `${readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8')}\n${readFileSync(new URL('../references/kql.md', import.meta.url), 'utf8')}`;
export const evaluateContract = (skill, kql = '') => contract(evalCases, `${skill}\n${kql}`);
export { evaluateResponse };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run({ skillName: 'azure-observability-investigator', evalCases, referenceText,
    repoRoot: fileURLToPath(new URL('../../../../', import.meta.url)) });
}
