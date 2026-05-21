import fs from 'node:fs';
import path from 'node:path';

export const SESSION_SCHEMA_VERSION = 2;

/** Fields required when writing a new session (v2). */
export type SkillSessionWrite = {
  skill_id: string;
  title: string;
  summary: string;
  rationale: string;
  confidence: number;
  warnings?: string[];
  correlation_id: string;
  ttl_ms: number;
  started_at: string;
  phase?: string;
  prompt_fingerprint?: string;
};

export type SkillSession = SkillSessionWrite & {
  version: typeof SESSION_SCHEMA_VERSION;
};

export function resolveSessionPath(repoRoot: string): string {
  return path.join(path.resolve(repoRoot), '.skillpilot', 'session.json');
}

export function resolveActiveBodyPath(repoRoot: string): string {
  return path.join(path.resolve(repoRoot), '.skillpilot', 'active-body.md');
}

function normalizeV1(data: Record<string, unknown>): SkillSession | null {
  const skill_id = data.skill_id;
  const correlation_id = data.correlation_id;
  const started_at = data.started_at;
  if (typeof skill_id !== 'string' || typeof correlation_id !== 'string' || typeof started_at !== 'string') {
    return null;
  }
  const ttl_ms = typeof data.ttl_ms === 'number' ? data.ttl_ms : 300_000;
  const title = typeof data.title === 'string' ? data.title : skill_id;
  const rationale =
    typeof data.rationale === 'string' ? data.rationale : `Active skill: ${skill_id}`;
  const summary =
    typeof data.summary === 'string' ? data.summary : `Using ${title} — ${rationale}`;
  return {
    version: SESSION_SCHEMA_VERSION,
    skill_id,
    title,
    summary,
    rationale,
    confidence: typeof data.confidence === 'number' ? data.confidence : 1,
    ...(Array.isArray(data.warnings) ? { warnings: data.warnings as string[] } : {}),
    correlation_id,
    ttl_ms,
    started_at,
    ...(typeof data.phase === 'string' ? { phase: data.phase } : {}),
    ...(typeof data.prompt_fingerprint === 'string'
      ? { prompt_fingerprint: data.prompt_fingerprint }
      : {}),
  };
}

export function readSession(repoRoot: string): SkillSession | null {
  const file = resolveSessionPath(repoRoot);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    const version = raw.version;
    if (version === SESSION_SCHEMA_VERSION || version === 1) {
      return normalizeV1(raw);
    }
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`skillpilot: corrupt session.json ignored: ${msg}\n`);
    return null;
  }
}

export function writeSession(repoRoot: string, session: SkillSessionWrite): void {
  const dir = path.join(path.resolve(repoRoot), '.skillpilot');
  fs.mkdirSync(dir, { recursive: true });
  const full: SkillSession = { version: SESSION_SCHEMA_VERSION, ...session };
  fs.writeFileSync(resolveSessionPath(repoRoot), JSON.stringify(full, null, 2), 'utf8');
}

export function clearSession(repoRoot: string): void {
  const file = resolveSessionPath(repoRoot);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  clearActiveBody(repoRoot);
}

export function writeActiveBody(repoRoot: string, skillId: string, body: string): void {
  const dir = path.join(path.resolve(repoRoot), '.skillpilot');
  fs.mkdirSync(dir, { recursive: true });
  const header =
    `<!-- SkillPilot ephemeral bridge — do not commit. skill_id: ${skillId} -->\n\n`;
  fs.writeFileSync(resolveActiveBodyPath(repoRoot), header + body, 'utf8');
}

export function clearActiveBody(repoRoot: string): void {
  const file = resolveActiveBodyPath(repoRoot);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

/** True when started_at + ttl_ms is still in the future. */
export function isSessionActive(session: SkillSession, nowMs = Date.now()): boolean {
  const started = Date.parse(session.started_at);
  if (Number.isNaN(started)) return false;
  return started + session.ttl_ms > nowMs;
}
