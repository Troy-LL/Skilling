/**
 * Cursor beforeSubmitPrompt hook (Sprint F): auto begin_task when no active session.
 * Fail-open; writes .skillpilot/active-body.md bridge when routing succeeds.
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

function isOptedOut(repoRoot) {
  if (process.env.SKILLPILOT_SKIP_AUTO_BEGIN === '1') return true;
  return fs.existsSync(path.join(repoRoot, '.skillpilot', 'disable-auto-begin'));
}

function readSession(repoRoot) {
  const file = path.join(repoRoot, '.skillpilot', 'session.json');
  if (!fs.existsSync(file)) return null;
  try {
    const session = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!session?.correlation_id || !session?.skill_id || !session?.started_at) return null;
    return { file, session };
  } catch {
    return null;
  }
}

function isSessionActive(session) {
  const started = Date.parse(session.started_at);
  if (Number.isNaN(started)) return false;
  const ttl = typeof session.ttl_ms === 'number' ? session.ttl_ms : 300_000;
  return started + ttl > Date.now();
}

function runCleanup(repoRoot, correlationId) {
  const serverEntry = path.join(repoRoot, 'dist', 'index.js');
  const skillRoot = path.join(repoRoot, 'skills');
  const cleanupScript = path.join(repoRoot, 'scripts', 'extension-cleanup.mjs');
  if (!fs.existsSync(serverEntry) || !fs.existsSync(cleanupScript)) return false;
  const result = spawnSync(
    process.execPath,
    [cleanupScript, correlationId, serverEntry, skillRoot],
    { cwd: repoRoot, encoding: 'utf8', windowsHide: true, env: process.env },
  );
  return result.status === 0;
}

function runBeginTask(repoRoot, prompt) {
  const serverEntry = path.join(repoRoot, 'dist', 'index.js');
  const skillRoot = path.join(repoRoot, 'skills');
  const beginScript = path.join(repoRoot, 'scripts', 'extension-begin-task.mjs');
  if (!fs.existsSync(serverEntry)) {
    process.stderr.write(
      `skillpilot-auto-begin: missing ${serverEntry} (run npm run build)\n`,
    );
    return null;
  }
  if (!fs.existsSync(beginScript)) {
    process.stderr.write(`skillpilot-auto-begin: missing ${beginScript}\n`);
    return null;
  }

  const result = spawnSync(
    process.execPath,
    [beginScript, serverEntry, skillRoot],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, SKILLPILOT_PROMPT: prompt },
    },
  );

  if (result.status !== 0) {
    process.stderr.write(
      result.stderr?.trim() ||
        `skillpilot-auto-begin: begin_task exited ${result.status ?? 'unknown'}\n`,
    );
    return null;
  }

  try {
    return JSON.parse(result.stdout?.trim() || '{}');
  } catch {
    process.stderr.write('skillpilot-auto-begin: invalid begin_task JSON output\n');
    return null;
  }
}

function writeActiveBody(repoRoot, skillId, body) {
  const dir = path.join(repoRoot, '.skillpilot');
  fs.mkdirSync(dir, { recursive: true });
  const header = `<!-- SkillPilot ephemeral bridge — do not commit. skill_id: ${skillId} -->\n\n`;
  fs.writeFileSync(path.join(dir, 'active-body.md'), header + body, 'utf8');
}

function log(message) {
  process.stderr.write(`skillpilot-auto-begin: ${message}\n`);
}

async function main() {
  const hookInput = await readStdinJson();
  const prompt = typeof hookInput.prompt === 'string' ? hookInput.prompt.trim() : '';
  if (!prompt) {
    process.stdout.write(JSON.stringify({ continue: true }) + '\n');
    return;
  }

  for (const repoRoot of uniqueRoots(hookInput)) {
    if (isOptedOut(repoRoot)) {
      log(`skipped (opt-out) for ${repoRoot}`);
      break;
    }

    const hit = readSession(repoRoot);
    if (hit && isSessionActive(hit.session)) {
      log(`active session ${hit.session.skill_id}; skip begin_task`);
      break;
    }

    if (hit && !isSessionActive(hit.session)) {
      log(`session expired for ${hit.session.skill_id}; cleanup then begin`);
      runCleanup(repoRoot, hit.session.correlation_id);
      try {
        fs.unlinkSync(hit.file);
      } catch {
        /* ignore */
      }
    }

    const payload = runBeginTask(repoRoot, prompt);
    if (payload?.skill_id && payload?.body) {
      writeActiveBody(repoRoot, payload.skill_id, payload.body);
      log(`routed to ${payload.skill_id}`);
    }
    break;
  }

  process.stdout.write(JSON.stringify({ continue: true }) + '\n');
}

main().catch((err) => {
  process.stderr.write(
    `skillpilot-auto-begin error: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.stdout.write(JSON.stringify({ continue: true }) + '\n');
  process.exit(0);
});
