# SkillPilot Lifecycle extension (Sprint C / E)

VS Code / **Cursor** extension for **TTL countdown** and **MCP `cleanup`** after SkillPilot **`begin_task`** or **`load`**. The host agent still calls MCP; the extension does **not** intercept MCP traffic. You **register** the session manually, from **`.skillpilot/session.json`**, or from clipboard JSON.

**Extension details (features, settings, VSIX):** see **[`extension/README.md`](../extension/README.md)**.

## Install

**VSIX (recommended):**

```powershell
cd extension
npm install
npm run compile
npm run package
cursor --install-extension skillpilot-lifecycle-0.2.0.vsix
```

Reload the window. Set `skillpilot.serverEntry` in Settings.

**Development (F5):**

1. Build the MCP server: `npm run build` at repo root.
2. `cd extension && npm install && npm run compile`
3. Open the **SkillPilot repo root** → **F5** → **Run SkillPilot Extension**
4. In the Extension Development Host window, open the repo and set settings (see below).

## Settings

| Setting | Purpose |
|---------|---------|
| **`skillpilot.serverEntry`** | Absolute path to `...\SkillPilot\dist\index.js` (required for cleanup). |
| **`skillpilot.skillRoot`** | Absolute path to `...\SkillPilot\skills` (optional). |
| **`skillpilot.autoCleanupOnTtl`** | Call MCP `cleanup` when TTL fires (default `true`). |
| **`skillpilot.promptBeforeCleanup`** | Confirm before TTL cleanup (default `false`). |
| **`skillpilot.ttlMsOverride`** | If `> 0`, ignore load `ttl_ms` and use this value (ms). |
| **`skillpilot.autoRegisterSession`** | Watch `.skillpilot/session.json` and start TTL automatically (default `true`). |

## Workflow

**Sprint F (preferred):** hook or agent runs **`begin_task`** → extension **auto-registers** when **`skillpilot.autoRegisterSession`** is true (default). Manual **`SkillPilot: Register Active Session`** still available.

**Sprint C (manual):**

1. In chat, run MCP **`load`** (or `select` → `load`). Copy the JSON payload (or at least `correlation_id`, `skill_id`, `ttl_ms`).
2. Run command **`SkillPilot: Register Active Skill from Load JSON`** (clipboard must be the load JSON).
   - Or **`SkillPilot: Register Active Skill…`** and paste fields manually.
3. Status bar shows **`Skill: <id> (Nm)`** — click to **Dismiss** (cleanup now).
4. When TTL expires, extension runs **`cleanup`** via `scripts/extension-cleanup.mjs` (same MCP server as your config).

## Commands

- **`skillpilot.registerActiveSession`** — read **`.skillpilot/session.json`** after **`begin_task`**.
- **`skillpilot.registerFromClipboard`** — parse load JSON from clipboard.
- **`skillpilot.registerActiveSkill`** — wizard for correlation_id / skill_id / TTL.
- **`skillpilot.dismissActiveSkill`** — cleanup now and clear status bar.

## Troubleshooting Register Active Session

If chat **`begin_task`** worked but the command says **no `.skillpilot/session.json`**:

1. Set **`skillpilot.serverEntry`** to your `dist/index.js` (repo root = that file’s parent), or **`skillpilot.skillRoot`** to your `skills` folder (repo root = parent of `skills/`).
2. Re-run the command. You do **not** need the workspace root folder open if those settings point at the SkillPilot repo (common when the Extension Dev Host opened only `extension/`).
3. Confirm the file exists: `<repo>/.skillpilot/session.json` after **`begin_task`**, before **`end_task`**.

## Cursor hooks (Sprint E2)

When a **composer conversation ends**, the project **`sessionEnd`** hook (`.cursor/hooks.json`) runs the same **`extension-cleanup.mjs`** logic and removes **`.skillpilot/session.json`**. You do not need the extension for that path — but the extension still helps for **TTL countdown** and **dismiss mid-chat**.

Reload Cursor after changing hooks. See **`docs/AUTONOMOUS_USAGE.md`** § E2.

## Limitations (v0.3)

- Auto-register requires resolving repo root via `skillpilot.serverEntry` / `skillpilot.skillRoot` or an open workspace containing `.skillpilot/session.json`.
- Cleanup spawns a **separate** MCP process; correlation ids are only meaningful in the **same** server process as the agent’s session for bookkeeping — MCP `cleanup` is still **idempotent** at the protocol level.
- Packaged VSIX must include `extension/scripts/extension-cleanup.mjs` and the user must have the SkillPilot repo’s `node_modules` (run from repo layout) or future packaging work.

## MCP config

Keep your existing **`mcp.json`** / Cursor MCP entry for the agent. The extension only needs **`skillpilot.serverEntry`** aligned with that entry’s `dist/index.js` path.
