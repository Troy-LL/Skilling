# Cursor and VS Code — MCP host wiring

Use **`docs/mcp-config.example.json`** as the shape of the `mcpServers` entry. Replace `<REPO>` with **absolute paths** on your machine.

## Cursor

1. Open **Cursor Settings → MCP** (or add project-level **`.cursor/mcp.json`**).
2. Merge the `skillpilot` block from `mcp-config.example.json`.
3. Set:
   - `command`: `node` (or full path to `node.exe` on Windows if GUI apps lack PATH).
   - `args`: `[ "<REPO>/SkillPilot/dist/index.js" ]` or add `"--skill-root", "<REPO>/SkillPilot/.agents/skills"`.
   - `env.SKILL_ROOT`: `"<REPO>/SkillPilot/.agents/skills"` (**canonical**; do not point at `skills/` unless you only use ingest).

Restart MCP / reload window after edits.

### Stale tool list

After pulling:

```bash
cd <REPO>/SkillPilot
npm run build
npm run smoke
```

Restart the `skillpilot` MCP server in Cursor. You should see **`skill_plan`**, **`health`**, **`skill_list`** aliases, and lifecycle tools.

### Selector and logging

- **`SKILLPILOT_SELECTOR`**: only **`heuristic`** is implemented today. Values `embedding` or `llm` log a one-time warning and fall back to heuristic.
- **`SKILLPILOT_SELECT_MIN_CONFIDENCE`**: minimum score to return a skill from `select` / `begin_task` (default `0.25`).
- **`SKILLPILOT_PLAN_MIN_CONFIDENCE`**: minimum score for a skill to appear in `skill_plan` `skills_needed` (default `0.35`). `begin_task` rejects auto-select below this when `low_confidence` applies.
- **`SKILLPILOT_LOG_PROMPTS=true`**: logs truncated prompt/goal snippets at debug level for `select`, `skill_plan`, and `begin_task` (stderr JSON lines).

## VS Code

Use the same `mcpServers.skillpilot` object per your MCP extension’s JSON config.

## Verify in the IDE

**`list`** → **`skill_plan`** → **`begin_task`** → **`get_session`** → **`end_task`**.

CLI (no IDE): from repo root with `SKILL_ROOT` set:

```powershell
$env:SKILL_ROOT = "$PWD/.agents/skills"
npm run smoke
```

See **`docs/MCP_TESTING.md`**.
