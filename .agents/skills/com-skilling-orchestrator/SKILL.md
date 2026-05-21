---
id: com-skilling-orchestrator
title: Skilling task orchestration
summary: Portable SOP — list, suggest_skills, begin_task(skill_id), end_task per dev stage.
tags:
  - skilling
  - workflow
  - routing
version: 2.1.1
triggers:
  - begin task
  - skilling
  - end task
  - skill plan
token_estimate: 800
ttl_seconds: 1800
---

## When to use

Apply when the host has Skilling MCP and you need a repeatable **catalog → pick skill_id → inject → work → evict** loop across development stages.

**Not for:** reading skill files from disk — use MCP tools. Ecosystem install flows use **`find-skills`** via `begin_task(find-skills, 300)`.

Skills live under **`.agents/skills/`** (`SKILL_ROOT`).

## Budget ladder

| Stage | `token_budget` | Typical inject |
|-------|----------------|----------------|
| discovery / plan | 300 | summary |
| implement | 900 | compact |

Pass explicit `inject_mode` to override. Compact omits code blocks — use `full` when templates matter.

## Procedure

1. Call **`list`** when you need installed skill IDs (~280 tokens tier-0 catalog).
2. For ecosystem discovery, call **`begin_task`** with `skill_id: "find-skills"` and `token_budget: 300`.
3. **Pick `skill_id`** from your plan or the catalog. Optionally call **`suggest_skills`** for ranked hints (no inject).
4. Per stage: **`begin_task(skill_id, token_budget=900)`** → follow shaped **`body`** → **`end_task`** (required before next skill or topic).
5. Do **not** rely on silent auto-routing for build tasks.

If **`.skilling/active-body.md`** exists, follow it for this turn. Otherwise call **`get_session`** — if `active: false`, start step 4 with an explicit `skill_id`.

## Staged chunks (large skills)

Monster skills are split into stage-specific chunk ids. Route one chunk per stage:

```text
mcp-builder-overview → mcp-builder-implementation → mcp-builder-evaluation
skill-creator-authoring → skill-creator-eval → skill-creator-benchmark
create-hook-workflow → create-hook-templates → create-hook-testing
```

Example: user asks to build an MCP server — `begin_task(mcp-builder-overview, 900)` → work → `end_task` → `begin_task(mcp-builder-implementation, 900)` → … Legacy monolith ids (`mcp-builder`, `skill-creator`, `create-hook`) are catalog-only; use chunk ids for inject.

## Session staleness

**`get_session`** returns **`stale: true`** when TTL is past 80% elapsed. Refresh with **`begin_task(skill_id)`** or **`end_task`** before switching topics.

## User-facing presentation

- After `begin_task`: reply with **one sentence** using `summary` from the tool or session.
- **Never** show `candidates`, skill menus, raw score tables, or `list` output unless the user asked.

## End or switch tasks

- **`end_task`** is required before switching topic or skill.
- `end_previous: true` (default) clears session files — not necessarily all host context.

## Deprecated

- **`skill_plan`** — prefer agent planning + `suggest_skills` + `begin_task(skill_id)`.
- **`select`** — alias for `suggest_skills` (debugging only).

## Do not

- Call **`begin_task`** without **`skill_id`**.
- Read `.agents/skills/` paths directly when MCP tools are available (except **`.skilling/active-body.md`** bridge).
- Skip **`end_task`** when moving to unrelated work.

## Hooks and SOT

- **`.skilling/session.json`** — active episode (skill, TTL, summary).
- Cursor **`beforeSubmitPrompt`** hook does not auto-inject by default — agent must pass `skill_id`.
