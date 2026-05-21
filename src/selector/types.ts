import type { SkillFrontMatter } from '../parse.js';

export type SelectOptions = {
  prompt: string;
  goal?: string;
  context?: string;
  client?: string;
  workspace_path?: string;
  /** Optional cap on metadata token_estimate when ranking candidates. Omit to allow any skill. */
  select_max_tokens?: number;
  /** @deprecated Use select_max_tokens — does not affect inject shaping. */
  token_budget?: number;
  top_k?: number;
  selectMinConfidence?: number;
  planMinConfidence?: number;
};

export type SelectAlternative = {
  skill_id: string;
  confidence: number;
};

export type SelectResult = {
  skill_id: string | null;
  confidence: number;
  rationale: string;
  warnings?: string[];
  weak_candidates?: boolean;
  candidates?: SelectAlternative[];
  /** @deprecated use candidates */
  alternatives?: SelectAlternative[];
};

export type PlanSuggestion = {
  skill_id: string;
  confidence: number;
  summary: string;
  included: boolean;
  inject_token_estimate?: number;
};

export type PlanOptions = {
  goal: string;
  context?: string;
  max_skills?: number;
  selectMinConfidence?: number;
  planMinConfidence?: number;
};

export type PlanResult = {
  deprecated: true;
  message: string;
  skills_needed: string[];
  suggestions: PlanSuggestion[];
  estimated_tokens: number;
  confidence: number | null;
  weak_candidates?: boolean;
};

export interface SkillSelector {
  select(candidates: SkillFrontMatter[], options: SelectOptions): SelectResult;
  plan(candidates: SkillFrontMatter[], options: PlanOptions): PlanResult;
}
