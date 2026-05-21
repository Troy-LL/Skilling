import fs from 'node:fs';
import path from 'node:path';
import { SkillingError } from './errors.js';
import { parseSkillFile } from './parse.js';
import type { SkillFrontMatter } from './parse.js';
import { resolveSkillsMetaDir } from './skill-meta-overlay.js';
import { validatePrimarySize } from './validate.js';

export type SkillListEntry = {
  id: string;
  title: string;
  summary: string;
  tags?: string[];
  version?: string;
};

export type IndexFailure = {
  folder: string;
  reason: string;
};

export type SkillIndex =
  | {
      ok: true;
      skills: SkillListEntry[];
      paths: Map<string, string>;
      metas: Map<string, SkillFrontMatter>;
    }
  | {
      ok: false;
      error: string;
      failures: IndexFailure[];
    };

let indexCache: { rootReal: string; mtimeMs: number; index: SkillIndex } | null = null;

function realPathBestEffort(p: string): string {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
}

export function skillRootSetupHint(resolvedPath: string): string {
  return [
    `Skilling: skill root not found at ${resolvedPath}`,
    'Use an absolute SKILL_ROOT in MCP env (e.g. SKILL_ROOT=/your/project/.agents/skills) or pass --skill-root <path>.',
    'Most hosts do not expand ${workspaceFolder} — omit SKILL_ROOT and rely on discovery, or run npx skilling setup --force.',
    'Bundled catalog: npx -y skilling@latest (uses package .agents/skills when no project root is found).',
  ].join('\n');
}

export function resolveSkillRoot(rootArg: string): string {
  const resolved = path.resolve(rootArg);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new SkillingError('STORE_UNAVAILABLE', skillRootSetupHint(resolved));
  }
  return realPathBestEffort(resolved);
}

export function invalidateIndexCache(): void {
  indexCache = null;
}

/** Max mtime across skill files and overlay YAML — detects in-place edits without root dir mtime change. */
function computeIndexSignalMtime(rootReal: string, metaDir: string): number {
  let max = 0;
  try {
    max = Math.max(max, fs.statSync(rootReal).mtimeMs);
  } catch {
    /* ignore */
  }
  try {
    for (const d of fs.readdirSync(rootReal, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const skillMd = path.join(rootReal, d.name, 'SKILL.md');
      try {
        max = Math.max(max, fs.statSync(skillMd).mtimeMs);
      } catch {
        /* ignore missing SKILL.md */
      }
    }
  } catch {
    /* ignore */
  }
  try {
    if (fs.existsSync(metaDir)) {
      for (const f of fs.readdirSync(metaDir)) {
        if (!f.endsWith('.yaml')) continue;
        try {
          max = Math.max(max, fs.statSync(path.join(metaDir, f)).mtimeMs);
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
  return max;
}

/** Ensure candidate is under root (after resolve). */
export function assertPathUnderRoot(rootReal: string, candidateAbs: string): void {
  const rel = path.relative(rootReal, candidateAbs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new SkillingError('PATH_ESCAPE', 'path resolves outside skill root');
  }
}

function readSkillFile(rootReal: string, folderName: string): { text: string } {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(folderName)) {
    throw new Error('folder name is not a valid skill_id');
  }
  const abs = path.resolve(path.join(rootReal, folderName, 'SKILL.md'));
  assertPathUnderRoot(rootReal, abs);
  if (!fs.existsSync(abs)) {
    throw new Error('SKILL.md missing');
  }
  const absReal = fs.realpathSync.native(abs);
  assertPathUnderRoot(rootReal, absReal);
  const buf = fs.readFileSync(absReal);
  validatePrimarySize(buf);
  const text = buf.toString('utf8');
  return { text };
}

export function buildIndex(skillRoot: string, skillsMetaDir?: string): SkillIndex {
  const rootReal = resolveSkillRoot(skillRoot);
  const metaDir = skillsMetaDir ?? resolveSkillsMetaDir(rootReal);
  const entries: { folder: string; meta: SkillFrontMatter }[] = [];
  const failures: IndexFailure[] = [];
  const dirents = fs.readdirSync(rootReal, { withFileTypes: true });
  for (const d of dirents) {
    if (!d.isDirectory()) continue;
    const folder = d.name;
    try {
      const { text } = readSkillFile(rootReal, folder);
      const { meta } = parseSkillFile(text, folder, { skillsMetaDir: metaDir });
      if (meta.inject === false) continue;
      entries.push({ folder, meta });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push({ folder, reason: msg });
    }
  }
  const byId = new Map<string, { folder: string; meta: SkillFrontMatter }[]>();
  for (const e of entries) {
    const list = byId.get(e.meta.id) ?? [];
    list.push(e);
    byId.set(e.meta.id, list);
  }
  const dupIds = [...byId.entries()].filter(([, v]) => v.length > 1).map(([k]) => k);
  if (dupIds.length > 0) {
    return {
      ok: false,
      error: `Duplicate skill id(s) in store: ${dupIds.join(', ')} — conflicting skills rejected (skill-rules §3)`,
      failures,
    };
  }
  if (entries.length === 0) {
    return {
      ok: false,
      error:
        failures.length > 0
          ? `Skill store has no valid skills (${failures.length} folder(s) failed validation).`
          : 'Skill store is empty.',
      failures,
    };
  }
  const skills: SkillListEntry[] = entries
    .map((e) => ({
      id: e.meta.id,
      title: e.meta.title,
      summary: e.meta.summary,
      ...(e.meta.tags?.length ? { tags: e.meta.tags } : {}),
      ...(e.meta.version ? { version: e.meta.version } : {}),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const paths = new Map<string, string>();
  const metas = new Map<string, SkillFrontMatter>();
  for (const e of entries) {
    paths.set(e.meta.id, path.join(rootReal, e.folder, 'SKILL.md'));
    metas.set(e.meta.id, e.meta);
  }
  return { ok: true, skills, paths, metas };
}

export function getSkillIndex(skillRoot: string, skillsMetaDir?: string): SkillIndex {
  const rootReal = resolveSkillRoot(skillRoot);
  const metaDir = skillsMetaDir ?? resolveSkillsMetaDir(rootReal);
  const mtimeMs = computeIndexSignalMtime(rootReal, metaDir);
  if (
    indexCache &&
    indexCache.rootReal === rootReal &&
    indexCache.mtimeMs === mtimeMs
  ) {
    return indexCache.index;
  }
  const index = buildIndex(skillRoot, metaDir);
  indexCache = { rootReal, mtimeMs, index };
  return index;
}

export function loadSkillBody(
  skillRoot: string,
  skillId: string,
  skillsMetaDir?: string,
): { meta: SkillFrontMatter; body: string } {
  const index = getSkillIndex(skillRoot, skillsMetaDir);
  if (!index.ok) {
    throw new SkillingError('STORE_UNAVAILABLE', index.error);
  }
  const file = index.paths.get(skillId);
  if (!file) {
    throw new SkillingError(
      'SKILL_NOT_FOUND',
      `Unknown skill_id: ${skillId}. Call the list tool for available skill ids.`,
    );
  }
  const rootReal = resolveSkillRoot(skillRoot);
  const abs = path.resolve(file);
  assertPathUnderRoot(rootReal, abs);
  const absReal = fs.realpathSync.native(abs);
  assertPathUnderRoot(rootReal, absReal);
  const buf = fs.readFileSync(absReal);
  validatePrimarySize(buf);
  const text = buf.toString('utf8');
  const folder = path.basename(path.dirname(file));
  const metaDir = skillsMetaDir ?? resolveSkillsMetaDir(rootReal);
  return parseSkillFile(text, folder, { skillsMetaDir: metaDir });
}

export function formatIndexError(index: Extract<SkillIndex, { ok: false }>): string {
  const lines = [index.error];
  for (const f of index.failures) {
    lines.push(`- ${f.folder}: ${f.reason}`);
  }
  return lines.join('\n');
}
