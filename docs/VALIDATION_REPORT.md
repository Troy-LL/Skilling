# SkillPilot validation report (template + CI run)

This document records the **ordered validation** steps for SkillPilot. Numbers match the onboarding checklist.

## Current state (2026-05-17)

| Item | Value |
|------|--------|
| **MCP server metadata version** | `1.2.0` (`src/server.ts`) |
| **Transport** | stdio (`dist/index.js`; logs on **stderr** only) |
| **MCP tools (8)** | `list`, `select`, `load`, `cleanup`, `ingest`, `begin_task`, `end_task`, `get_session` |
| **Catalog (`skills/`)** | `find-skills`, `com-skillpilot-orchestrator` (demo seeds removed) |
| **Automated smoke** | `list` → `begin_task` → `get_session` → `end_task` ×2 (`scripts/mcp-smoke.mjs`) |
| **Session SOT** | `.skillpilot/session.json` at repo root (parent of `skills/`; gitignored) |
| **E2 hooks** | `sessionEnd` → `.cursor/hooks/skillpilot-session-end.mjs` (cleanup + clear session) |
| **CI** | `npm ci` → `npm test` → `npm run smoke` (`.github/workflows/ci.yml`) |

Aligned with project MCP guidance (`.agents/skills/mcp-builder`, `typescript-mcp-server-generator`): `McpServer` + `registerTool`, Zod input schemas, `content` + `structuredContent` on tool results, tool annotations (`readOnlyHint`, `idempotentHint`, etc.).

---

## Environment

- **Repo:** SkillPilot (skill router MCP).
- **Default skill root:** `./skills` relative to process cwd, or `SKILL_ROOT` / `--skill-root`.
- **Repo root for session file:** parent directory of `skills/` (same rule as MCP `begin_task` / extension `skillpilot.skillRoot`).

---

## Step 1 — Install and build

**Action:** `npm install` and `npm run build` from repo root.

**Why:** Confirms Node toolchain and `dist/` output.

**Result (automated / CI):** Pass when `tsc` exits 0.

---

## Step 2 — Smoke-run the server

**Action:** Server must start without throwing when given a valid skill root. In automation, `npm run smoke` spawns stdio MCP and runs the **Sprint E** sequence (proves process stays healthy through a full task lifecycle).

**Why:** `./skills` is cwd-relative; wrong cwd breaks indexing.

**Manual note:** `npm start` alone blocks on stdio; use IDE connection or `npm run smoke` for non-interactive proof.

**Current smoke sequence:** `list` → `begin_task` → `get_session` → `end_task` → idempotent `end_task`.

---

## Step 3 — Cursor MCP wiring

**Action:** User adds MCP config per **`docs/HOST_MCP_SETUP.md`** and `docs/mcp-config.example.json` (absolute `node`, `dist/index.js`, `SKILL_ROOT`).

**Why:** Primary host; path mistakes show up first.

**Result:** Not recorded in CI — complete locally and note date / Cursor version here if desired:

- [x] **Cursor: connected and tools exercised** — **2026-05-14** (initial); **2026-05-17** (Sprint E lifecycle tools)

### Historical — Step 3 (2026-05-14, removed catalog skill)

Early verification used seed skill **`com-skillpilot-code-review`** (since removed from `skills/`):

- **`load`** returned `skill_id`, body, `ttl_ms` (300000), `correlation_id` **`2490aad0-30f3-471d-bf6d-cd88f6e3b566`**.
- **`cleanup`** with that id returned **`ok: true`**.

This confirmed **Cursor can drive the SkillPilot stdio MCP server** and the **`load` → `cleanup`** lifecycle in the IDE.

---

## Step 4 — VS Code MCP wiring

**Action:** Same JSON shape in VS Code MCP config.

**Why:** Confirms non–Cursor-only behavior.

**Result:** **Deferred** — Sprint A assumed one IDE (Cursor) is sufficient to validate stdio MCP; VS Code can reuse the same `mcp-config.example.json` when needed.

- [ ] VS Code: connected — date: ___________ *(optional)*

---

## Step 5 — Tool exercise

**Action:** In each host (or via `npm run smoke`): exercise MCP tools; lifecycle cleanup must be idempotent.

**Why:** Validates protocol, UUID flow, and store validation.

**Result (automated):** `npm run smoke` — see CI workflow and **Current state** above.

**Result (manual, Cursor, 2026-05-17):** Full Sprint E sequence — **`begin_task`** → **`get_session`** → **`end_task`** (see Sprint E section). Legacy **`list` → `select` → `load` → `cleanup` ×2** remains valid for debugging; not what CI smoke runs today.

---

## Step 6 — Real dogfood

**Action:** One small real task using a loaded skill; note if `cleanup` / `end_task` is easy to forget.

**Why:** Surfaces product gaps beyond JSON.

### Historical — Step 6 (2026-05-14)

- Task: Code review of SkillPilot `src/` using loaded **`com-skillpilot-code-review`** (removed from catalog).
- Cleanup remembered? **Yes** — `cleanup` with correlation id from that `load`.

### Current dogfood (optional)

- Prefer **`begin_task`** / **`end_task`** and catalog skills (`find-skills`, `com-skillpilot-orchestrator`); record task + whether **`end_task`** was remembered.

---

## Step 7 — Next slice (pick one)

**Completed:**

- **A — Extension / TTL** — Sprint C + Sprint E **Register Active Session** (session file SOT).
- **B — Catalog** — Sprint D (`find-skills`, `ingest`, `docs/SKILLS_CATALOG.md`).

**Completed (Sprint F, 2026-05-17):**

- Session SOT v2 (`summary`, `rationale`, `title` on disk).
- `begin_task` `response_detail: summary` (default); `get_session` enrichment.
- `beforeSubmitPrompt` auto-begin hook + `active-body.md` bridge.
- Extension `skillpilot.autoRegisterSession` + rich status bar.
- Skills: `create-hook`, `create-rule` imported; orchestrator v1.1.

**Next optional work:**

- `afterMCPExecution` session sync (low priority).
- VS Code MCP + extension check.
- Packaged VSIX / extension cleanup without repo `node_modules`.
- Remove `active-body.md` bridge when Cursor supports `additional_context` on `beforeSubmitPrompt`.

**Spike (Sprint C):** Cursor does **not** expose MCP tool results to extensions; **command-based** register (clipboard or session file) + status bar TTL + dismiss → `cleanup` via `scripts/extension-cleanup.mjs`.

---

## Step 8 — Automation

**Action:** GitHub Actions runs `npm ci` + `npm test` + `npm run smoke` on PRs.

**Why:** Catches broken MCP regressions without manual IDE steps.

**Sprint A (server hardening, 2026-05-14):** Unit tests (`node:test`), bounded `correlation_id` registry (max 1024, FIFO eviction), MCP tool annotations, actionable errors for unknown `skill_id`. See **`docs/MCP_TESTING.md`**.

**Sprint B (heuristic select, 2026-05-14):** MCP tool **`select`** (tags/title/summary/id scoring; optional **`triggers`** in front matter when present; no LLM). Low-level smoke was `list` → `select` → `load` → `cleanup` ×2 before Sprint E.

**Sprint C (extension / TTL, 2026-05-14):** **`extension/`** — status bar TTL, register from load JSON (clipboard), dismiss → MCP `cleanup`. See **`docs/EXTENSION.md`**.

**Sprint D (catalog / find-skills, 2026-05-14):** Project-local **`npx skills add`**, **`ingest`**, **`npm run skills:add` / `skills:import`**, **`docs/SKILLS_CATALOG.md`**.

**Sprint E (autonomous MCP, 2026-05-17):** **`begin_task`** / **`end_task`** / **`get_session`**, **`.skillpilot/session.json`**, **`.cursor/rules/skillpilot-lifecycle.mdc`**, **`docs/AUTONOMOUS_USAGE.md`**, extension **Register Active Session** (repo root = parent of `dist/`, not `dist/` itself). CI smoke: `list` → `begin_task` → `get_session` → `end_task` ×2.

### Sprint C — manual verification (Cursor, 2026-05-14)

*Uses removed seed skill **`com-skillpilot-code-review`**; kept as audit history.*

- [x] **Extension settings** — `skillpilot.serverEntry` and `skillpilot.skillRoot` in Cursor user `settings.json`.
- [x] **`load`** — `com-skillpilot-code-review`; `correlation_id` **`9d038a38-1033-48df-af01-94693aa504ba`**.
- [x] **Register from load JSON** — clipboard payload; status bar tracked active skill.
- [x] **Dismiss / cleanup** — MCP **`cleanup`** `ok: true` for that correlation id.

### Sprint E — manual verification (Cursor, 2026-05-17)

- [x] **`npm run build`** && **`npm test`** && **`npm run smoke`**
- [x] Cursor MCP tools (8): includes **`begin_task`**, **`end_task`**, **`get_session`**, **`ingest`**
- [x] Chat: **`begin_task`** (`find a skill for API testing`, phase `plan`) → **`find-skills`**; **`get_session`** → `active: true`; **`end_task`** → `ok: true`, correlation **`d1fd07c3-34f6-40a6-b1a9-641ce2cea5f1`**; **`.skillpilot/session.json`** removed
- [x] Extension: **Register Active Session** → `find-skills` from session file; status bar tracking (after `serverEntry` repo-root fix)
- [ ] Extension: **Dismiss Active Skill** → MCP **`cleanup`** `ok: true` *(optional explicit retest; Sprint C path already validated cleanup)*
- [x] E2 Phase 1: **`sessionEnd`** hook → cleanup + clear session (see **`docs/AUTONOMOUS_USAGE.md`** § E2)
- [ ] E2 manual: `begin_task` → close composer → session file gone; Hooks output shows `skillpilot-session-end`

### Sprint F — manual verification (Cursor)

- [ ] `npm run test:auto-begin-hook` passes after `npm run build`
- [ ] Reload hooks; send coding prompt → `session.json` + `active-body.md` without agent `begin_task`
- [ ] Second prompt → hook skips (Hooks stderr: `skip begin_task`)
- [ ] Extension status bar auto-appears (`skillpilot.autoRegisterSession`)
- [ ] Agent reply is one line (no skill menu); uses `summary` from session
- [ ] `find a skill for X` routes to `find-skills`; normal fix-CI prompt does not show `list`
- [ ] Opt-out: `.skillpilot/disable-auto-begin` or `SKILLPILOT_SKIP_AUTO_BEGIN=1` disables hook

---

## Failures log

Paste exact errors here during manual runs:

```
2026-05-17 — Register Active Session looked under dist/.skillpilot/session.json when
serverEntry parent was dist/; fixed extension to use parent of dist/. Resolved.
```
