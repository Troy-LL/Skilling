import type { SkillPilotConfig } from '../config.js';
import { logEvent } from '../observability.js';
import { planFromCandidates, selectFromCandidates } from './heuristic.js';
import type { SkillSelector } from './types.js';

let selectorModeWarned = false;

export function getSelector(config: SkillPilotConfig): SkillSelector {
  if (!selectorModeWarned && config.selector !== 'heuristic') {
    selectorModeWarned = true;
    logEvent('warn', 'skill_select', {
      message: `SKILLPILOT_SELECTOR=${config.selector} is not implemented; using heuristic selector.`,
    });
  }
  return {
    select: (candidates, options) =>
      selectFromCandidates(candidates, {
        ...options,
        selectMinConfidence: options.selectMinConfidence ?? config.selectMinConfidence,
      }),
    plan: (candidates, options) =>
      planFromCandidates(candidates, {
        ...options,
        selectMinConfidence: options.selectMinConfidence ?? config.selectMinConfidence,
        planMinConfidence: options.planMinConfidence ?? config.planMinConfidence,
      }),
  };
}

export * from './types.js';
export { heuristicSelector, selectFromCandidates, planFromCandidates } from './heuristic.js';
