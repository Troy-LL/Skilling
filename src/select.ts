import type { SkillFrontMatter } from './parse.js';
import { SELECT_MIN_SCORE } from './constants.js';

export type SelectInput = {
  prompt: string;
  goal?: string;
  client?: string;
  workspace_path?: string;
};

export type SelectAlternative = {
  skill_id: string;
  score: number;
};

export type SelectResult = {
  skill_id: string | null;
  confidence: number;
  rationale: string;
  warnings?: string[];
  alternatives?: SelectAlternative[];
};

const TOKEN_MIN_LEN = 2;

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= TOKEN_MIN_LEN);
}

function scoreSkill(meta: SkillFrontMatter, tokens: Set<string>, queryLower: string, client?: string): number {
  let score = 0;

  for (const tag of meta.tags ?? []) {
    if (tokens.has(tag)) score += 3;
    for (const part of tag.split('-')) {
      if (part.length >= TOKEN_MIN_LEN && tokens.has(part)) score += 2;
    }
  }

  for (const word of tokenize(meta.title)) {
    if (tokens.has(word)) score += 2;
  }

  for (const word of tokenize(meta.summary)) {
    if (tokens.has(word)) score += 1;
  }

  for (const seg of meta.id.split('-')) {
    if (seg.length >= TOKEN_MIN_LEN && tokens.has(seg)) score += 1;
  }

  for (const trigger of meta.triggers ?? []) {
    if (queryLower.includes(trigger.toLowerCase())) score += 2;
  }

  if (client && meta.clients?.includes(client)) {
    score += 2;
  }

  return score;
}

export function selectSkill(candidates: SkillFrontMatter[], input: SelectInput): SelectResult {
  const combined = [input.prompt, input.goal, input.workspace_path].filter(Boolean).join(' ');
  const queryLower = combined.toLowerCase();
  const tokens = new Set(tokenize(combined));

  const scored = candidates
    .map((meta) => ({
      meta,
      score: scoreSkill(meta, tokens, queryLower, input.client),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.meta.id.localeCompare(b.meta.id);
    });

  const alternatives: SelectAlternative[] = scored
    .filter((s) => s.score > 0)
    .slice(0, 3)
    .map((s) => ({ skill_id: s.meta.id, score: s.score }));

  const top = scored[0];
  if (!top || top.score < SELECT_MIN_SCORE) {
    return {
      skill_id: null,
      confidence: 0,
      rationale:
        'No skill matched strongly enough for this prompt. Agent: pass skill_id to begin_task, ingest a matching skill, or improve skill tags/triggers — do not present a skill menu to the user.',
      warnings: ['low_confidence'],
      alternatives: alternatives.length ? alternatives : undefined,
    };
  }

  const second = scored[1]?.score ?? 0;
  const confidence = Math.min(1, top.score / (top.score + second + 1));

  const warnings: string[] = [];
  if (confidence < 0.35 || top.score < 4) {
    warnings.push('low_confidence');
  }
  if (scored[1] && scored[1].score === top.score) {
    warnings.push('tie_with_alternative');
  }

  const rationale = buildRationale(top.meta, top.score, tokens);

  return {
    skill_id: top.meta.id,
    confidence: Math.round(confidence * 1000) / 1000,
    rationale,
    ...(warnings.length ? { warnings } : {}),
    alternatives: alternatives.length > 1 ? alternatives : undefined,
  };
}

function buildRationale(meta: SkillFrontMatter, score: number, tokens: Set<string>): string {
  const hits: string[] = [];
  for (const tag of meta.tags ?? []) {
    if (tokens.has(tag) || tag.split('-').some((p) => tokens.has(p))) hits.push(`tag:${tag}`);
  }
  if (hits.length === 0) {
    return `Selected "${meta.title}" (${meta.id}) with heuristic score ${score}.`;
  }
  return `Selected "${meta.title}" (${meta.id}) with score ${score}; matched ${hits.join(', ')}.`;
}
