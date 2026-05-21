import type { SkillFrontMatter } from '../parse.js';

export type SelectOptions = {
  prompt: string;
  goal?: string;
  context?: string;
  client?: string;
  workspace_path?: string;
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
  candidates?: SelectAlternative[];
  /** @deprecated use candidates */
  alternatives?: SelectAlternative[];
};

export type PlanStep = {
  step: number;
  description: string;
  skill_id: string | null;
  rationale: string;
};

export type PlanOptions = {
  goal: string;
  context?: string;
  max_skills?: number;
  selectMinConfidence?: number;
  planMinConfidence?: number;
};

export type PlanResult = {
  plan: PlanStep[];
  skills_needed: string[];
  estimated_tokens: number;
  confidence: number | null;
};

export interface SkillSelector {
  select(candidates: SkillFrontMatter[], options: SelectOptions): SelectResult;
  plan(candidates: SkillFrontMatter[], options: PlanOptions): PlanResult;
}
