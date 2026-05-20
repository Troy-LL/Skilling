# SkillPilot

SkillPilot is a **stdio MCP server** that routes filesystem-backed agent skills with **token-efficient** injection: Tier 1 summaries for selection, Tier 2 bodies shaped on load. Lifecycle tools **`begin_task`** / **`end_task`** pair with **`skill_plan`** for plan-before-execute workflows.

**Canonical skill root:** **`.agents/skills/`** (project-local `npx skills add`, no `-g`). Optional **`skills/`** is a legacy ingest target only — see **`docs/SKILLS_CATALOG.md`**.

**Planning & spec:** **`skillpilot_docs/`** (ARCHITECTURE, SPEC, TOKEN_COMPRESSION, ROADMAP). **Context engineering ladder:** **`docs/CONTEXT_ENGINEERING.md`**. **Autonomous usage:** **`docs/AUTONOMOUS_USAGE.md`** and **`.cursor/rules/skillpilot-lifecycle.mdc`**.

## Requirements

- **Node.js 18+**

## Install and build

```bash
cd /path/to/SkillPilot
npm install
npm run build
```

## Run (stdio MCP)

The server resolves the skill root in order: **`--skill-root`**, then **`SKILL_ROOT`** / **`SKILLPILOT_SKILLS_ROOT`**, then **`skillpilot.config.json`**, then **`./.agents/skills`** relative to cwd.

```bash
# Default: <cwd>/.agents/skills
npm start

# Explicit root
node dist/index.js --skill-root ./.agents/skills

# Or via env (recommended for MCP hosts)
export SKILL_ROOT=/path/to/SkillPilot/.agents/skills
node dist/index.js
```

Copy **`skillpilot.config.json.example`** → **`skillpilot.config.json`** to tune inject caps and default token budget.

**Important:** MCP uses **stdout** for the protocol. Operational logs go to **stderr** only (structured JSON per **`skillpilot_docs/SPEC.md`**).

### Tools

| Tool | Aliases | Purpose |
|------|---------|---------|
| **`list`** | `skill_list` | Tier 1 catalog (`id`, `title`, `summary`, optional `tags`, `version`). Optional `tags` filter. |
| **`select`** | `skill_select` | Heuristic match on summaries only; `token_budget`, `top_k`. |
| **`load`** | `skill_inject` | Shaped body, `token_estimate`, `ttl_hint`, `correlation_id`. |
| **`cleanup`** | `skill_cleanup` | Idempotent ack for `correlation_id`. |
| **`skill_plan`** | — | Multi-step plan + `skills_needed` from Tier 1 only. |
| **`begin_task`** | — | `select` + shaped `load` + **`.skillpilot/session.json`** (v2). |
| **`end_task`** | — | `cleanup` + clear session / bridge files. |
| **`get_session`** | — | Read active session; optional `include_summary`, `include_body`. |
| **`health`** | — | Index builds; skill count. |
| **`ingest`** | — | Optional: copy `.agents/skills/<folder>` → `skills/` (dogfood import). |

Typical flow: **`skill_plan`** (multi-step) → **`begin_task`** → work → **`end_task`**. Low-level **`select`** / **`load`** remain for debugging.

**Growing the catalog:** **find-skills** → `npx skills add` into **`.agents/skills/`** — no import to `skills/` required when MCP points at `.agents/skills`. See **`docs/SKILLS_CATALOG.md`**.

## npm scripts

| Script | Command |
|--------|---------|
| **`npm run build`** | `tsc` → `dist/` |
| **`npm start`** | `node dist/index.js` |
| **`npm test`** | Build + `node:test` (`dist/**/*.test.js`) |
| **`npm run smoke`** | Stdio MCP: `list`, `skill_plan`, `begin_task`, `health`, `end_task` (uses `.agents/skills`) |
| **`npm run skills:add -- <pkg>`** | `npx skills add` into `.agents/skills` (no `-g`) |
| **`npm run skills:import -- <folder>`** | Optional copy `.agents/skills/<folder>` → `skills/` |

## Validate end-to-end

```bash
npm run build
$env:SKILL_ROOT = "$PWD/.agents/skills"   # PowerShell
npm run smoke
```

See **`docs/VALIDATION_REPORT.md`**, **`docs/HOST_MCP_SETUP.md`**, **`docs/MCP_TESTING.md`**.

## MCP host configuration

See **`docs/mcp-config.example.json`**. Set **`SKILL_ROOT`** to **`<REPO>/.agents/skills`**.

After pulling tool changes, run **`npm run build`** and **restart** the MCP server in Cursor.

## Repo layout

- **`.agents/skills/{skill_id}/SKILL.md`** — canonical catalog (ecosystem + `com-skillpilot-orchestrator`).
- **`skills/`** — optional legacy / ingest target for the **`ingest`** tool.
- **`src/`** — TypeScript MCP server.
- **`skillpilot_docs/`** — architecture, SPEC, token compression, roadmap.
- **`.skillpilot/`** — session SOT (`session.json`, `active-body.md` bridge).

## References

- **`skillpilot_docs/ARCHITECTURE.md`** — tiers, lifecycle, selectors.
- **`skillpilot_docs/SPEC.md`** — MCP tools, errors, config.
- **`skill-rules.md`** — ids, metadata, caps.
- **`v1-exceptions.md`** — v1 scope notes.
