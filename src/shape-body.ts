import { MAX_INJECT_BYTES } from './constants.js';
import { SkillPilotError } from './errors.js';
import { estimateTokens } from './token-estimate.js';

const INTERNAL_ONLY_RE =
  /<!--\s*internal-only\s*-->[\s\S]*?<!--\s*\/internal-only\s*-->/gi;

const ACTIVATION_HEADER =
  '> The following skill applies only to the current task. Discard after task completion.\n\n';

const TRUNCATE_SUFFIX =
  '\n\n---\n*(Truncated to inject budget. Call load/begin_task with inject_mode=full for the complete skill.)*';

const DEFAULT_SECTION_HEADINGS = ['procedure', 'when to use', 'steps', 'workflow'];

export type InjectMode = 'full' | 'summary' | 'compact' | 'sections';

export type ShapeBodyMeta = {
  title: string;
  summary: string;
  inject_brief?: string;
};

export type ShapeBodyOptions = {
  mode?: InjectMode;
  maxInjectBytes?: number;
  meta?: ShapeBodyMeta;
  injectSections?: string[];
};

export type ShapeBodyResult = {
  body: string;
  token_estimate: number;
  bytes: number;
  inject_mode: InjectMode;
};

export function stripInternalOnlySections(body: string): string {
  return body.replace(INTERNAL_ONLY_RE, '').trim();
}

function compactMarkdown(body: string): string {
  let s = stripInternalOnlySections(body);
  s = s.replace(/```[\s\S]*?```/g, '\n*[code block omitted — use inject_mode=full if needed]*\n');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

function truncateToBytes(text: string, maxBytes: number, suffix: string): string {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text;
  const suffixBytes = Buffer.byteLength(suffix, 'utf8');
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (Buffer.byteLength(text.slice(0, mid), 'utf8') + suffixBytes <= maxBytes) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + suffix;
}

/** Extract markdown sections by ## / ### heading title (case-insensitive). */
export function extractSectionsByHeading(body: string, sectionNames: string[]): string {
  const want = new Set(sectionNames.map((n) => n.trim().toLowerCase()).filter(Boolean));
  if (want.size === 0) return stripInternalOnlySections(body);

  const lines = body.split(/\r?\n/);
  const parts: string[] = [];
  let capturing = false;
  let current: string[] = [];
  let currentName = '';

  const flush = () => {
    if (capturing && current.length > 0) {
      parts.push(`## ${currentName}\n${current.join('\n').trim()}`);
    }
    capturing = false;
    current = [];
    currentName = '';
  };

  for (const line of lines) {
    const hm = line.match(/^(#{2,3})\s+(.+)$/);
    if (hm) {
      flush();
      const name = hm[2]!.trim();
      if (want.has(name.toLowerCase())) {
        capturing = true;
        currentName = name;
      }
      continue;
    }
    if (capturing) current.push(line);
  }
  flush();

  return parts.join('\n\n').trim();
}

function buildSummaryBody(meta: ShapeBodyMeta): string {
  const core = meta.inject_brief?.trim() || meta.summary;
  return `# ${meta.title}\n\n${core}\n\n*(Summary-tier inject only. Use inject_mode=compact or full for procedures and examples.)*`;
}

function prepareRawBody(rawBody: string, mode: InjectMode, options: ShapeBodyOptions): string {
  switch (mode) {
    case 'summary':
      if (!options.meta) {
        throw new SkillPilotError(
          'VALIDATION_ERROR',
          'inject_mode=summary requires skill metadata (title/summary).',
        );
      }
      return buildSummaryBody(options.meta);
    case 'compact':
      return compactMarkdown(rawBody);
    case 'sections': {
      const names =
        options.injectSections && options.injectSections.length > 0
          ? options.injectSections
          : DEFAULT_SECTION_HEADINGS;
      const extracted = extractSectionsByHeading(rawBody, names);
      return extracted.length > 0 ? extracted : compactMarkdown(rawBody);
    }
    default:
      return stripInternalOnlySections(rawBody);
  }
}

export function shapeSkillBody(
  rawBody: string,
  maxInjectBytes: number = MAX_INJECT_BYTES,
  options: ShapeBodyOptions = {},
): ShapeBodyResult {
  const mode = options.mode ?? 'full';
  const prepared = prepareRawBody(rawBody, mode, options);
  let body = ACTIVATION_HEADER + prepared;
  let bytes = Buffer.byteLength(body, 'utf8');

  if (bytes > maxInjectBytes && (mode === 'compact' || mode === 'sections')) {
    body = ACTIVATION_HEADER + truncateToBytes(prepared, maxInjectBytes - Buffer.byteLength(ACTIVATION_HEADER, 'utf8'), TRUNCATE_SUFFIX);
    bytes = Buffer.byteLength(body, 'utf8');
  }

  if (bytes > maxInjectBytes) {
    throw new SkillPilotError(
      'BODY_TOO_LARGE',
      `Shaped body is ${bytes} bytes (inject_mode=${mode}); max inject is ${maxInjectBytes} bytes. Try inject_mode=summary, compact, or sections.`,
    );
  }

  return {
    body,
    token_estimate: estimateTokens(body),
    bytes,
    inject_mode: mode,
  };
}

/** Pick inject depth from explicit mode, skill default, or token_budget heuristics. */
export function resolveInjectMode(
  explicit: InjectMode | undefined,
  meta: { inject_mode_default?: InjectMode; token_estimate?: number },
  tokenBudget: number | undefined,
  configDefault: InjectMode = 'full',
): InjectMode {
  if (explicit) return explicit;
  if (meta.inject_mode_default) return meta.inject_mode_default;
  if (tokenBudget !== undefined) {
    if (tokenBudget < 350) return 'summary';
    if (tokenBudget < 900) return 'compact';
  }
  return configDefault;
}
