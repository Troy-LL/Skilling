import { parse as parseYaml } from 'yaml';
import type { InjectMode } from './shape-body.js';
import {
  applyMetaOverlay,
  type ParseSkillOptions,
} from './skill-meta-overlay.js';
import { estimateTokens } from './token-estimate.js';
import {
  isValidSkillId,
  validateBodyUtf8Length,
  validateClients,
  validateInject,
  validateInjectBrief,
  validateInjectMode,
  validateInjectSections,
  validateMinConfidence,
  validateSummary,
  validateTags,
  validateTitle,
  validateTokenEstimate,
  validateTriggers,
  validateTtlSeconds,
  validateVersion,
} from './validate.js';

export type SkillFrontMatter = {
  id: string;
  title: string;
  summary: string;
  tags?: string[];
  triggers?: string[];
  version?: string;
  clients?: string[];
  token_estimate?: number;
  inject?: boolean;
  inject_mode_default?: InjectMode;
  inject_sections?: string[];
  inject_brief?: string;
  ttl_seconds?: number;
  min_confidence?: number;
};

export type ParsedSkillFile = {
  meta: SkillFrontMatter;
  body: string;
};

export type { ParseSkillOptions };

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

/** Pull quoted example phrases from ecosystem `description` into triggers when omitted. */
function deriveTriggersFromDescription(description: string): string[] | undefined {
  const triggers: string[] = [];
  const re = /"([^"]{3,64})"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(description)) !== null) {
    const phrase = m[1]!.trim().toLowerCase();
    if (phrase.length >= 3) triggers.push(phrase);
  }
  return triggers.length > 0 ? triggers.slice(0, 10) : undefined;
}

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
      `Cannot derive valid skill_id from "${raw}". Folder "${folder}" must match skill-rules §2.`,
    );
  }
  return slug;
}

function metaFromFrontMatterRecord(
  rec: Record<string, unknown>,
  folderDerivedId: string,
  bodyText: string,
): SkillFrontMatter {
  const hasStrictId = typeof rec['id'] === 'string' && isValidSkillId(rec['id']);
  const id = hasStrictId
    ? (rec['id'] as string)
    : normalizeId(String(rec['name'] ?? folderDerivedId), folderDerivedId);

  const titleRaw =
    typeof rec['title'] === 'string' && rec['title'].length > 0
      ? rec['title']
      : typeof rec['name'] === 'string'
        ? rec['name']
        : folderDerivedId;

  let summaryRaw =
    typeof rec['summary'] === 'string' && rec['summary'].length > 0
      ? rec['summary']
      : typeof rec['description'] === 'string'
        ? rec['description'].split('\n')[0]!
        : titleRaw;
  if (summaryRaw.length > 300) summaryRaw = summaryRaw.slice(0, 297) + '...';

  let triggers = validateTriggers(rec['triggers']);
  if (!triggers?.length && typeof rec['description'] === 'string') {
    triggers = deriveTriggersFromDescription(rec['description']);
  }

  const inject = validateInject(rec['inject']) ?? true;
  let token_estimate = validateTokenEstimate(rec['token_estimate']);
  if (token_estimate === undefined) {
    token_estimate = estimateTokens(bodyText);
  }

  return {
    id,
    title: validateTitle(titleRaw),
    summary: validateSummary(summaryRaw),
    tags: validateTags(rec['tags']),
    triggers,
    version: validateVersion(rec['version']),
    clients: validateClients(rec['clients']),
    token_estimate,
    inject,
    inject_mode_default: validateInjectMode(rec['inject_mode_default']),
    inject_sections: validateInjectSections(rec['inject_sections']),
    inject_brief: validateInjectBrief(rec['inject_brief']),
    ttl_seconds: validateTtlSeconds(rec['ttl_seconds']),
    min_confidence: validateMinConfidence(rec['min_confidence']),
  };
}

/** Parse SKILL.md with ecosystem aliases (name/description) or strict SkillPilot front matter. */
export function parseSkillFile(
  rawUtf8: string,
  folderDerivedId: string,
  options?: ParseSkillOptions,
): ParsedSkillFile {
  const m = rawUtf8.match(FRONT_MATTER);
  if (!m?.[1] || m[2] === undefined) {
    throw new Error('SKILL.md must start with YAML front matter delimited by --- lines');
  }
  let data: unknown;
  try {
    data = parseYaml(m[1]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid YAML front matter: ${msg}`);
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('YAML front matter must parse to a mapping object');
  }
  const rec = data as Record<string, unknown>;
  const body = m[2];
  validateBodyUtf8Length(body);
  let meta = metaFromFrontMatterRecord(rec, folderDerivedId, body);
  if (meta.id !== folderDerivedId) {
    throw new Error(
      `id "${meta.id}" does not match folder name "${folderDerivedId}" (rename folder or fix front matter)`,
    );
  }
  meta = applyMetaOverlay(meta, options?.skillsMetaDir);
  return { meta, body };
}

export function parseSkillMarkdown(
  rawUtf8: string,
  folderDerivedId: string,
  options?: ParseSkillOptions,
): ParsedSkillFile {
  return parseSkillFile(rawUtf8, folderDerivedId, options);
}
