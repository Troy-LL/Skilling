# Context engineering with Skilling

Skilling is built to push **inference-time** skill cost toward Skill0-style efficiency (filtered, small, evicted) without training a model. This guide is the practical ladder.

## The cost ladder

| Level | What the agent holds | Typical tokens | When |
|-------|----------------------|----------------|------|
| **0 — Catalog** | `list` output (on demand) | ~280 | Pick valid skill_ids |
| **1 — Suggest** | `suggest_skills` result (no inject) | ~0 in context if MCP-only | Optional ranked hints |
| **2 — Summary inject** | `inject_mode: summary` | ~50–150 | Tight context; skill is familiar |
| **3 — Section inject** | `inject_mode: sections` | ~200–600 | Need procedure, not examples |
| **4 — Compact inject** | `inject_mode: compact` | ~400–1200 | Default for large ecosystem skills |
| **5 — Full inject** | `inject_mode: full` | up to `MAX_INJECT_BYTES` | First time on a complex skill |

**Rule:** Start low, escalate only when the model stalls.

## Agent workflow (recommended)

1. **`list`** when you need installed skill IDs (~280 tokens).
2. **`begin_task(find-skills, token_budget=300)`** for ecosystem discovery (~72 tokens shaped).
3. **`suggest_skills`** (optional) for ranked hints — agent picks **`skill_id`**.
4. Per stage: **`begin_task(skill_id, token_budget=900)`** → follow body → **`end_task`** (required before next skill/topic).
5. If shaped inject is too thin, **`load`** same `skill_id` with `inject_mode: full` once — then **`end_task`**.

### `token_budget` auto depth (inject only)

When `inject_mode` is omitted:

| `token_budget` | Default inject |
|----------------|----------------|
| &lt; 350 | `summary` |
| 350–899 | `compact` |
| ≥ 900 | skill `inject_mode_default` or config default |

Precedence: explicit `inject_mode` → `token_budget` heuristics → skill `inject_mode_default` (budget ≥ 900) → config default.

`token_budget` does **not** filter which skills you can select — use `select_max_tokens` on `suggest_skills` if needed.

### Compact tradeoffs

`compact` strips fenced code blocks and may truncate at 8 KB. Good for procedures; lossy for template-heavy skills. Response includes `truncated` and `omitted_code_blocks` when applicable. Bump to `inject_mode: full` when examples matter.

## Metadata overlays (ecosystem skills)

Upstream skills under **`.agents/skills/<id>/SKILL.md`** are often updated by `npx skills add` / `npx skills update`. **Do not** patch their bodies for Skilling-specific fields.

Instead, add **`.agents/skills-meta/<id>.yaml`** next to the skill catalog:

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
- Set **`token_estimate`** honestly in metadata; it does not block selection unless you pass **`select_max_tokens`** on `suggest_skills`.

## What Skilling does not do (yet)

- **Δk helpfulness filtering** (Skill0 Dynamic Curriculum) — planned v2 via `skill_feedback`.
- **Visual compression** of history — out of scope; use host-side summarization.
- **Internalize skills into weights** — requires SkillZero-style training, not MCP.

Skilling **does** collect the right habits for that path: plan-first, tiered load, shaped inject, cleanup.

## Config

`Skilling.config.json.example`:

```json
{
  "defaultInjectMode": "compact",
  "maxInjectBytes": 8192,
  "defaultTokenBudget": 900
}
```

Env: `SKILLING_DEFAULT_INJECT_MODE=compact`
