import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { MAX_PRIMARY_BYTES } from './constants.js';
import type { SkillFrontMatter } from './parse.js';
import {
  validateClients,
  validateInjectBrief,
  validateInjectMode,
  validateInjectSections,
  validateMinConfidence,
  validateSummary,
  validateTags,
  validateTokenEstimate,
  validateTriggers,
  validateTtlSeconds,
} from './validate.js';

export function resolveSkillsMetaDir(skillsRoot: string): string {
  return path.join(path.dirname(path.resolve(skillsRoot)), 'skills-meta');
}

function overlayPath(skillsMetaDir: string, skillId: string): string {
  return path.join(skillsMetaDir, `${skillId}.yaml`);
}

export function loadSkillMetaOverlay(
  skillsMetaDir: string,
  skillId: string,
): Record<string, unknown> | null {
  const p = overlayPath(skillsMetaDir, skillId);
  if (!fs.existsSync(p)) return null;
  const stat = fs.statSync(p);
  if (stat.size > MAX_PRIMARY_BYTES) {
    throw new Error(
      `skills-meta overlay exceeds ${MAX_PRIMARY_BYTES} bytes: ${p}`,
    );
  }
  const raw = fs.readFileSync(p, 'utf8');
  const data = parseYaml(raw);
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`skills-meta overlay must be a YAML mapping: ${p}`);
  }
  const rec = data as Record<string, unknown>;
  if (rec['id'] !== undefined && rec['id'] !== skillId) {
    throw new Error(`overlay id "${rec['id']}" does not match filename skill id "${skillId}"`);
  }
  return rec;
}

/** Merge SkillPilot-specific fields from `.agents/skills-meta/<id>.yaml` into parsed meta. */
export function mergeSkillMetaOverlay(
  meta: SkillFrontMatter,
  overlay: Record<string, unknown>,
): SkillFrontMatter {
  const merged = { ...meta };

  if (overlay['summary'] !== undefined) {
    merged.summary = validateSummary(overlay['summary']);
  }
  if (overlay['tags'] !== undefined) {
    merged.tags = validateTags(overlay['tags']);
  }
  if (overlay['triggers'] !== undefined) {
    merged.triggers = validateTriggers(overlay['triggers']);
  }
  if (overlay['inject_sections'] !== undefined) {
    merged.inject_sections = validateInjectSections(overlay['inject_sections']);
  }
  if (overlay['inject_brief'] !== undefined) {
    merged.inject_brief = validateInjectBrief(overlay['inject_brief']);
  }
  if (overlay['token_estimate'] !== undefined) {
    merged.token_estimate = validateTokenEstimate(overlay['token_estimate']);
  }
  if (overlay['inject_mode_default'] !== undefined) {
    merged.inject_mode_default = validateInjectMode(overlay['inject_mode_default']);
  }
  if (overlay['inject'] !== undefined) {
    merged.inject = overlay['inject'] === true;
  }
  if (overlay['ttl_seconds'] !== undefined) {
    merged.ttl_seconds = validateTtlSeconds(overlay['ttl_seconds']);
  }
  if (overlay['min_confidence'] !== undefined) {
    merged.min_confidence = validateMinConfidence(overlay['min_confidence']);
  }
  if (overlay['version'] !== undefined && typeof overlay['version'] === 'string') {
    merged.version = overlay['version'];
  }
  if (overlay['clients'] !== undefined) {
    merged.clients = validateClients(overlay['clients']);
  }

  return merged;
}

export type ParseSkillOptions = {
  skillsMetaDir?: string;
};

export function applyMetaOverlay(
  meta: SkillFrontMatter,
  skillsMetaDir: string | undefined,
): SkillFrontMatter {
  if (!skillsMetaDir) return meta;
  const overlay = loadSkillMetaOverlay(skillsMetaDir, meta.id);
  if (!overlay) return meta;
  return mergeSkillMetaOverlay(meta, overlay);
}
