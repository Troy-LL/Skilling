# Skilling

**The right skill, at the right time — without filling your context window.**

Skilling is an open-source MCP server that routes agent skills from your filesystem. It picks the best skill for each task, injects only what you need, and cleans up when the work is done. Built for Cursor, Claude Desktop, and any MCP-compatible host.

---

## Install

**npm:** [`skilling`](https://www.npmjs.com/package/skilling)

### Zero-config (recommended)

From your project root:

```bash
npm install skilling
```

**Postinstall runs automatically:** seeds **`find-skills`** into `.agents/skills/` and runs **`skilling setup`** (writes MCP configs for detected IDEs with absolute paths). Re-installs are safe — existing `skilling` MCP entries are skipped unless you pass `--force`.

Then **restart your IDE** so it loads the MCP server.

Manual re-run or refresh after moving the project / upgrading Node:

```bash
npx skilling setup --force
```

Opt out: `SKILLING_SKIP_AUTO_SETUP=1` (seed only) or `SKILLING_SKIP_POSTINSTALL=1` (skip all postinstall steps). See [`docs/HOST_MCP_SETUP.md`](docs/HOST_MCP_SETUP.md).

### Manual MCP JSON (advanced)

Add this to **Cursor Settings → MCP** or your project’s `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "skilling": {
      "command": "npx",
      "args": ["-y", "skilling@latest"],
      "env": {
        "SKILL_ROOT": "${workspaceFolder}/.agents/skills"
      }
    }
  }
}
```

One-line MCP command (what `npx` runs):

```bash
npx -y skilling@latest
```

The MCP JSON block above is optional if you use **`npm install skilling`** (postinstall + setup). For `npx`-only installs without a local dependency, point `SKILL_ROOT` at `.agents/skills` or omit it and use the bundled catalog.

### Install in Cursor

**Recommended — full plugin** (MCP + skills + hooks + rules): open **[Skilling on Cursor Directory](https://cursor.directory/plugins/skilling)** and click **Add to Cursor** on that page.

**MCP server only** (stdio router via `npx`, no plugin bundle) — one-click deeplink:

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](cursor://anysphere.cursor-deeplink/mcp/install?name=skilling&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsInNraWxsaW5nQGxhdGVzdCJdLCJlbnYiOnsiU0tJTExfUk9PVCI6IiR7d29ya3NwYWNlRm9sZGVyfS8uYWdlbnRzL3NraWxscyJ9fQ==)

Regenerate the MCP deeplink after config changes: `npm run deeplink`

**Requirements:** Node.js 18+

---

## Why Skilling?

Agents work better with skills — structured playbooks for code review, MCP development, UI design, and more. But dumping entire skill libraries into every turn is expensive: wrong skills add noise, large bodies burn tokens, and stale guidance lingers after a task ends.

Skilling treats context as a budget:

- **Select on summaries, not full files** — routing reads ~60 tokens per skill, not thousands.
- **Inject with depth control** — summary, compact, section, or full body depending on what you need.
- **Plan before you execute** — map which skills a multi-step goal needs before loading anything heavy.
- **End tasks cleanly** — `end_task` evicts injected guidance so the next conversation stays focused.

Research on skill-augmented agents (e.g. [Skill0](https://arxiv.org/abs/2604.02268)) shows filtered, summary-first routing can cut per-step token cost sharply versus naïve full injection — often with better task alignment. Skilling brings that discipline to inference-time MCP workflows.

---

## How it works

```text
Your prompt
    │
    ▼
skill_plan (optional)     ← Tier 1 only: which skills, in what order
    │
    ▼
begin_task                  ← match + shaped inject + session file
    │
    ▼
Agent works with skill body
    │
    ▼
end_task                    ← cleanup + clear session
```

Skills live as folders under **`.agents/skills/<skill-id>/SKILL.md`**. Skilling-specific metadata (tags, triggers, inject defaults) can live in **`.agents/skills-meta/<skill-id>.yaml`** so ecosystem skills survive `npx skills update` without hand-editing upstream files.

---

## Features

| Capability | What you get |
|------------|----------------|
| **Heuristic routing** | Tag and trigger matching on Tier 1 metadata; no LLM required for selection |
| **Token budgets** | Exclude skills whose bodies exceed your remaining context headroom |
| **Inject modes** | `summary` · `compact` · `sections` · `full` — escalate only when stuck |
| **Task lifecycle** | `begin_task` / `end_task` with `.skilling/session.json` as source of truth |
| **Metadata overlays** | Patch routing for community skills without touching their `SKILL.md` bodies |
| **Open stack** | Node.js, stdio MCP, MIT-friendly deps — no API keys at install time |

---

## Quick start

### Develop from source

```bash
git clone https://github.com/Troy-LL/SkillPilot.git
cd SkillPilot
npm install
npm run build
```

Local MCP entry (repo-relative):

```json
{
  "mcpServers": {
    "skilling": {
      "command": "node",
      "args": ["<REPO>/scripts/run-mcp.mjs"],
      "env": {}
    }
  }
}
```

`run-mcp.mjs` discovers `.agents/skills` at runtime. See [`docs/mcp-config.example.json`](docs/mcp-config.example.json) and [`docs/HOST_MCP_SETUP.md`](docs/HOST_MCP_SETUP.md).

### npm publish

Maintainers: `npm login` then `npm publish --access public` from this directory. See [`docs/PUBLISHING.md`](docs/PUBLISHING.md).

### Cursor plugin (Directory + Marketplace)

Install from **[cursor.directory/plugins/skilling](https://cursor.directory/plugins/skilling)** (community directory) or submit via the [Cursor Marketplace](https://cursor.com/marketplace). Manifest: [`.cursor-plugin/plugin.json`](.cursor-plugin/plugin.json). Local test and publishing: [`docs/PUBLISHING.md`](docs/PUBLISHING.md).

**Verify locally:**

```bash
# Bash
export SKILL_ROOT="$(pwd)/.agents/skills"
npm run smoke

# PowerShell
$env:SKILL_ROOT = "$PWD/.agents/skills"
npm run smoke
```

---

## Growing your skill catalog

1. **Discover** — use the bundled **find-skills** skill or `npx skills find <query>` on [skills.sh](https://skills.sh/).
2. **Install project-local** — from the repo root: `npx skills add <package> -y` (no `-g`). Skills land in `.agents/skills/`.
3. **Add routing metadata** — create `.agents/skills-meta/<id>.yaml` with `tags`, `triggers`, and optional `inject_mode_default: compact` for large skills.
4. **Route** — MCP reads `.agents/skills` and merges overlays automatically.

Details: [`docs/SKILLS_CATALOG.md`](docs/SKILLS_CATALOG.md)

---

## MCP tools

Lifecycle tools (recommended for agents):

| Tool | Purpose |
|------|---------|
| `skill_plan` | Plan which skills a goal needs — summaries only, no bodies loaded |
| `begin_task` | Select, inject, and open a task session |
| `end_task` | Cleanup and clear the session |
| `get_session` | Read the active episode (optional body) |

Low-level tools (debugging and custom flows):

| Tool | Aliases |
|------|---------|
| `list` | `skill_list` |
| `select` | `skill_select` |
| `load` | `skill_inject` |
| `cleanup` | `skill_cleanup` |
| `health` | — |

`load` and `begin_task` support **`inject_mode`** (`summary` | `compact` | `sections` | `full`) and **`token_budget`** to auto-pick depth. See [`docs/CONTEXT_ENGINEERING.md`](docs/CONTEXT_ENGINEERING.md).

---

## Configuration

Copy [`skilling.config.json.example`](skilling.config.json.example) to `skilling.config.json` to tune defaults:

```json
{
  "skillsRoot": "./.agents/skills",
  "defaultInjectMode": "compact",
  "maxInjectBytes": 8192,
  "defaultTokenBudget": 2048
}
```

Resolution order for the skill root: `--skill-root` → `SKILL_ROOT` env (skipped if literal `${…}`) → config file → walk up from cwd for `.agents/skills` → bundled catalog → `./.agents/skills`.

MCP protocol traffic uses **stdout** only; logs go to **stderr** as structured JSON.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the MCP server (stdio) |
| `npm test` | Unit tests |
| `npm run smoke` | End-to-end MCP lifecycle check |
| `npm run benchmark` | Token savings + selection regression |
| `npm run skills:add -- <pkg>` | Install a skill into `.agents/skills` |

---

## Project layout

```text
SkillPilot/
├── .cursor-plugin/          ← Cursor Marketplace manifest
├── .agents/skills/          ← canonical skill catalog (SKILL.md per skill)
├── .agents/skills-meta/     ← Skilling overlays (tags, triggers, inject defaults)
├── hooks/                   ← plugin hooks (auto-begin, session-end)
├── mcp.json                 ← portable MCP config for plugin installs
├── src/                     ← MCP server (TypeScript)
├── docs/                    ← host setup, catalog, context engineering
└── .skilling/             ← active session (gitignored): session.json, bridge files
```

---

## Documentation

| Doc | Topic |
|-----|--------|
| [Context engineering](docs/CONTEXT_ENGINEERING.md) | Inject ladder and overlay workflow |
| [Host setup](docs/HOST_MCP_SETUP.md) | Cursor and VS Code MCP wiring |
| [Skills catalog](docs/SKILLS_CATALOG.md) | Install, overlay, and route skills |
| [Autonomous usage](docs/AUTONOMOUS_USAGE.md) | Hooks, session file, agent policy |
| [Extension](docs/EXTENSION.md) | TTL status-bar companion |
| [Publishing](docs/PUBLISHING.md) | npm and Cursor Marketplace checklist |

---

## License

ISC — see [LICENSE](LICENSE). Dependencies are permissive open source (MIT / Apache 2.0 / BSD). Bundled ecosystem skills retain their own licenses under `.agents/skills/`.
