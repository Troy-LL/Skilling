# Autonomous SkillPilot usage (Sprint E)

SkillPilot cannot force an IDE agent to call tools. Sprint E adds **policy** (Cursor rules), **fewer MCP steps** (`begin_task` / `end_task`), and a **session file** so the extension and future hooks share one source of truth.

## E1 — Implemented

### Session file (SOT on disk)

Path: **`.skillpilot/session.json`** at the repo root (gitignored). Written by **`begin_task`**, cleared by **`end_task`**.

```json
{
  "version": 2,
  "skill_id": "find-skills",
  "title": "Find Skills",
  "summary": "Using Find Skills — matched tag:skills.",
  "rationale": "Selected \"Find Skills\" (find-skills) with score 8; matched tag:skills.",
  "confidence": 0.72,
  "correlation_id": "uuid",
  "ttl_ms": 300000,
  "started_at": "2026-05-14T12:00:00.000Z",
  "phase": "review"
}
```

### MCP tools

| Tool | Role |
|------|------|
| **`skill_plan`** | Tier-1-only plan + `skills_needed` before multi-phase work |
| **`begin_task`** | `select` (unless `skill_id`) + shaped `load` + write session + **`.skillpilot/active-body.md`** bridge; `token_budget`, `phase` |
| **`end_task`** | `cleanup` + clear session |
| **`get_session`** | Read active episode or `{ active: false }` (inactive when TTL expired — clears stale session files, same as auto-begin hook) |
| `list` / `skill_list`, `select`, `load`, `health` | Debugging and catalog checks |
| `ingest` | Optional copy `.agents/skills` → `skills/` |

**SKILL_ROOT:** **`.agents/skills/`** for this repo. **Typical flow:** `skill_plan` (optional) → `begin_task` → work → `end_task`.

### Cursor rules

[`.cursor/rules/skillpilot-lifecycle.mdc`](../.cursor/rules/skillpilot-lifecycle.mdc) — `alwaysApply: true` policy for agents in this repo.

### Extension

**SkillPilot: Register Active Session** — reads `.skillpilot/session.json` and starts the status-bar TTL (no clipboard).

### Limitations (honest)

- Rules are **soft**; the model may still skip tools.
- Session file tracks the **last begin_task** in this repo; it does not remove text from the host context by itself.
- **`cleanup`** in the MCP process is bookkeeping; the host must drop injected guidance.
- **Correlation registry** is in-memory per MCP process. Hooks spawn a short-lived MCP child ([`scripts/extension-begin-task.mjs`](../scripts/extension-begin-task.mjs), [`extension-cleanup.mjs`](../scripts/extension-cleanup.mjs)); **`end_task`** and session files on disk are the durable SOT across processes.
- Corrupt **`.skillpilot/session.json`** is treated as no session (stderr warning once on parse failure).

## E2 — Phase 1 (implemented)

Project hook **`.cursor/hooks.json`** runs on **`sessionEnd`** (composer conversation ends):

| Step | Behavior |
|------|----------|
| 1 | Find **`.skillpilot/session.json`** under workspace roots / repo root |
| 2 | Run **`scripts/extension-cleanup.mjs`** (`cleanup` via stdio MCP) |
| 3 | Delete session file on success |

Script: **[`hooks/skillpilot-session-end.mjs`](../hooks/skillpilot-session-end.mjs)** (Node; logs to stderr).

**Why not `stop`?** The `stop` hook fires after each agent loop turn; cleaning there would drop the session mid-chat. Use **`end_task`** in chat when switching topics without closing the composer.

**Requires:** `npm run build` so `dist/index.js` exists. Reload Cursor after editing `hooks.json`.

**Local test:**

```powershell
npm run build
# Leave a session open (begin_task in chat/Inspector; do not end_task), then:
npm run test:session-end-hook
```

### E2 — Deferred (partially delivered in F)

| Hook | Purpose |
|------|---------|
| `afterMCPExecution` (matcher: `begin_task` / `load`) | Backup session sync (optional; not implemented) |
| `stop` | Only if Cursor adds a narrower “conversation idle” signal |

## F — Autonomous routing and presentation (implemented)

### Session file v2

**`.skillpilot/session.json`** now includes `title`, `summary`, `rationale`, `confidence`, optional `warnings`, and `prompt_fingerprint`. Legacy v1 files are read with sensible defaults.

### MCP presentation

| Feature | Behavior |
|---------|----------|
| **`begin_task`** `response_detail` | Default **`summary`** — omits `alternatives`; use **`full`** for debugging |
| **`get_session`** | Optional `include_summary` (default true when active), `include_body` (default false) |
| No-match errors | Agent-directed only — do not encourage skill menus for users |

### Auto `begin_task` hook

**`beforeSubmitPrompt`** → [`hooks/skillpilot-auto-begin.mjs`](../hooks/skillpilot-auto-begin.mjs):

| Step | Behavior |
|------|----------|
| 1 | Skip if opt-out (`SKILLPILOT_SKIP_AUTO_BEGIN=1` or `.skillpilot/disable-auto-begin`) |
| 2 | Skip if session exists and TTL not expired |
| 3 | If expired → cleanup, then `begin_task` via [`scripts/extension-begin-task.mjs`](../scripts/extension-begin-task.mjs) |
| 4 | Write **`.skillpilot/active-body.md`** bridge when MCP returns `body` (MCP **`begin_task`** also writes the bridge; hook ensures workspace-root copy when paths align) |
| 5 | Return `{ "continue": true }` (fail-open on errors) |

Reload Cursor after changing [`.cursor/hooks.json`](../.cursor/hooks.json). Requires `npm run build`.

**Local test:**

```powershell
npm run build
npm run test:auto-begin-hook
```

### Bridge file (host limit workaround)

Cursor **`beforeSubmitPrompt`** cannot inject `additional_context` yet. Agents follow **`.skillpilot/active-body.md`** when present (see lifecycle rule). Remove bridge when Cursor supports prompt-time injection.

### Extension (Sprint F)

- **`skillpilot.autoRegisterSession`** (default `true`) — watches `session.json` and starts status-bar TTL automatically.
- Status bar shows **title** / tooltip with **summary** and **rationale**.

### Agent presentation (policy)

- One-line user summary after routing; never show `alternatives` or `list` output.
- **`find-skills`** only when the user wants catalog discovery/install — not normal coding prompts.

**Not in F:** silent system-prompt injection from hooks (host API limits).

## Manual validation

1. `npm run build` && `npm test` && `npm run smoke` && `npm run test:auto-begin-hook`
2. Reload Cursor MCP and hooks; confirm `begin_task`, `end_task`, `get_session`
3. Send a coding prompt → hook creates `session.json` + `active-body.md` without agent calling `begin_task`
4. Second prompt in same chat → hook skips (active session)
5. `end_task` or close composer → session + bridge cleared
6. Extension: status bar appears without manual Register (when `skillpilot.autoRegisterSession` is true)

Record results in [VALIDATION_REPORT.md](VALIDATION_REPORT.md).

## Related

- [SKILLS_CATALOG.md](SKILLS_CATALOG.md) — discover and import skills
- [EXTENSION.md](EXTENSION.md) — TTL extension
- [HOST_MCP_SETUP.md](HOST_MCP_SETUP.md) — MCP wiring
