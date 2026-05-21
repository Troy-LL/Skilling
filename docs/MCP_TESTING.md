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
2. `select` (heuristic)
3. `load` with `inject_mode: compact`
4. `skill_plan`
5. `begin_task` (heuristic prompt → `find-skills`)
6. `get_session` · `health`
7. `end_task`
8. `begin_task` with **explicit `skill_id`** + `inject_mode: compact` (deterministic compact path)
9. `get_session` · `end_task` · idempotent `end_task`

Use the explicit-`skill_id` step when validating compact shaping — do not rely on heuristic `begin_task` alone (see below).

**E2 sessionEnd hook:** `npm run test:session-end-hook` (or close the composer and check Hooks output).

**Sprint F auto-begin hook:** `npm run test:auto-begin-hook` (requires `npm run build`). Verifies `session.json` v2, `active-body.md` bridge, and skip-on-active-session.

## Heuristic `begin_task` vs deterministic testing

When **`skill_id` is omitted**, `begin_task` runs the heuristic selector. That path **refuses injection** when confidence is below **`SKILLING_PLAN_MIN_CONFIDENCE`** (default **0.35**) and the match carries a `low_confidence` warning — by design, to avoid weak auto-selection.

For **deterministic** compact-load testing in an IDE or Inspector:

```json
{
  "skill_id": "frontend-design",
  "inject_mode": "compact",
  "prompt": "smoke test"
}
```

Or call **`load`** with `inject_mode: compact` before lifecycle tools. **`select`** still returns low-confidence matches (with warnings); only **`begin_task`** without `skill_id` blocks injection.

## MCP Inspector (manual)

From the repo root after `npm run build`:

```bash
npx @modelcontextprotocol/inspector node dist/index.js --skill-root ./.agents/skills
```

Use the Inspector UI to call lifecycle tools (**`begin_task`**, **`get_session`**, **`end_task`**) or low-level tools (**`list`**, **`select`**, **`load`**, **`cleanup`**).

**SKILL_ROOT resolution order:** `--skill-root` arg → `SKILL_ROOT` env (ignored if literal `${workspaceFolder}`) → `skilling.config.json` → walk up from cwd for `.agents/skills` → bundled catalog. Use `npx skilling setup` to write absolute paths automatically; do not rely on `${workspaceFolder}` in MCP env as most hosts do not expand it.

## All MCP-compatible hosts (verified)

Stdio MCP behavior is host-agnostic once paths are correct. Use `npm run smoke` for a CLI lifecycle check from any host. See [`docs/HOST_MCP_SETUP.md`](HOST_MCP_SETUP.md) for per-host config shapes and the AI comprehension layer.
