# Skilling

**The right skill, at the right time — without filling your context window.**

**Skilling is an open-source MCP context engine** that shapes skill bodies to a token budget, injects them per stage, and evicts on `end_task`. Agents route via `list` + `suggest_skills`; Skilling injects with explicit `skill_id`. Built for Cursor, Claude Desktop, and any MCP-compatible host.

---

## Install

**npm:** [`skilling`](https://www.npmjs.com/package/skilling)

### Zero-config (recommended)

From your project root:

```bash
npm install skilling
```

**Postinstall runs automatically:** seeds **`find-skills`** into `.agents/skills/` and runs **`skilling setup`** (writes MCP configs for detected IDEs with absolute paths). Re-installs are safe — existing `skilling` MCP entries are skipped unless you pass `--force`.

Then **restart your IDE** so it loads the MCP server (required after upgrades — see [Migrating to v2](#migrating-to-v2)).

### After install (by IDE)

| Audience | Extra step (optional) |
|----------|------------------------|
| **VS Code Copilot** | If `.github/copilot-instructions.md` exists: `npx skilling setup --write-rules` |
| **Claude Code** | MCP auto-config runs when `.mcp.json` or `.claude/` exists in the project |
| **Claude Desktop / Windsurf / Zed** | `SKILL_ROOT` is baked to the project you ran setup from; use `npx skilling setup --force` when switching projects |

Manual re-run or refresh after moving the project / upgrading Node:

```bash
npx skilling setup --force
```

Opt out: `SKILLING_SKIP_AUTO_SETUP=1` (seed only) or `SKILLING_SKIP_POSTINSTALL=1` (skip all postinstall steps). See [`docs/HOST_MCP_SETUP.md`](docs/HOST_MCP_SETUP.md).

### Manual MCP JSON (advanced)

`npm install skilling` + `npx skilling setup` handles this automatically with absolute paths. Use manual JSON only when you cannot run postinstall or need a custom config.

**Cursor / Claude Desktop / Windsurf** (`mcpServers`):

```json
{
  "mcpServers": {
    "skilling": {
      "command": "npx",
      "args": ["-y", "skilling@latest"]
    }
  }
}
```

**VS Code Copilot** (`.vscode/mcp.json`, `servers` key + `type: "stdio"`):

```json
{
  "servers": {
    "skilling": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "skilling@latest"]
    }
  }
}
```

For **global hosts** (Claude Desktop, Windsurf, Zed) add an absolute `SKILL_ROOT` — `${workspaceFolder}` is **not** expanded by most hosts:

```json
"env": { "SKILL_ROOT": "/absolute/path/to/your/project/.agents/skills" }
```

See [`docs/HOST_MCP_SETUP.md`](docs/HOST_MCP_SETUP.md) for the full host compatibility table.

### Install in Cursor

**Recommended — full plugin** (MCP + skills + hooks + rules): open **[Skilling on Cursor Directory](https://cursor.directory/plugins/skilling)** and click **Add to Cursor** on that page.

**MCP server only** (stdio router via `npx`, no plugin bundle) — one-click deeplink:

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](cursor://anysphere.cursor-deeplink/mcp/install?name=skilling&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsInNraWxsaW5nQGxhdGVzdCJdfQ==)

Regenerate the MCP deeplink after config changes: `npm run deeplink`

**Requirements:** Node.js 18+

---

## Why Skilling?

Agents work better with skills — structured playbooks for code review, MCP development, UI design, and more. But dumping entire skill libraries into every turn is expensive: wrong skills add noise, large bodies burn tokens, and stale guidance lingers after a task ends.

Skilling treats context as a budget:

- **Catalog on demand** — `list` (~280 tokens) when you need installed skill IDs; disable static skill blocks in the host when MCP is enabled.
- **Agent routes, Skilling injects** — `suggest_skills` for ranked hints; `begin_task(skill_id)` for shaped inject only.
- **Inject with depth control** — summary (300), compact (900), or explicit `inject_mode`; 8 KB cap per inject.
- **End tasks cleanly** — `end_task` evicts injected guidance before the next skill or topic.

Research on skill-augmented agents (e.g. [Skill0](https://arxiv.org/abs/2604.02268)) shows filtered, summary-first routing can cut per-step token cost sharply versus naïve full injection — often with better task alignment. Skilling brings that discipline to inference-time MCP workflows.

---

## How it works

```text
list                          ← tier-0 catalog (~280 tokens)
    │
    ▼
begin_task(find-skills, 300)  ← ecosystem discovery SOP (optional)
    │
    ▼
Agent picks skill_id          ← optional suggest_skills for ranked hints
    │
    ▼
begin_task(skill_id, 900)     ← shaped inject + session
    │
    ▼
Agent works with skill body
    │
    ▼
end_task                        ← required before next skill/topic
```

Skills live as folders under **`.agents/skills/<skill-id>/SKILL.md`**. Skilling-specific metadata (tags, triggers, inject defaults) can live in **`.agents/skills-meta/<skill-id>.yaml`** so ecosystem skills survive `npx skills update` without hand-editing upstream files.

---

## Features

| Capability | What you get |
|------------|----------------|
| **Explicit routing** | Agent picks `skill_id`; `suggest_skills` returns ranked hints (never injects) |
| **Token budgets** | `token_budget` shapes inject only (300 discovery / 900 implement); 8 KB cap |
| **Inject modes** | `summary` · `compact` · `sections` · `full` — escalate only when stuck |
| **Task lifecycle** | `begin_task(skill_id)` / `end_task` with `.skilling/session.json` as source of truth |
| **Metadata overlays** | Patch routing for community skills without touching their `SKILL.md` bodies |
| **Chunked catalog** | Large skills split into stage-sized chunks that fit compact inject |

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

Lifecycle tools (recommended):

| Tool | Purpose |
|------|---------|
| `list` | Tier-0 catalog — installed skill IDs (~280 tokens) |
| `suggest_skills` | Ranked routing hints from metadata — never injects |
| `begin_task` | **Requires `skill_id`** — shape, inject, open session |
| `end_task` | Required cleanup before next skill or topic |
| `get_session` | Read active episode (optional body; `stale` when TTL >80%) |

Deprecated / debugging:

| Tool | Notes |
|------|---------|
| `skill_plan` | Deprecated — use agent plan + `suggest_skills` |
| `select` | Alias for `suggest_skills` |
| `load` | Direct inject by id (`skill_inject`) |
| `cleanup` | Correlation cleanup (`skill_cleanup`) |
| `health` | Store check + `setup_hint` |

`begin_task` and `load` support **`inject_mode`** and **`token_budget`** (inject shaping only). See [`docs/CONTEXT_ENGINEERING.md`](docs/CONTEXT_ENGINEERING.md).

### Migrating to v2

**2.0.0** breaking changes:

- `begin_task` **requires `skill_id`** — call `list` or `suggest_skills` first
- New **`suggest_skills`** tool; `select` is a deprecated alias
- `token_budget` is **inject-only** (default 900; discovery phase 300)
- `skill_plan` returns `suggestions` only (no plan steps)
- Cursor hook auto-inject **off by default** — `SKILLING_HOOK_AUTO_INJECT=1` for legacy

After `npm install skilling@2` or upgrading from source: **restart MCP** in every host, then run `npm run smoke`.

---

## Configuration

Copy [`skilling.config.json.example`](skilling.config.json.example) to `skilling.config.json` to tune defaults:

```json
{
  "skillsRoot": "./.agents/skills",
  "defaultInjectMode": "compact",
  "maxInjectBytes": 8192,
  "defaultTokenBudget": 900
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
| `npm test` | Unit tests, setup scripts, hooks, and MCP smoke |
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
| [Host setup](docs/HOST_MCP_SETUP.md) | All MCP-compatible hosts — setup, compatibility, troubleshooting |
| [Skills catalog](docs/SKILLS_CATALOG.md) | Install, overlay, and route skills |
| [Autonomous usage](docs/AUTONOMOUS_USAGE.md) | Hooks, session file, agent policy |
| [Extension](docs/EXTENSION.md) | TTL status-bar companion |
| [Publishing](docs/PUBLISHING.md) | npm and Cursor Marketplace checklist |

---

## License

ISC — see [LICENSE](LICENSE). Dependencies are permissive open source (MIT / Apache 2.0 / BSD). Bundled ecosystem skills retain their own licenses under `.agents/skills/`.
