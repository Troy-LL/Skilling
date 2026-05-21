# MCP host setup (all IDEs)

Skilling is a **stdio MCP server**. Any IDE or client that supports subprocess MCP can use it. Setup is automated — no `${workspaceFolder}` expansion, no manual Node PATH, no guessing config file locations.

## Quick start

From your **project root** (where you want `.agents/skills/`):

```bash
npm install skilling
```

**Postinstall** seeds **`find-skills`** and runs **`skilling setup`** automatically (idempotent — skips hosts already configured). Then **restart your IDE**.

Manual re-run or refresh:

```bash
npx skilling setup --force
```

What happens on `npm install`:

1. **Seed** — copies **`find-skills`** into `.agents/skills/` if missing (non-destructive).
2. **Setup** — detects IDE markers, writes MCP configs with **absolute** `command` / `args`, merges without clobbering other servers. Skips when `skilling` entry already exists.
3. **Restart IDE** — MCP servers load at startup on most hosts.

Opt out: `SKILLING_SKIP_AUTO_SETUP=1` (seed only) · `SKILLING_SKIP_POSTINSTALL=1` (skip all postinstall). Skipped in CI and global installs.

No prompts. No confirmations.

### Setup flags

| Flag | Effect |
|------|--------|
| `--force` | Overwrite existing `skilling` MCP entries (after Node upgrade or project move) |
| `--write-rules` | Write lifecycle rules to IDE rules files when their directories already exist |
| `--dry-run` | Show what would be written; touch no files |
| `--help` | Usage |

```bash
npx skilling setup --force
npx skilling setup --dry-run
```

---

## Host compatibility

| Host | Config file | Scope | Auto-configured |
|------|-------------|-------|-----------------|
| **Cursor** | `.cursor/mcp.json` | project | yes (when `.cursor/` exists) |
| **VS Code Copilot** | `.vscode/mcp.json` | project | yes (when `.vscode/` exists) |
| **Claude Code** | `.mcp.json` | project | yes (when `.mcp.json` or `.claude/` exists) |
| **Continue** | `.continue/mcpServers/skilling.json` | project | yes (drop-in file) |
| **Amazon Q** | `.amazonq/default.json` | project | yes (when project markers exist) |
| **Claude Desktop** | platform path¹ | global | yes |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` | global | yes (when Windsurf dir exists) |
| **Zed** | `~/.config/zed/settings.json` | global | yes (when Zed dir exists) |
| **JetBrains** | Settings UI | — | snippet printed (GUI-only) |

¹ Claude Desktop: macOS `~/Library/Application Support/Claude/claude_desktop_config.json` · Windows `%APPDATA%\Claude\claude_desktop_config.json` · Linux `~/.config/claude-desktop/claude_desktop_config.json`

### Config shape per host

- **Most hosts** — root key `mcpServers`, entry `{ command, args }`
- **VS Code / Claude Code** — root key `servers` or `mcpServers` with `"type": "stdio"`
- **Zed** — root key `context_servers`
- **Global hosts** — `env.SKILL_ROOT` set to your project's `.agents/skills` (absolute), because their cwd is not your workspace. Setup prints the baked path; re-run `npx skilling setup --force` from another project to repoint it.

---

## What `setup` does

1. Resolves project root from `INIT_CWD` / cwd (walks up for `package.json` or `.git`)
2. Seeds **`find-skills`** if missing
3. Chooses launch mode:
   - **Local install** (`node_modules/skilling` present): `command` = absolute Node (`process.execPath`), `args` = absolute `run-mcp.mjs`
   - **No local install**: `command` = `npx`, `args` = `[-y, skilling@latest]`
4. Walks the host registry; merges `skilling` entry into each detected config
5. Prints JetBrains manual snippet and a per-host summary

**SKILL_ROOT at runtime** (when MCP starts): `--skill-root` → `SKILL_ROOT` env → `skilling.config.json` → walk up from cwd for `.agents/skills` → bundled catalog. Literal `${workspaceFolder}` in env is ignored.

### AI comprehension

Skilling ships three layers so agents understand the workflow in any MCP-capable IDE — not only Cursor:

1. **Server instructions** — sent to the model automatically on every MCP connection (list → suggest_skills → begin_task(skill_id) → end_task).
2. **Tool descriptions** — lifecycle tools describe when/why/what-next, not just mechanics.
3. **`skilling_workflow` MCP prompt** — fetch on demand for the full orchestrator procedure.

### Disable duplicate static skill lists

When Skilling MCP is enabled, **remove static `<available_skills>` blocks** from the host system prompt. Use **`list`** on demand (~280 tokens) instead of always-on catalog injection — otherwise you double-pay tokens.

**Per-IDE rules files** — pass **`--write-rules`** to write lifecycle rules (opt-in only; default setup never touches these files):

| IDE | Rules file |
|-----|------------|
| VS Code | `.github/copilot-instructions.md` (appends section; only when that file already exists) |
| Claude Code | `.claude/rules/skilling-lifecycle.md` (creates or appends; only when `.claude/` exists) |
| Windsurf | `.windsurfrules` (appends section; only when `.windsurfrules` or `.windsurf/` exists in the project) |
| JetBrains | `.junie/guidelines.md` (appends section; only when `.junie/` exists) |

Cursor rules live at `.cursor/rules/skilling-lifecycle.mdc` (bundled with the plugin; setup does not overwrite them).

Default `npx skilling setup` does **not** write rules files — pass **`--write-rules`** explicitly.

**Manual setup** — for Claude Desktop, Zed, or other hosts without a standard rules file, paste this block into your system prompt / custom instructions, or fetch the `skilling_workflow` MCP prompt:

```markdown
# Skilling MCP — lifecycle rules

Workflow: list → suggest_skills (optional) → begin_task(skill_id) → follow body → end_task.
- begin_task requires skill_id — call list or suggest_skills first.
- token_budget: 300 discovery, 900 implement (inject shaping only).
- find-skills via begin_task(find-skills, 300) for ecosystem discovery.
- end_task required before switching topics or skills.
- Disable static skill lists in host prompt when Skilling MCP is enabled.
```

---

## Migrating from v1

If you used Skilling **before 2.0.0**:

| v1 | v2 |
|---|---|
| `begin_task(prompt)` auto-routed | **`begin_task(skill_id, …)`** required — call `list` or `suggest_skills` first |
| `skill_plan` plan steps | Deprecated — agent plans; optional `skill_plan` returns `suggestions` only |
| `select` for routing | **`suggest_skills`** (select is deprecated alias) |
| Default budget 2048 | **900** implement, **300** discovery (`phase: plan\|discovery`) |
| Cursor hook auto-injects | **Off by default** — `SKILLING_HOOK_AUTO_INJECT=1` for legacy |
| Monolith skills (mcp-builder, etc.) | **Chunk ids** — e.g. `mcp-builder-implementation`, `create-hook-workflow` |

After upgrading: **`npm install skilling@2`**, run **`npx skilling setup --force`**, **restart MCP**, then **`npm run smoke`**.

Disable static `<available_skills>` blocks in your host system prompt when Skilling MCP is enabled — use **`list`** on demand instead.

---

## Verify

In your IDE or via CLI:

**`list`** → **`suggest_skills`** → **`begin_task(skill_id)`** → **`get_session`** → **`end_task`**

From repo root (Skilling development):

```bash
npm run build
npm run smoke
npm run test:setup
```

See [`docs/MCP_TESTING.md`](MCP_TESTING.md).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| `STORE_UNAVAILABLE` | Empty or missing `.agents/skills` | Re-run `npm install skilling` or `npx skilling setup` |
| MCP not listed after setup | IDE not restarted | Quit and reopen the IDE |
| Stale paths after Node upgrade | Old absolute paths in config | `npx skilling setup --force` |
| Wrong skills on Claude Desktop / Windsurf / Zed | Global `SKILL_ROOT` points at another project | Run setup from the active project: `npx skilling setup --force` |
| `begin_task` validation error | Missing or invalid `skill_id` | Call `list` or `suggest_skills`, then `begin_task(skill_id, …)` |

### Selector and logging

- **`SKILLING_SELECTOR`**: only **`heuristic`** is implemented today
- **`SKILLING_SELECT_MIN_CONFIDENCE`**: default `0.25`
- **`SKILLING_PLAN_MIN_CONFIDENCE`**: default `0.35`; used by hook auto-inject when `SKILLING_HOOK_AUTO_INJECT=1`
- **`SKILLING_LOG_PROMPTS=true`**: logs truncated prompts at debug level

---

## Manual / advanced

If you prefer hand-written config, use [`docs/mcp-config.example.json`](mcp-config.example.json) as a template.

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

**VS Code Copilot** (`servers` + `type`):

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

For **global hosts**, add absolute `SKILL_ROOT`:

```json
"env": { "SKILL_ROOT": "/absolute/path/to/your/project/.agents/skills" }
```

**Develop from source** — use `node` + absolute path to [`scripts/run-mcp.mjs`](../scripts/run-mcp.mjs) or build and point at `dist/index.js`.

Regenerate Cursor MCP deeplink: `npm run deeplink`
