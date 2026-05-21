import type { SkillPilotConfig } from '../config.js';
import { logEvent } from '../observability.js';
import { heuristicSelector } from './heuristic.js';
import type { SkillSelector } from './types.js';

let selectorModeWarned = false;

export function getSelector(config: SkillPilotConfig): SkillSelector {
  if (
    !selectorModeWarned &&
    config.selector !== 'heuristic'
  ) {
    selectorModeWarned = true;
    logEvent('warn', 'skill_select', {
      message: `SKILLPILOT_SELECTOR=${config.selector} is not implemented; using heuristic selector.`,
    });
  }
  return heuristicSelector;
}

export * from './types.js';
export { heuristicSelector, selectFromCandidates, planFromCandidates } from './heuristic.js';
