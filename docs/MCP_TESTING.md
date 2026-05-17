# MCP testing (SkillPilot)

## Automated

```bash
npm test          # build + node:test unit tests
npm run smoke     # stdio MCP: list → begin_task → get_session → end_task ×2
```

CI runs `npm ci`, `npm test`, and `npm run smoke` on pull requests.

**E2 sessionEnd hook:** `npm run test:session-end-hook` (or close the composer and check Hooks output).

**Sprint F auto-begin hook:** `npm run test:auto-begin-hook` (requires `npm run build`). Verifies `session.json` v2, `active-body.md` bridge, and skip-on-active-session.

## MCP Inspector (manual)

From the repo root after `npm run build`:

```bash
npx @modelcontextprotocol/inspector node dist/index.js --skill-root ./skills
```

Use the Inspector UI to call lifecycle tools (**`begin_task`**, **`get_session`**, **`end_task`**) or low-level tools (**`list`**, **`select`**, **`load`**, **`cleanup`**, **`ingest`**). Set `SKILL_ROOT` via `--skill-root` or `env` in the Inspector launch config if needed.

## Cursor (verified)

See **`docs/VALIDATION_REPORT.md`** — Cursor MCP verified **2026-05-14** (`load` / `cleanup`) and **2026-05-17** (Sprint E lifecycle + extension session register). VS Code wiring is deferred; stdio MCP behavior is host-agnostic once paths are correct.
