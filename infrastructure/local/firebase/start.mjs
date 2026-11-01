import { existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const project = process.env.FIREBASE_PROJECT_ID ?? 'demo-patroller-audit-local';
if (!/^demo-[a-z0-9-]+$/.test(project)) throw new Error('Local Firebase requires a demo-prefixed project.');
const data = join(process.cwd(), 'data');
mkdirSync(join(data, 'runtime'), { recursive: true });
const args = [
  'node_modules/firebase-tools/lib/bin/firebase.js', 'emulators:start',
  '--only', 'auth', '--project', project, '--config', 'firebase.json', '--non-interactive',
  `--export-on-exit=${join(data, 'export')}`,
];
if (existsSync(join(data, 'export', 'firebase-export-metadata.json'))) {
  args.push(`--import=${join(data, 'export')}`);
}
const child = spawn(process.execPath, args, { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill('SIGINT'));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
