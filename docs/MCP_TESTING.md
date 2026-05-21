# MCP testing (Skilling)

## Automated

```bash
npm test           # build + unit tests + setup + hooks + smoke (full MCP lifecycle)
npm run smoke      # stdio MCP lifecycle only (also run via npm test)
```

CI runs `npm ci`, `npm test`, and `npm run smoke` on pull requests.

**Smoke script** (`scripts/mcp-smoke.mjs`) runs over stdio and prints token estimates:

0. Server `instructions` + `listPrompts` / `getPrompt(skilling_workflow)`
1. `list` / `skill_list`
2. `suggest_skills` + `select` alias
3. `load` with `inject_mode: compact`
4. `skill_plan` (deprecated suggestions)
5. `begin_task(skill_id: find-skills, token_budget: 300)` + rejection without `skill_id`
6. `get_session` · `health`
7. `end_task`
8. `begin_task` with explicit `skill_id` + `inject_mode: compact`
9. `get_session` · `end_task` · idempotent `end_task`

## Routing vs injection

- **`suggest_skills`** — ranked candidates, never injects, never throws on low confidence
- **`begin_task`** — requires explicit **`skill_id`**; shapes and injects only

For deterministic compact-load testing:

```json
{
  "skill_id": "frontend-design",
  "inject_mode": "compact",
  "prompt": "smoke test"
}
```

Or call **`load`** with `inject_mode: compact`. Use **`list`** for catalog IDs (~280 tokens).

## MCP Inspector (manual)

From the repo root after `npm run build`:

```bash
npx @modelcontextprotocol/inspector node dist/index.js --skill-root ./.agents/skills
```

Use the Inspector UI to call lifecycle tools (**`begin_task(skill_id)`**, **`get_session`**, **`end_task`**) or routing tools (**`list`**, **`suggest_skills`**, **`load`**, **`cleanup`**).

**SKILL_ROOT resolution order:** `--skill-root` arg → `SKILL_ROOT` env (ignored if literal `${workspaceFolder}`) → `skilling.config.json` → walk up from cwd for `.agents/skills` → bundled catalog. Use `npx skilling setup` to write absolute paths automatically; do not rely on `${workspaceFolder}` in MCP env as most hosts do not expand it.

## All MCP-compatible hosts (verified)

Stdio MCP behavior is host-agnostic once paths are correct. Use `npm run smoke` for a CLI lifecycle check from any host. See [`docs/HOST_MCP_SETUP.md`](HOST_MCP_SETUP.md) for per-host config shapes and the AI comprehension layer.
