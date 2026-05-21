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
| **Claude Code** | `.mcp.json` | project | yes (when project has `package.json` / `.git`) |
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
- **Global hosts** — `env.SKILL_ROOT` set to your project's `.agents/skills` (absolute), because their cwd is not your workspace

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

---

## Verify

In your IDE or via CLI:

**`list`** → **`skill_plan`** → **`begin_task`** → **`get_session`** → **`end_task`**

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
| `begin_task` validation error ~0.3x confidence | Weak heuristic match | Pass explicit `skill_id` or use `load` with `inject_mode: compact` |

### Selector and logging

- **`SKILLING_SELECTOR`**: only **`heuristic`** is implemented today
- **`SKILLING_SELECT_MIN_CONFIDENCE`**: default `0.25`
- **`SKILLING_PLAN_MIN_CONFIDENCE`**: default `0.35`; `begin_task` rejects weak auto-select below this
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
