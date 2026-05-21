import { randomUUID } from 'node:crypto';
import type { SkillingConfig } from './config.js';
import { CorrelationRegistry } from './correlation-registry.js';
import {
  DEFAULT_TTL_MS,
  DISCOVERY_TOKEN_BUDGET,
  MAX_SELECT_INPUT_CHARS,
} from './constants.js';
import { SkillingError } from './errors.js';
import { logToolOk } from './observability.js';
import type { SkillFrontMatter } from './parse.js';
import { resolveRepoRoot } from './repo-root.js';
import type { SelectResult } from './selector/types.js';
import { resolveInjectMode, shapeSkillBody, type InjectMode, type ShapeBodyResult } from './shape-body.js';
import {
  clearSession,
  isSessionActive,
  readActiveBody,
  readSession,
  type SkillSession,
  type SkillSessionWrite,
  writeActiveBody,
  writeSession,
} from './session-store.js';
import { buildSessionSummary, promptFingerprint } from './session-summary.js';
import { loadSkillBody } from './store.js';
import { isValidSkillId } from './validate.js';

const correlationRegistry = new CorrelationRegistry();

export type ResponseDetail = 'full' | 'summary';

export type LoadEpisodeResult = {
  skill_id: string;
  title: string;
  body: string;
  token_estimate: number;
  ttl_hint: number;
  ttl_ms: number;
  correlation_id: string;
  merge_hint: { role: 'system'; ephemeral: boolean };
  inject_mode: InjectMode;
  truncated?: boolean;
  omitted_code_blocks?: number;
};

export type BeginTaskInput = {
  prompt: string;
  goal?: string;
  context?: string;
  client?: string;
  workspace_path?: string;
  skill_id: string;
  phase?: string;
  token_budget?: number;
  inject_mode?: InjectMode;
  end_previous?: boolean;
  response_detail?: ResponseDetail;
};

export type BeginTaskResultFull = LoadEpisodeResult &
  Pick<SelectResult, 'confidence' | 'rationale' | 'warnings' | 'alternatives'> & {
    summary: string;
    previous_ended: boolean;
  };

export type BeginTaskResult = Omit<BeginTaskResultFull, 'alternatives'> &
  Partial<Pick<BeginTaskResultFull, 'alternatives'>>;

export type EndTaskResult = {
  ok: true;
  correlation_id: string;
  skill_id?: string;
  evicted_at?: string;
};

export type GetSessionOptions = {
  include_summary?: boolean;
  include_body?: boolean;
};

export type GetSessionResult =
  | { active: false; expired?: boolean }
  | {
      active: true;
      skill_id: string;
      correlation_id: string;
      ttl_ms: number;
      started_at: string;
      stale?: boolean;
      phase?: string;
      title?: string;
      summary?: string;
      rationale?: string;
      confidence?: number;
      warnings?: string[];
      body?: string;
    };

export function validateSkillIdForLoad(skill_id: string): string | null {
  if (!isValidSkillId(skill_id)) {
    return `Invalid skill_id (must match skill-rules §2): ${skill_id}. Call the list tool for valid ids.`;
  }
  if (skill_id.includes('..') || skill_id.includes('/') || skill_id.includes('\\')) {
    return 'skill_id must not contain path segments. Call the list tool for valid ids.';
  }
  return null;
}

function resolveTokenBudget(input: BeginTaskInput, config: SkillingConfig): number {
  if (input.token_budget !== undefined) return input.token_budget;
  const phase = input.phase?.trim().toLowerCase();
  if (phase === 'plan' || phase === 'discovery') return DISCOVERY_TOKEN_BUDGET;
  return config.defaultTokenBudget;
}

function ttlMsFromMeta(meta: { ttl_seconds?: number }, config: SkillingConfig): number {
  if (meta.ttl_seconds !== undefined && meta.ttl_seconds > 0) {
    return meta.ttl_seconds * 1000;
  }
  return config.ttlSeconds > 0 ? config.ttlSeconds * 1000 : DEFAULT_TTL_MS;
}

function loadAndShapeSkill(
  skillRoot: string,
  skillId: string,
  config: SkillingConfig,
  options?: { inject_mode?: InjectMode; token_budget?: number },
): { meta: SkillFrontMatter; shaped: ShapeBodyResult } {
  const err = validateSkillIdForLoad(skillId);
  if (err) throw new SkillingError('VALIDATION_ERROR', err);

  const { meta, body: rawBody } = loadSkillBody(skillRoot, skillId, config.skillsMetaDir);
  const mode = resolveInjectMode(
    options?.inject_mode,
    meta,
    options?.token_budget,
    config.defaultInjectMode,
  );
  const shaped = shapeSkillBody(rawBody, config.maxInjectBytes, {
    mode,
    meta: {
      title: meta.title,
      summary: meta.summary,
      inject_brief: meta.inject_brief,
    },
    injectSections: meta.inject_sections,
  });
  return { meta, shaped };
}

/** Shape skill body for display/read paths (get_session include_body). No registry or inject log. */
function readShapedSkillBody(
  skillRoot: string,
  skillId: string,
  config: SkillingConfig,
  options?: { inject_mode?: InjectMode; token_budget?: number },
): string {
  return loadAndShapeSkill(skillRoot, skillId, config, options).shaped.body;
}

function resolveSessionBody(
  skillRoot: string,
  repoRoot: string,
  session: SkillSession,
  config: SkillingConfig,
): string {
  const fromBridge = readActiveBody(repoRoot, session.skill_id);
  if (fromBridge !== null) return fromBridge;
  return readShapedSkillBody(skillRoot, session.skill_id, config, {
    inject_mode: session.inject_mode,
    token_budget: session.token_budget,
  });
}

/** Process-local correlation count (tests / diagnostics). */
export function getCorrelationRegistrySize(): number {
  return correlationRegistry.size;
}

export function loadSkillEpisode(
  skillRoot: string,
  skillId: string,
  config: SkillingConfig,
  correlationId?: string,
  options?: { inject_mode?: InjectMode; token_budget?: number },
): LoadEpisodeResult {
  const { meta, shaped } = loadAndShapeSkill(skillRoot, skillId, config, options);
  const correlation_id = correlationId ?? randomUUID();
  correlationRegistry.add(correlation_id);
  const ttl_ms = ttlMsFromMeta(meta, config);

  logToolOk('skill_inject', {
    skill_id: meta.id,
    correlation_id,
    token_estimate: shaped.token_estimate,
    inject_mode: shaped.inject_mode,
    version: meta.version,
  });

  return {
    skill_id: meta.id,
    title: meta.title,
    body: shaped.body,
    token_estimate: shaped.token_estimate,
    ttl_hint: Math.floor(ttl_ms / 1000),
    ttl_ms,
    correlation_id,
    merge_hint: { role: 'system', ephemeral: true },
    inject_mode: shaped.inject_mode,
    ...(shaped.truncated ? { truncated: shaped.truncated } : {}),
    ...(shaped.omitted_code_blocks ? { omitted_code_blocks: shaped.omitted_code_blocks } : {}),
  };
}

export function runCleanup(correlation_id: string): EndTaskResult {
  correlationRegistry.delete(correlation_id);
  return {
    ok: true,
    correlation_id,
    evicted_at: new Date().toISOString(),
  };
}

function shapeBeginTaskResult(
  full: BeginTaskResultFull,
  detail: ResponseDetail,
): BeginTaskResult {
  if (detail === 'full') return full;
  const { alternatives: _alternatives, ...rest } = full;
  return rest;
}

export function estimateShapedInjectTokens(
  skillRoot: string,
  skillId: string,
  config: SkillingConfig,
  tokenBudget: number,
): number {
  return loadAndShapeSkill(skillRoot, skillId, config, { token_budget: tokenBudget }).shaped
    .token_estimate;
}

export function beginTask(
  skillRoot: string,
  repoRoot: string,
  config: SkillingConfig,
  input: BeginTaskInput,
): BeginTaskResult {
  const trimmedPrompt = input.prompt.trim();
  if (!trimmedPrompt && !(input.goal?.trim())) {
    throw new SkillingError('VALIDATION_ERROR', 'begin_task requires a non-empty prompt or goal.');
  }
  if (
    input.prompt.length > MAX_SELECT_INPUT_CHARS ||
    (input.goal?.length ?? 0) > MAX_SELECT_INPUT_CHARS
  ) {
    throw new SkillingError(
      'VALIDATION_ERROR',
      `prompt and goal must each be at most ${MAX_SELECT_INPUT_CHARS} characters.`,
    );
  }

  const skillId = input.skill_id?.trim();
  if (!skillId) {
    throw new SkillingError(
      'VALIDATION_ERROR',
      'begin_task requires skill_id. Call list or suggest_skills to pick a skill, then retry with an explicit skill_id.',
    );
  }

  const err = validateSkillIdForLoad(skillId);
  if (err) throw new SkillingError('VALIDATION_ERROR', err);

  const responseDetail: ResponseDetail = input.response_detail ?? 'summary';
  const tokenBudget = resolveTokenBudget(input, config);
  const selectExtras: SelectResult = {
    skill_id: skillId,
    confidence: 1,
    rationale: 'skill_id provided by caller',
  };

  let previous_ended = false;
  if (input.end_previous !== false) {
    const prev = readSession(repoRoot);
    if (prev?.correlation_id) {
      if (isSessionActive(prev)) {
        runCleanup(prev.correlation_id);
        previous_ended = true;
      }
      clearSession(repoRoot);
    }
  }

  const episode = loadSkillEpisode(skillRoot, skillId, config, undefined, {
    inject_mode: input.inject_mode,
    token_budget: tokenBudget,
  });
  const summary = buildSessionSummary(episode.title, selectExtras.rationale);

  const sessionPayload: SkillSessionWrite = {
    skill_id: episode.skill_id,
    title: episode.title,
    summary,
    rationale: selectExtras.rationale,
    confidence: selectExtras.confidence,
    correlation_id: episode.correlation_id,
    ttl_ms: episode.ttl_ms,
    started_at: new Date().toISOString(),
    prompt_fingerprint: promptFingerprint(trimmedPrompt || input.goal!.trim(), input.goal),
    inject_mode: episode.inject_mode,
    token_budget: tokenBudget,
    ...(input.phase?.trim() ? { phase: input.phase.trim() } : {}),
  };
  writeSession(repoRoot, sessionPayload);
  writeActiveBody(repoRoot, episode.skill_id, episode.body);

  const full: BeginTaskResultFull = {
    ...episode,
    confidence: selectExtras.confidence,
    rationale: selectExtras.rationale,
    summary,
    previous_ended,
  };

  return shapeBeginTaskResult(full, responseDetail);
}

export function endTask(
  repoRoot: string,
  correlation_id?: string,
): EndTaskResult & { skill_id?: string } {
  const session = readSession(repoRoot);
  const passedId = correlation_id?.trim();
  if (session && passedId && passedId !== session.correlation_id) {
    throw new SkillingError(
      'VALIDATION_ERROR',
      'correlation_id does not match the active session. Omit correlation_id or pass the session correlation_id.',
    );
  }
  const id = passedId || session?.correlation_id;
  if (!id) {
    throw new SkillingError(
      'VALIDATION_ERROR',
      'No active session. Call begin_task first or pass correlation_id from the load response.',
    );
  }
  const result = runCleanup(id);
  clearSession(repoRoot);
  return { ...result, skill_id: session?.skill_id };
}

export function getSession(
  skillRoot: string,
  repoRoot: string,
  config: SkillingConfig,
  options?: GetSessionOptions,
): GetSessionResult {
  const session = readSession(repoRoot);
  if (!session) return { active: false };

  if (!isSessionActive(session)) {
    if (session.correlation_id) {
      runCleanup(session.correlation_id);
    }
    clearSession(repoRoot);
    return { active: false, expired: true };
  }

  const includeSummary = options?.include_summary !== false;
  const includeBody = options?.include_body === true;
  const startedMs = Date.parse(session.started_at);
  const stale =
    !Number.isNaN(startedMs) && Date.now() - startedMs > session.ttl_ms * 0.8;

  const base: GetSessionResult = {
    active: true,
    skill_id: session.skill_id,
    correlation_id: session.correlation_id,
    ttl_ms: session.ttl_ms,
    started_at: session.started_at,
    ...(stale ? { stale: true } : {}),
    ...(session.phase ? { phase: session.phase } : {}),
    ...(includeSummary
      ? {
          title: session.title,
          summary: session.summary,
          rationale: session.rationale,
          confidence: session.confidence,
          ...(session.warnings?.length ? { warnings: session.warnings } : {}),
        }
      : {}),
  };

  if (includeBody) {
    return {
      ...base,
      body: resolveSessionBody(skillRoot, repoRoot, session, config),
    };
  }

  return base;
}

export function resolveRepoRootFromSkillRoot(skillRoot: string): string {
  return resolveRepoRoot(skillRoot);
}
