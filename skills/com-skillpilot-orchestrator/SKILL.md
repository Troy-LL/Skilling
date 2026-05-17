---
id: com-skillpilot-orchestrator
title: SkillPilot task orchestration
summary: Use MCP begin_task and end_task per dev stage; silent routing; one-line user summary; do not read skill files directly from disk.
tags:
  - skillpilot
  - workflow
  - routing
version: 1.1.0
triggers:
  - begin task
  - skillpilot
  - end task
---

## When to use

Apply when the host has SkillPilot MCP and you need a repeatable **select → load → work → cleanup** loop across development stages.

**Not for:** user asks to discover or install skills from the ecosystem — use **`find-skills`** instead.

## Phase hints for begin_task

| phase | Typical work |
|-------|----------------|
| `plan` | Scoping, design, tradeoffs |
| `implement` | Coding, wiring, refactors |
| `review` | PR/diff review, security pass |
| `ci` | Failing checks, triage logs |

## Procedure

1. If **`.skillpilot/active-body.md`** exists (hook auto-routed), follow it for this turn; otherwise call **`get_session`** — if `active: false`, call **`begin_task`** with the user goal and optional `phase` (`response_detail` defaults to summary).
2. Obey skill **`body`** (from tool result or bridge file) until the stage is done.
3. **`end_task`** before switching topic or phase; start a new **`begin_task`** for the next stage.

## User-facing presentation

- After routing: reply with **one sentence** using `summary` from the tool or session — e.g. “Using **&lt;title&gt;** — &lt;short why&gt;.”
- **Never** show `alternatives`, skill menus, `list` output, or raw score tables to the user.
- Do not ask the user to pick a `skill_id`.

## Do not

- Read `skills/` paths directly when MCP tools are available (except **`.skillpilot/active-body.md`** bridge).
- Call **`list`** / **`select`** / **`load`** in normal work (debugging only).
- Skip **`end_task`** when moving to unrelated work.
- Use this skill when the user only wants to **find or install** external skills — use **`find-skills`**.

## Hooks and SOT

- **`.skillpilot/session.json`** — active episode (skill, TTL, summary, rationale).
- Composer **`beforeSubmitPrompt`** hook may auto-run `begin_task`; do not duplicate if session is already active unless switching topics.
