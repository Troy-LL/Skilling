/**
 * Simulate Cursor beforeSubmitPrompt hook (Sprint F).
 * Usage: npm run build && npm run test:auto-begin-hook
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hookScript = path.join(repoRoot, 'hooks', 'skilling-auto-begin.mjs');
const sessionFile = path.join(repoRoot, '.skilling', 'session.json');
const bodyFile = path.join(repoRoot, '.skilling', 'active-body.md');

function runHook(prompt, extra = {}, env = {}) {
  const input = JSON.stringify({
    hook_event_name: 'beforeSubmitPrompt',
    prompt,
    workspace_roots: [repoRoot],
    ...extra,
  });
  return spawnSync(process.execPath, [hookScript], {
    cwd: repoRoot,
    input,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, ...env },
  });
}

for (const f of [sessionFile, bodyFile]) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

const disabled = runHook('find a skill for API testing workflows');
process.stdout.write(disabled.stdout ?? '');
process.stderr.write(disabled.stderr ?? '');

if (disabled.status !== 0) {
  process.stderr.write(`Hook exited ${disabled.status}\n`);
  process.exit(disabled.status ?? 1);
}
if (!disabled.stderr?.includes('auto-inject disabled')) {
  process.stderr.write('Expected auto-inject disabled log by default\n');
  process.exit(1);
}
if (fs.existsSync(sessionFile) || fs.existsSync(bodyFile)) {
  process.stderr.write('Expected no session files when auto-inject disabled\n');
  process.exit(1);
}

const enabled = runHook('find a skill for API testing workflows', {}, { SKILLING_HOOK_AUTO_INJECT: '1' });
process.stdout.write(enabled.stdout ?? '');
process.stderr.write(enabled.stderr ?? '');

if (enabled.status !== 0) {
  process.stderr.write(`Hook with auto-inject exited ${enabled.status}\n`);
  process.exit(enabled.status ?? 1);
}
if (!fs.existsSync(sessionFile)) {
  process.stderr.write('Expected session.json after opt-in auto-inject\n');
  process.exit(1);
}
if (!fs.existsSync(bodyFile)) {
  process.stderr.write('Expected active-body.md after opt-in auto-inject\n');
  process.exit(1);
}

const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
if (!session.summary || !session.rationale) {
  process.stderr.write('Session missing v2 summary/rationale fields\n');
  process.exit(1);
}

process.stderr.write(`Session skill_id=${session.skill_id}\n`);

const second = runHook('follow up on the same task', {}, { SKILLING_HOOK_AUTO_INJECT: '1' });
process.stderr.write(second.stderr ?? '');
if (!second.stderr?.includes('skip begin_task')) {
  process.stderr.write('Expected skip log on second prompt\n');
  process.exit(1);
}

for (const f of [sessionFile, bodyFile]) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

process.stderr.write('test-auto-begin-hook: ok\n');
process.exit(0);
