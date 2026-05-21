import {
  LOW_CONFIDENCE_THRESHOLD,
  MCP_DOMAIN_SCORE_CAP,
  PLAN_MIN_CONFIDENCE,
  SELECT_MIN_CONFIDENCE,
} from '../constants.js';
import type { SkillFrontMatter } from '../parse.js';
import type {
  PlanOptions,
  PlanResult,
  SelectOptions,
  SelectResult,
  SkillSelector,
} from './types.js';

const TOKEN_MIN_LEN = 2;

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= TOKEN_MIN_LEN);
}

function injectableCandidates(candidates: SkillFrontMatter[]): SkillFrontMatter[] {
  return candidates.filter((m) => m.inject !== false);
}

function isMcpSkill(meta: SkillFrontMatter): boolean {
  if (meta.tags?.includes('mcp')) return true;
  return meta.id.includes('-mcp-') || meta.id.startsWith('mcp-') || meta.id.endsWith('-mcp');
}

function queryHasMcpAnchor(queryLower: string, tokens: Set<string>): boolean {
  if (queryLower.includes('model context protocol')) return true;
  return tokens.has('mcp');
}

function hasExactTriggerHit(meta: SkillFrontMatter, queryLower: string): boolean {
  for (const trigger of meta.triggers ?? []) {
    if (queryLower.includes(trigger.toLowerCase())) return true;
  }
  return false;
}

function applyMcpDomainCap(
  meta: SkillFrontMatter,
  normalized: number,
  queryLower: string,
  tokens: Set<string>,
): number {
  if (!isMcpSkill(meta)) return normalized;
  if (hasExactTriggerHit(meta, queryLower)) return normalized;
  if (queryHasMcpAnchor(queryLower, tokens)) return normalized;
  return Math.min(normalized, MCP_DOMAIN_SCORE_CAP);
}

function scoreSkill(
  meta: SkillFrontMatter,
  tokens: Set<string>,
  queryLower: string,
  client?: string,
): { raw: number; normalized: number } {
  let exactTrigger = 0;
  let partialTrigger = 0;
  let tagMatch = 0;
  let titleOverlap = 0;
  let idMatch = 0;

  if (queryLower.includes(meta.id)) {
    idMatch = 1;
  } else {
    const parts = meta.id.split('-').filter((p) => p.length >= TOKEN_MIN_LEN);
    if (parts.length > 0) {
      const matched = parts.filter((p) => tokens.has(p)).length;
      if (matched === parts.length) idMatch = 0.85;
      else if (matched > 0) idMatch = 0.45 * (matched / parts.length);
    }
  }

  for (const trigger of meta.triggers ?? []) {
    const t = trigger.toLowerCase();
    if (queryLower.includes(t)) exactTrigger = 1;
    else {
      const parts = tokenize(t);
      if (parts.some((p) => tokens.has(p))) partialTrigger = Math.max(partialTrigger, 0.6);
    }
  }

  for (const tag of meta.tags ?? []) {
    if (tokens.has(tag)) tagMatch += 1;
    else if (tag.split('-').some((p) => p.length >= TOKEN_MIN_LEN && tokens.has(p))) {
      tagMatch += 0.5;
    }
  }

  for (const word of tokenize(meta.title)) {
    if (tokens.has(word)) titleOverlap += 1;
  }

  const raw =
    exactTrigger * 1.0 +
    partialTrigger * 0.6 +
    idMatch * 0.9 +
    Math.min(tagMatch, 3) * 0.3 +
    Math.min(titleOverlap, 3) * 0.1 +
    (client && meta.clients?.includes(client) ? 0.2 : 0);

  const maxPossible = 1.0 + 0.6 + 0.9 + 0.9 + 0.3 + 0.2;
  let normalized = Math.min(1, raw / maxPossible);
  normalized = applyMcpDomainCap(meta, normalized, queryLower, tokens);

  return { raw, normalized };
}

function buildRationale(meta: SkillFrontMatter, raw: number, tokens: Set<string>): string {
  const hits: string[] = [];
  for (const tag of meta.tags ?? []) {
    if (tokens.has(tag) || tag.split('-').some((p) => tokens.has(p))) hits.push(`tag:${tag}`);
  }
  if (hits.length === 0) {
    return `Selected "${meta.title}" (${meta.id}) with heuristic score ${raw.toFixed(2)}.`;
  }
  return `Selected "${meta.title}" (${meta.id}); matched ${hits.join(', ')}.`;
}

export function selectFromCandidates(
  candidates: SkillFrontMatter[],
  options: SelectOptions,
): SelectResult {
  const combined = [options.prompt, options.goal, options.context, options.workspace_path]
    .filter(Boolean)
    .join(' ');
  const queryLower = combined.toLowerCase();
  const tokens = new Set(tokenize(combined));
  const maxTokens = options.select_max_tokens ?? options.token_budget;
  const globalMin = options.selectMinConfidence ?? SELECT_MIN_CONFIDENCE;

  let pool = injectableCandidates(candidates);
  if (maxTokens !== undefined) {
    const within = pool.filter((m) => (m.token_estimate ?? 0) <= maxTokens);
    if (within.length === 0) {
      return {
        skill_id: null,
        confidence: 0,
        rationale: 'All candidates exceed select_max_tokens.',
        warnings: ['budget_exceeded'],
      };
    }
    pool = within;
  }

  const scored = pool
    .map((meta) => {
      const { raw, normalized } = scoreSkill(meta, tokens, queryLower, options.client);
      const minConf = meta.min_confidence ?? globalMin;
      return { meta, raw, normalized, minConf };
    })
    .filter((s) => s.normalized >= s.minConf)
    .sort((a, b) => {
      if (b.normalized !== a.normalized) return b.normalized - a.normalized;
      if (maxTokens !== undefined) {
        return (a.meta.token_estimate ?? 0) - (b.meta.token_estimate ?? 0);
      }
      return a.meta.id.localeCompare(b.meta.id);
    });

  const topK = Math.max(1, options.top_k ?? 1);
  const ranked: { skill_id: string; confidence: number }[] = scored
    .slice(0, topK)
    .map((s) => ({ skill_id: s.meta.id, confidence: Math.round(s.normalized * 1000) / 1000 }));

  if (scored.length === 0) {
    return {
      skill_id: null,
      confidence: 0,
      rationale: 'No skill matched the given prompt.',
      warnings: ['low_confidence'],
    };
  }

  const top = scored[0]!;
  const warnings: string[] = [];
  if (top.normalized < LOW_CONFIDENCE_THRESHOLD) warnings.push('low_confidence');
  if (scored[1] && scored[1].normalized === top.normalized) warnings.push('tie_with_alternative');

  return {
    skill_id: top.meta.id,
    confidence: Math.round(top.normalized * 1000) / 1000,
    rationale: buildRationale(top.meta, top.raw, tokens),
    ...(warnings.length ? { warnings } : {}),
    ...(topK > 1 && ranked.length > 1 ? { candidates: ranked, alternatives: ranked } : {}),
  };
}

export function planFromCandidates(
  candidates: SkillFrontMatter[],
  options: PlanOptions,
): PlanResult {
  const planMin = options.planMinConfidence ?? PLAN_MIN_CONFIDENCE;
  const selectMin = options.selectMinConfidence ?? SELECT_MIN_CONFIDENCE;

  const selectResult = selectFromCandidates(candidates, {
    prompt: options.goal,
    context: options.context,
    top_k: options.max_skills ?? 5,
    selectMinConfidence: selectMin,
  });

  const combined = [options.goal, options.context].filter(Boolean).join(' ');
  const queryLower = combined.toLowerCase();
  const tokens = new Set(tokenize(combined));

  const ranked = injectableCandidates(candidates)
    .map((meta) => {
      const { normalized } = scoreSkill(meta, tokens, queryLower);
      const minConf = Math.max(meta.min_confidence ?? selectMin, planMin);
      return { meta, normalized, minConf };
    })
    .filter((s) => s.normalized >= s.minConf)
    .sort((a, b) => b.normalized - a.normalized)
    .slice(0, options.max_skills ?? 5);

  const skills_needed = ranked.map((r) => r.meta.id);
  const suggestions = ranked.map((r) => ({
    skill_id: r.meta.id,
    confidence: Math.round(r.normalized * 1000) / 1000,
    summary: r.meta.summary,
  }));

  const topConfidence =
    ranked.length > 0 ? Math.round(ranked[0]!.normalized * 1000) / 1000 : null;

  return {
    deprecated: true as const,
    message:
      'Prefer agent planning + suggest_skills + begin_task(skill_id). skill_plan returns ranked suggestions only.',
    skills_needed,
    suggestions,
    estimated_tokens: 0,
    confidence: topConfidence ?? (selectResult.skill_id ? selectResult.confidence : null),
  };
}

export const heuristicSelector: SkillSelector = {
  select: selectFromCandidates,
  plan: planFromCandidates,
};
