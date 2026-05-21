/** Skill id: lowercase slug, 3–64 chars, segments separated by single hyphens. */
export const SKILL_ID_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SKILL_ID_MIN = 3;
export const SKILL_ID_MAX = 64;

/** Entire SKILL.md on disk (skill-rules §8; ecosystem skills may be larger — inject capped separately) */
export const MAX_PRIMARY_BYTES = 256 * 1024;
/** Body after front matter strip (skill-rules §8) */
export const MAX_BODY_BYTES = 192 * 1024;

/** Max shaped inject payload (SPEC default) */
export const MAX_INJECT_BYTES = 8192;

/** Default inject token budget when caller omits token_budget (implementation stage). */
export const DEFAULT_TOKEN_BUDGET = 900;

/** Discovery/plan phase inject budget when phase hints apply. */
export const DISCOVERY_TOKEN_BUDGET = 300;

/** Hint for hosts (ms); overridden by ttl_seconds in front matter */
export const DEFAULT_TTL_MS = 300_000;

/** Max in-flight correlation_ids tracked server-side (FIFO eviction on load). */
export const MAX_CORRELATION_REGISTRY = 1024;

/** Max characters for select prompt / goal inputs. */
export const MAX_SELECT_INPUT_CHARS = 8_000;

/** Minimum normalized confidence to appear in suggest_skills candidates list. */
export const SUGGEST_DISPLAY_MIN = 0.15;

/** Minimum normalized confidence for top skill_id in suggest_skills. */
export const SELECT_MIN_CONFIDENCE = 0.25;

/** Minimum normalized confidence for skill_plan skills_needed / included suggestions. */
export const PLAN_MIN_CONFIDENCE = 0.35;

/** Normalized score below this triggers low_confidence warning on select/begin_task. */
export const LOW_CONFIDENCE_THRESHOLD = 0.35;

/** Cap for MCP-tagged skills when query lacks MCP domain anchors. */
export const MCP_DOMAIN_SCORE_CAP = 0.15;

/** Legacy raw score floor (kept for tests that use raw scores in alternatives). */
export const SELECT_MIN_SCORE = 2;
