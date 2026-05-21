/**
 * Simulate Cursor sessionEnd hook against the repo session file.
 * Usage (repo root, after begin_task left a session OR with a fake session):
 *   node scripts/test-session-end-hook.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hookScript = path.join(repoRoot, 'hooks', 'skillpilot-session-end.mjs');
const sessionFile = path.join(repoRoot, '.skillpilot', 'session.json');

const fakeSession = {
  version: 1,
  skill_id: 'com-skillpilot-orchestrator',
  correlation_id: '00000000-0000-4000-8000-000000000099',
  ttl_ms: 300000,
  started_at: new Date().toISOString(),
};

let createdFake = false;
if (!fs.existsSync(sessionFile)) {
  fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
  fs.writeFileSync(sessionFile, JSON.stringify(fakeSession, null, 2), 'utf8');
  createdFake = true;
  process.stderr.write(`Created temporary session at ${sessionFile}\n`);
}

const input = JSON.stringify({
  hook_event_name: 'sessionEnd',
  session_id: 'test-session',
  reason: 'completed',
  workspace_roots: [repoRoot],
});

const result = spawnSync(process.execPath, [hookScript], {
  cwd: repoRoot,
  input,
  encoding: 'utf8',
  windowsHide: true,
});

process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');

if (createdFake && fs.existsSync(sessionFile)) {
  fs.unlinkSync(sessionFile);
  process.stderr.write('Removed leftover session file after failed cleanup (expected if MCP not running).\n');
}

process.exit(result.status ?? 1);
