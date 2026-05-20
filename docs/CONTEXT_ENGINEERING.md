# Context engineering with SkillPilot

SkillPilot is built to push **inference-time** skill cost toward Skill0-style efficiency (filtered, small, evicted) without training a model. This guide is the practical ladder.

## The cost ladder

| Level | What the agent holds | Typical tokens | When |
|-------|----------------------|----------------|------|
| **0 — Plan** | `skill_plan` output only | ~200–800 | Multi-step work; no bodies yet |
| **1 — Select** | Tier 1 summaries (in tool result, not pasted into chat) | ~0 in context if you trust MCP | Routing decision |
| **2 — Summary inject** | `inject_mode: summary` | ~50–150 | Tight context; skill is familiar |
| **3 — Section inject** | `inject_mode: sections` | ~200–600 | Need procedure, not examples |
| **4 — Compact inject** | `inject_mode: compact` | ~400–1200 | Default for large ecosystem skills |
| **5 — Full inject** | `inject_mode: full` | up to `MAX_INJECT_BYTES` | First time on a complex skill |

**Rule:** Start low, escalate only when the model stalls.

## Agent workflow (recommended)

1. **`skill_plan`** with the goal — note `skills_needed` and `estimated_tokens`.
2. **`begin_task`** with `token_budget` set to your remaining headroom (e.g. 800).
3. If the returned `inject_mode` is `summary` or `compact` and work fails, **`load`** the same `skill_id` with `inject_mode: full` once — then **`end_task`** when done.
4. **`end_task`** before the next unrelated topic (frees ongoing step cost).

### `token_budget` auto depth

When `inject_mode` is omitted:

| `token_budget` | Default inject |
|----------------|----------------|
| &lt; 350 | `summary` |
| 350–899 | `compact` |
| ≥ 900 | `full` (or skill `inject_mode_default`) |

Override anytime with explicit `inject_mode` on `begin_task` / `load`.

## Metadata overlays (ecosystem skills)

Upstream skills under **`.agents/skills/<id>/SKILL.md`** are often updated by `npx skills add` / `npx skills update`. **Do not** patch their bodies for SkillPilot-specific fields.

Instead, add **`.agents/skills-meta/<id>.yaml`** (sibling of `skills/`):

```yaml
tags: [mcp, server]
triggers:
  - build an mcp server
inject_mode_default: compact
inject_brief: "Short bullets for summary-tier inject."
```

The parser merges overlays at index/load time. **`token_estimate`** defaults to the **body** size when omitted; overlays may override.

## Skill authoring for lean inject

Add to front matter:

```yaml
summary: "One line, ≤120 chars — used for selection and summary inject."
inject_brief: "3–5 imperative bullets; used instead of summary in summary mode."
inject_mode_default: compact
inject_sections:
  - Procedure
  - When to use
```

- Put long examples and reference tables in `<!-- internal-only -->` blocks.
- Keep **procedure** in clear `## Procedure` / `## When to use` headings for `sections` mode.
- Set **`token_estimate`** honestly so `token_budget` filtering works.

## What SkillPilot does not do (yet)

- **Δk helpfulness filtering** (Skill0 Dynamic Curriculum) — planned v2 via `skill_feedback`.
- **Visual compression** of history — out of scope; use host-side summarization.
- **Internalize skills into weights** — requires SkillZero-style training, not MCP.

SkillPilot **does** collect the right habits for that path: plan-first, tiered load, shaped inject, cleanup.

## Config

`skillpilot.config.json.example`:

```json
{
  "defaultInjectMode": "compact",
  "maxInjectBytes": 8192,
  "defaultTokenBudget": 2048
}
```

Env: `SKILLPILOT_DEFAULT_INJECT_MODE=compact`
