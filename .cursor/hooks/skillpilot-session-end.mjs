/**
 * Cursor sessionEnd hook (Sprint E2): MCP cleanup + clear .skillpilot/session.json.
 * Reads hook JSON from stdin; logs to stderr; prints {} on stdout (fire-and-forget).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK_SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function uniqueRoots(hookInput) {
  const roots = new Set();
  if (Array.isArray(hookInput.workspace_roots)) {
    for (const r of hookInput.workspace_roots) {
      if (typeof r === 'string' && r.trim()) roots.add(path.resolve(r.trim()));
    }
  }
  roots.add(process.cwd());
  roots.add(path.resolve(HOOK_SCRIPT_DIR, '..', '..'));
  return [...roots];
}

function readSession(repoRoot) {
  const file = path.join(repoRoot, '.skillpilot', 'session.json');
  if (!fs.existsSync(file)) return null;
  try {
    const session = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!session?.correlation_id || !session?.skill_id) return null;
    return { file, session };
  } catch {
    return null;
  }
}

function runCleanup(repoRoot, correlationId) {
  const serverEntry = path.join(repoRoot, 'dist', 'index.js');
  const skillRoot = path.join(repoRoot, 'skills');
  const cleanupScript = path.join(repoRoot, 'scripts', 'extension-cleanup.mjs');

  if (!fs.existsSync(serverEntry)) {
    process.stderr.write(
      `skillpilot-session-end: missing ${serverEntry} (run npm run build)\n`,
    );
    return false;
  }
  if (!fs.existsSync(cleanupScript)) {
    process.stderr.write(`skillpilot-session-end: missing ${cleanupScript}\n`);
    return false;
  }

  const result = spawnSync(
    process.execPath,
    [cleanupScript, correlationId, serverEntry, skillRoot],
    { cwd: repoRoot, encoding: 'utf8', windowsHide: true },
  );

  if (result.status !== 0) {
    process.stderr.write(
      result.stderr?.trim() ||
        `skillpilot-session-end: cleanup exited ${result.status ?? 'unknown'}\n`,
    );
    return false;
  }
  return true;
}

function log(eventName, message) {
  process.stderr.write(`skillpilot-session-end [${eventName}]: ${message}\n`);
}

async function main() {
  const hookInput = await readStdinJson();
  const eventName = hookInput.hook_event_name ?? 'sessionEnd';

  for (const repoRoot of uniqueRoots(hookInput)) {
    const hit = readSession(repoRoot);
    if (!hit) continue;

    const { correlation_id, skill_id } = hit.session;
    const cleaned = runCleanup(repoRoot, correlation_id);
    if (cleaned) {
      fs.unlinkSync(hit.file);
      const bodyFile = path.join(repoRoot, '.skillpilot', 'active-body.md');
      if (fs.existsSync(bodyFile)) fs.unlinkSync(bodyFile);
      log(eventName, `cleanup ok for ${skill_id} (${correlation_id})`);
    } else {
      log(eventName, `cleanup failed for ${skill_id}; session file kept`);
    }
    break;
  }

  process.stdout.write('{}\n');
}

main().catch((err) => {
  process.stderr.write(
    `skillpilot-session-end error: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.stdout.write('{}\n');
  process.exit(0);
});
