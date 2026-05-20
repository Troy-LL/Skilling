import {
  MAX_BODY_BYTES,
  MAX_PRIMARY_BYTES,
  SKILL_ID_MAX,
  SKILL_ID_MIN,
  SKILL_ID_REGEX,
} from './constants.js';

export function isValidSkillId(id: string): boolean {
  return id.length >= SKILL_ID_MIN && id.length <= SKILL_ID_MAX && SKILL_ID_REGEX.test(id);
}

const TAG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function assertNoNullBytes(buf: Buffer, label: string): void {
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0) {
      throw new Error(`${label}: NUL byte not allowed`);
    }
  }
}

export function validateTitle(title: unknown): string {
  if (typeof title !== 'string' || title.length < 1 || title.length > 120) {
    throw new Error('title must be a string of length 1–120');
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(title)) {
    throw new Error('title must not contain ASCII control characters');
  }
  return title;
}

export function validateSummary(summary: unknown): string {
  if (typeof summary !== 'string' || summary.length < 1 || summary.length > 300) {
    throw new Error('summary must be a string of length 1–300');
  }
  if (summary.includes('\n') || summary.includes('\r')) {
    throw new Error('summary must be a single line');
  }
  if (/^\s*#/.test(summary)) {
    throw new Error('summary must not look like a markdown heading');
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(summary)) {
    throw new Error('summary must not contain ASCII control characters');
  }
  return summary;
}

export function validateTags(tags: unknown): string[] | undefined {
  if (tags === undefined || tags === null) return undefined;
  if (!Array.isArray(tags)) throw new Error('tags must be an array of strings');
  if (tags.length > 20) throw new Error('tags: max 20 entries');
  const out: string[] = [];
  for (const t of tags) {
    if (typeof t !== 'string' || t.length < 2 || t.length > 32 || !TAG_REGEX.test(t)) {
      throw new Error('tags: each entry must be 2–32 chars, lowercase a-z digits hyphens');
    }
    out.push(t);
  }
  return out;
}

export function validateVersion(version: unknown): string | undefined {
  if (version === undefined || version === null) return undefined;
  if (typeof version !== 'string' || version.length < 1 || version.length > 64) {
    throw new Error('version must be a non-empty string up to 64 chars');
  }
  return version;
}

export function validateTriggers(triggers: unknown): string[] | undefined {
  if (triggers === undefined || triggers === null) return undefined;
  if (!Array.isArray(triggers)) throw new Error('triggers must be an array of strings');
  if (triggers.length > 10) throw new Error('triggers: max 10 entries');
  const out: string[] = [];
  for (const t of triggers) {
    if (typeof t !== 'string' || t.length < 1 || t.length > 64) {
      throw new Error('triggers: each entry must be a string of length 1–64');
    }
    out.push(t);
  }
  return out;
}

export function validateTokenEstimate(token_estimate: unknown): number | undefined {
  if (token_estimate === undefined || token_estimate === null) return undefined;
  if (typeof token_estimate !== 'number' || !Number.isInteger(token_estimate) || token_estimate < 1) {
    throw new Error('token_estimate must be a positive integer');
  }
  return token_estimate;
}

export function validateInject(inject: unknown): boolean | undefined {
  if (inject === undefined || inject === null) return undefined;
  if (typeof inject !== 'boolean') throw new Error('inject must be a boolean');
  return inject;
}

export function validateTtlSeconds(ttl_seconds: unknown): number | undefined {
  if (ttl_seconds === undefined || ttl_seconds === null) return undefined;
  if (typeof ttl_seconds !== 'number' || !Number.isInteger(ttl_seconds) || ttl_seconds < 0) {
    throw new Error('ttl_seconds must be a non-negative integer');
  }
  return ttl_seconds;
}

const INJECT_MODES = new Set(['full', 'summary', 'compact', 'sections']);

export function validateInjectMode(mode: unknown): 'full' | 'summary' | 'compact' | 'sections' | undefined {
  if (mode === undefined || mode === null) return undefined;
  if (typeof mode !== 'string' || !INJECT_MODES.has(mode)) {
    throw new Error('inject_mode_default must be one of: full, summary, compact, sections');
  }
  return mode as 'full' | 'summary' | 'compact' | 'sections';
}

export function validateInjectSections(sections: unknown): string[] | undefined {
  if (sections === undefined || sections === null) return undefined;
  if (!Array.isArray(sections)) throw new Error('inject_sections must be an array of strings');
  if (sections.length > 12) throw new Error('inject_sections: max 12 entries');
  const out: string[] = [];
  for (const s of sections) {
    if (typeof s !== 'string' || s.length < 2 || s.length > 80) {
      throw new Error('inject_sections: each entry must be a string of length 2–80');
    }
    out.push(s.trim());
  }
  return out;
}

export function validateInjectBrief(brief: unknown): string | undefined {
  if (brief === undefined || brief === null) return undefined;
  if (typeof brief !== 'string' || brief.length < 1 || brief.length > 1200) {
    throw new Error('inject_brief must be a string of length 1–1200');
  }
  if (brief.includes('\r')) throw new Error('inject_brief must use \\n line endings only');
  return brief;
}

export function validateMinConfidence(min_confidence: unknown): number | undefined {
  if (min_confidence === undefined || min_confidence === null) return undefined;
  if (typeof min_confidence !== 'number' || min_confidence < 0 || min_confidence > 1) {
    throw new Error('min_confidence must be a number between 0 and 1');
  }
  return min_confidence;
}

export function validateClients(clients: unknown): string[] | undefined {
  if (clients === undefined || clients === null) return undefined;
  if (!Array.isArray(clients)) throw new Error('clients must be an array of strings');
  if (clients.length > 20) throw new Error('clients: max 20 entries');
  const out: string[] = [];
  for (const c of clients) {
    if (typeof c !== 'string' || !TAG_REGEX.test(c) || c.length < 2 || c.length > 32) {
      throw new Error('clients: each entry must match tag charset and length (skill-rules §6.2)');
    }
    out.push(c);
  }
  return out;
}

export function validatePrimarySize(buf: Buffer): void {
  assertNoNullBytes(buf, 'SKILL.md');
  if (buf.length > MAX_PRIMARY_BYTES) {
    throw new Error(`SKILL.md exceeds ${MAX_PRIMARY_BYTES} bytes (skill-rules §8)`);
  }
}

export function validateBodyUtf8Length(body: string): void {
  const bodyBytes = Buffer.byteLength(body, 'utf8');
  if (bodyBytes > MAX_BODY_BYTES) {
    throw new Error(`body exceeds ${MAX_BODY_BYTES} bytes after front matter (skill-rules §8)`);
  }
}
