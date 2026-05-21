import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { SkillPilotError } from './errors.js';
import { parseSkillMarkdown } from './parse.js';
import type { SkillFrontMatter } from './parse.js';
import {
  assertPathUnderRoot,
  buildIndex,
  invalidateIndexCache,
  resolveSkillRoot,
} from './store.js';
import { isValidSkillId } from './validate.js';

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

export type ImportSkillOptions = {
  /** Override canonical skill id (must match skill-rules §2). */
  id?: string;
  /** Optional audit field (skill-rules §10). */
  source?: string;
  /** Workspace/repo root — allows import from `<repo>/.agents/skills` into another SKILL_ROOT. */
  repo_root?: string;
};

export type ImportSkillResult = {
  skill_id: string;
  dest_path: string;
  warnings: string[];
};

function slugFromFolder(folder: string): string {
  return folder
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeId(candidate: string, folder: string): string {
  const raw = candidate.trim() || folder;
  const slug = slugFromFolder(raw);
  if (!isValidSkillId(slug)) {
    throw new Error(
      `Cannot derive valid skill_id from "${raw}". Provide --id matching skill-rules §2.`,
    );
  }
  return slug;
}

/** Map ecosystem front matter (name/description) into SkillPilot required fields. */
function buildFrontMatterBlock(meta: SkillFrontMatter, body: string, source?: string): string {
  const lines = ['---', `id: ${meta.id}`, `title: ${JSON.stringify(meta.title)}`];
  lines.push(`summary: ${JSON.stringify(meta.summary)}`);
  if (meta.tags?.length) {
    lines.push('tags:');
    for (const t of meta.tags) lines.push(`  - ${t}`);
  }
  if (meta.triggers?.length) {
    lines.push('triggers:');
    for (const t of meta.triggers) lines.push(`  - ${JSON.stringify(t)}`);
  }
  if (meta.version) lines.push(`version: ${meta.version}`);
  if (meta.clients?.length) {
    lines.push('clients:');
    for (const c of meta.clients) lines.push(`  - ${c}`);
  }
  if (source) lines.push(`source: ${JSON.stringify(source)}`);
  lines.push('---', '');
  return lines.join('\n') + body.replace(/^\n+/, '');
}

function readAndNormalizeSource(
  sourceFile: string,
  folderName: string,
  options: ImportSkillOptions,
): { meta: SkillFrontMatter; body: string; warnings: string[] } {
  const warnings: string[] = [];
  const raw = fs.readFileSync(sourceFile, 'utf8');
  const m = raw.match(FRONT_MATTER);
  if (!m?.[1] || m[2] === undefined) {
    throw new Error('Source SKILL.md must have YAML front matter');
  }
  let data: unknown;
  try {
    data = parseYaml(m[1]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid YAML: ${msg}`);
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Front matter must be a mapping');
  }
  const rec = data as Record<string, unknown>;
  const id = normalizeId(options.id ?? String(rec['id'] ?? rec['name'] ?? folderName), folderName);
  const title =
    typeof rec['title'] === 'string' && rec['title'].length > 0
      ? rec['title']
      : typeof rec['name'] === 'string'
        ? rec['name']
        : folderName;
  let summary =
    typeof rec['summary'] === 'string' && rec['summary'].length > 0
      ? rec['summary']
      : typeof rec['description'] === 'string'
        ? rec['description'].split('\n')[0]!.slice(0, 300)
        : title;
  if (summary.length > 300) summary = summary.slice(0, 297) + '...';
  if (!rec['summary'] && rec['description']) {
    warnings.push('mapped description → summary');
  }
  if (!rec['id'] && rec['name']) {
    warnings.push('mapped name → id');
  }
  const draft: SkillFrontMatter = {
    id,
    title,
    summary,
    tags: Array.isArray(rec['tags']) ? (rec['tags'] as string[]) : undefined,
    triggers: Array.isArray(rec['triggers']) ? (rec['triggers'] as string[]) : undefined,
    version: typeof rec['version'] === 'string' ? rec['version'] : undefined,
    clients: Array.isArray(rec['clients']) ? (rec['clients'] as string[]) : undefined,
  };
  const body = m[2];
  const { meta, body: validatedBody } = parseSkillMarkdown(
    buildFrontMatterBlock(draft, body, options.source),
    id,
  );
  return { meta, body: validatedBody, warnings };
}

export function resolveRepoRoot(skillRoot: string, repoRootArg?: string): string {
  if (repoRootArg) return path.resolve(repoRootArg);
  const root = path.resolve(skillRoot);
  if (path.basename(root) === 'skills') {
    const parent = path.dirname(root);
    if (path.basename(parent) === '.agents') return path.dirname(parent);
    return parent;
  }
  return root;
}

/** Validate `.agents/skills/<folder>` name; reject path traversal. */
export function validateAgentsFolder(agentsFolder: string): string {
  const trimmed = agentsFolder.trim();
  if (!trimmed) {
    throw new SkillPilotError('VALIDATION_ERROR', 'agents_folder must be a non-empty skill folder name.');
  }
  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    throw new SkillPilotError(
      'VALIDATION_ERROR',
      'agents_folder must not contain path segments.',
    );
  }
  if (!isValidSkillId(trimmed)) {
    throw new SkillPilotError(
      'VALIDATION_ERROR',
      `Invalid agents_folder (must match skill-rules §2): ${trimmed}`,
    );
  }
  return trimmed;
}

export function resolveAgentsSkillPath(repoRoot: string, agentsFolder: string): string {
  const folder = validateAgentsFolder(agentsFolder);
  const agentsSkillsRoot = path.resolve(repoRoot, '.agents', 'skills');
  const source = path.resolve(agentsSkillsRoot, folder, 'SKILL.md');
  const rootReal = fs.realpathSync.native(agentsSkillsRoot);
  assertPathUnderRoot(rootReal, source);
  return source;
}

function resolveAgentsSkillsRootNear(skillRoot: string): string | null {
  const resolved = path.resolve(skillRoot);
  const parent = path.dirname(resolved);
  if (path.basename(resolved) === 'skills' && path.basename(parent) === '.agents') {
    return fs.realpathSync.native(resolved);
  }
  const agentsSkills = path.join(parent, '.agents', 'skills');
  if (fs.existsSync(agentsSkills) && fs.statSync(agentsSkills).isDirectory()) {
    return fs.realpathSync.native(agentsSkills);
  }
  return null;
}

/** Source must lie under SKILL_ROOT or repo `.agents/skills` when present. */
export function assertImportSourceAllowed(
  sourceSkillMd: string,
  skillRoot: string,
  repoRoot?: string,
): string {
  const sourceAbs = path.resolve(sourceSkillMd);
  if (!fs.existsSync(sourceAbs)) {
    throw new SkillPilotError('VALIDATION_ERROR', `Source not found: ${sourceAbs}`);
  }
  const sourceReal = fs.realpathSync.native(sourceAbs);
  const allowedRoots: string[] = [];
  try {
    allowedRoots.push(resolveSkillRoot(skillRoot));
  } catch {
    allowedRoots.push(fs.realpathSync.native(path.resolve(skillRoot)));
  }
  const agentsRoot = resolveAgentsSkillsRootNear(skillRoot);
  if (agentsRoot) allowedRoots.push(agentsRoot);
  if (repoRoot) {
    const repoAgents = path.join(path.resolve(repoRoot), '.agents', 'skills');
    if (fs.existsSync(repoAgents) && fs.statSync(repoAgents).isDirectory()) {
      allowedRoots.push(fs.realpathSync.native(repoAgents));
    }
  }

  for (const root of allowedRoots) {
    try {
      assertPathUnderRoot(root, sourceReal);
      return sourceReal;
    } catch {
      /* try next root */
    }
  }
  throw new SkillPilotError(
    'PATH_ESCAPE',
    'Import source must be under SKILL_ROOT or .agents/skills',
  );
}

export function importSkillFromPath(
  sourceSkillMd: string,
  skillRoot: string,
  options: ImportSkillOptions = {},
): ImportSkillResult {
  const sourceAbs = assertImportSourceAllowed(sourceSkillMd, skillRoot, options.repo_root);
  const folderName = path.basename(path.dirname(sourceAbs));
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(folderName)) {
    throw new SkillPilotError(
      'VALIDATION_ERROR',
      `Source folder name must match skill-rules §2: ${folderName}`,
    );
  }
  const { meta, body, warnings } = readAndNormalizeSource(sourceAbs, folderName, options);
  const destDir = path.join(path.resolve(skillRoot), meta.id);
  const destFile = path.join(destDir, 'SKILL.md');
  if (fs.existsSync(destFile) && !options.id) {
    throw new Error(
      `Skill already exists at ${destFile}. Pass explicit id or remove the folder first.`,
    );
  }
  const index = buildIndex(skillRoot);
  if (index.ok && index.paths.has(meta.id) && !fs.existsSync(destFile)) {
    throw new Error(`Duplicate skill_id in store: ${meta.id}`);
  }
  fs.mkdirSync(destDir, { recursive: true });
  const content = buildFrontMatterBlock(meta, body, options.source);
  fs.writeFileSync(destFile, content, 'utf8');
  parseSkillMarkdown(content, meta.id);
  invalidateIndexCache();
  return { skill_id: meta.id, dest_path: destFile, warnings };
}

export function importSkillFromAgents(
  repoRoot: string,
  agentsFolder: string,
  skillRoot: string,
  options: ImportSkillOptions = {},
): ImportSkillResult {
  const folder = validateAgentsFolder(agentsFolder);
  const source = resolveAgentsSkillPath(repoRoot, folder);
  return importSkillFromPath(source, skillRoot, {
    ...options,
    repo_root: options.repo_root ?? repoRoot,
    source: options.source ?? `agents:${folder}`,
  });
}
