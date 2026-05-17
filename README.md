# SkillPilot

SkillPilot is a **stdio MCP server** that exposes a filesystem-backed skill store with lifecycle tools **`begin_task`** / **`end_task`**, plus **`list`**, **`select`**, **`load`**, **`cleanup`**, and **`ingest`**. It follows `architecture.md` and `skill-rules.md`, with v1-specific notes in **`v1-exceptions.md`**.

**Autonomous usage (Sprint E/F):** see **`docs/AUTONOMOUS_USAGE.md`** and **`.cursor/rules/skillpilot-lifecycle.mdc`**. Sprint F adds a **`beforeSubmitPrompt`** hook (auto `begin_task`), session v2 SOT, and extension auto-register.

## Requirements

- **Node.js 18+**

## Install and build

```bash
cd /path/to/SkillPilot
npm install
npm run build
```

## Run (stdio MCP)

The server reads **`SKILL_ROOT`** from the environment, or **`--skill-root`**, or defaults to **`./skills`** relative to the current working directory.

```bash
# Default skill root: <cwd>/skills
npm start

# Explicit root
node dist/index.js --skill-root ./skills

# Or via env
set SKILL_ROOT=P:\Troy\Code\Tools\SkillPilot\skills
node dist/index.js
```

**Important:** MCP uses **stdout** for the protocol. Operational logs go to **stderr** only (`skill_id`, `correlation_id`, `version` per `skill-rules.md` §9).

### Tools

| Tool | Purpose |
|------|---------|
| **`begin_task`** | **`select`** + **`load`** + write **`.skillpilot/session.json`** (v2: summary, rationale). Default `response_detail: summary` omits alternatives. |
| **`end_task`** | **`cleanup`** + clear session and bridge files. Prefer before topic change. |
| **`get_session`** | Read active session; optional `include_summary`, `include_body`. |
| **`list`** | Returns `id`, `title`, `summary`, optional `tags` and `version` for every valid skill. Fails closed if any folder under the root is invalid or ids collide. |
| **`select`** | Input: `prompt` (+ optional `goal`, `client`, `workspace_path`). Heuristic match → `skill_id`, `confidence`, `rationale`, optional `warnings` / `alternatives`. No LLM. |
| **`ingest`** | Import from `.agents/skills/<folder>` into `SKILL_ROOT` (after local `npx skills add`). |
| **`load`** | Input: `skill_id`. Returns `body`, `skill_id`, `ttl_ms` (hint, default 300000), `correlation_id` (UUID). |
| **`cleanup`** | Input: `correlation_id` (UUID). Idempotent ack; safe to call multiple times. |

Typical flow: **`begin_task`** → (agent work using returned `body`) → **`end_task`**. Low-level **`select`** / **`load`** / **`cleanup`** remain for debugging.

**Growing the catalog:** use **find-skills** + project-local `npx skills add` (no `-g`) → **`npm run skills:import`** or MCP **`ingest`**. See **`docs/SKILLS_CATALOG.md`**.

Size limits and path rules match **`skill-rules.md` §8–§9** and **`v1-exceptions.md`**.

## npm scripts

| Script | Command |
|--------|---------|
| **`npm run build`** | `tsc` → `dist/` |
| **`npm start`** | `node dist/index.js` (set `SKILL_ROOT` or cwd so `./skills` resolves) |
| **`npm run mcp`** | Same as `start` |
| **`npm test`** | Build + **`node:test`** unit tests (`dist/*.test.js`) |
| **`npm run smoke`** | Spawns stdio MCP and runs `list` → `begin_task` → `get_session` → `end_task` ×2 (no IDE required) |
| **`npm run test:auto-begin-hook`** | Simulates Sprint F `beforeSubmitPrompt` hook (requires `build`) |
| **`npm run test:session-end-hook`** | Simulates E2 `sessionEnd` hook |
| **`npm run skills:add -- <pkg>`** | `npx skills add` into this repo’s `.agents/skills` (no `-g`), then import to `skills/` |
| **`npm run skills:import -- <folder>`** | Import `.agents/skills/<folder>` → `skills/` only |

Global install is optional: `npm link` then run `skillpilot-mcp` if you use the `bin` entry.

## Validate end-to-end

- Run **`npm run smoke`** after **`npm run build`** to mimic Step 5 of the onboarding checklist (stdio MCP protocol).
- Use **`docs/VALIDATION_REPORT.md`** for the full ordered checklist (Steps 1–8), Cursor/VS Code checkboxes, and dogfood notes. **Cursor MCP** and **Sprint C extension** (`load` → register → `cleanup`) are recorded there as verified **2026-05-14**.
- Step-by-step host wiring: **`docs/HOST_MCP_SETUP.md`**.

## MCP host configuration

See **`docs/mcp-config.example.json`**. Replace placeholders with your clone path (or rely on `SKILL_ROOT` only).

- **Cursor:** User MCP config (e.g. *Cursor Settings → MCP* / project `mcp.json`) — `command` + `args` and/or `env`.
- **VS Code:** Use your MCP extension’s JSON config in the shape it expects; the same `command` / `env` values apply.

After pulling changes that add tools (e.g. **`select`**), run **`npm run build`** and **restart** the MCP server in Cursor so the host reloads `dist/index.js`. See **`docs/HOST_MCP_SETUP.md`** if new tools do not appear.

## Repo layout

- **`skills/{skill_id}/SKILL.md`** — catalog skills (`find-skills`, `com-skillpilot-orchestrator`; folder name **must** equal YAML `id`, v1 strict). Add more via **`ingest`** / **`skills:add`**.
- **`src/`** — TypeScript MCP server.
- **`docs/AUTONOMOUS_USAGE.md`** — Sprint E: `begin_task` / `end_task`, session file, E2 hooks plan.
- **`extension/README.md`** — SkillPilot Lifecycle extension (features, settings, VSIX install).
- **`docs/EXTENSION.md`** — SkillPilot Lifecycle extension (Sprint C/E: TTL + cleanup commands).
- **`docs/FOLLOWUP-extension.md`** — original extension sketch / acceptance criteria.
- **`docs/HOST_MCP_SETUP.md`** — Cursor vs VS Code MCP wiring.
- **`docs/VALIDATION_REPORT.md`** — validation checklist + chosen next slice (extension vs catalog).
- **`.github/workflows/ci.yml`** — `npm ci`, `npm test`, `npm run smoke` on PRs to `main`/`master`.
- **`docs/MCP_TESTING.md`** — unit tests, smoke, MCP Inspector.

## References

- `architecture.md` — router responsibilities and lifecycle.
- `skill-rules.md` — ids, metadata, caps, and API fields.
- `v1-exceptions.md` — v1 scope, symlink posture, and metadata handling.
