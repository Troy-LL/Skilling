/**
 * beforeSubmitPrompt: auto begin_task when no active session (fail-open).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  hookScriptDir,
  resolveServerRoot,
  resolveSkillRoot,
  workspaceRoots,
} from '../scripts/hook-paths.mjs';

const HOOK_SCRIPT_DIR = hookScriptDir(import.meta.url);

async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function isOptedOut(workspaceRoot) {
  if (process.env.SKILLPILOT_SKIP_AUTO_BEGIN === '1') return true;
  return fs.existsSync(path.join(workspaceRoot, '.skillpilot', 'disable-auto-begin'));
}

function readSession(workspaceRoot) {
  const file = path.join(workspaceRoot, '.skillpilot', 'session.json');
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

function runCleanup(serverRoot, skillRoot, correlationId) {
  const serverEntry = path.join(serverRoot, 'dist', 'index.js');
  const cleanupScript = path.join(serverRoot, 'scripts', 'extension-cleanup.mjs');
  if (!fs.existsSync(serverEntry) || !fs.existsSync(cleanupScript)) return false;
  const result = spawnSync(
    process.execPath,
    [cleanupScript, correlationId, serverEntry, skillRoot],
    { cwd: serverRoot, encoding: 'utf8', windowsHide: true, env: process.env },
  );
  return result.status === 0;
}

function runBeginTask(serverRoot, skillRoot, prompt) {
  const serverEntry = path.join(serverRoot, 'dist', 'index.js');
  const beginScript = path.join(serverRoot, 'scripts', 'extension-begin-task.mjs');
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
      cwd: serverRoot,
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

function writeActiveBody(workspaceRoot, skillId, body) {
  const dir = path.join(workspaceRoot, '.skillpilot');
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

  const serverRoot = resolveServerRoot(HOOK_SCRIPT_DIR);
  const skillRoot = resolveSkillRoot(serverRoot);

  for (const workspaceRoot of workspaceRoots(hookInput, HOOK_SCRIPT_DIR)) {
    if (isOptedOut(workspaceRoot)) {
      log(`skipped (opt-out) for ${workspaceRoot}`);
      break;
    }

    const hit = readSession(workspaceRoot);
    if (hit && isSessionActive(hit.session)) {
      log(`active session ${hit.session.skill_id}; skip begin_task`);
      break;
    }

    if (hit && !isSessionActive(hit.session)) {
      log(`session expired for ${hit.session.skill_id}; cleanup then begin`);
      runCleanup(serverRoot, skillRoot, hit.session.correlation_id);
      try {
        fs.unlinkSync(hit.file);
      } catch {
        /* ignore */
      }
    }

    const payload = runBeginTask(serverRoot, skillRoot, prompt);
    // begin_task (MCP) also writes active-body.md under repo root derived from skill root;
    // write here so the workspace-root bridge exists when hook workspace matches skill repo.
    if (payload?.skill_id && payload?.body) {
      writeActiveBody(workspaceRoot, payload.skill_id, payload.body);
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
