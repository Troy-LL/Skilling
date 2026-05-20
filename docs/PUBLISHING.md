# Publishing SkillPilot

## npm (`skillpilot-mcp`)

Package name: **`skillpilot-mcp`**. Binary: **`skillpilot-mcp`** → `scripts/run-mcp.mjs` (sets bundled `SKILL_ROOT` unless overridden).

### Verify tarball before publish

```bash
npm run pack:check
```

Expect ~120–180 files, ~170 KB packed (no `src/`, `extension/`, or large optional skill scripts).

### Publish

```bash
npm login
npm publish --access public
```

First-time publishers need an npm account and a public GitHub repo ([Troy-LL/SkillPilot](https://github.com/Troy-LL/SkillPilot)).

After publish, users install with the README deeplink or:

```json
{
  "mcpServers": {
    "skillpilot": {
      "command": "npx",
      "args": ["-y", "skillpilot-mcp@latest"],
      "env": { "SKILL_ROOT": "${workspaceFolder}/.agents/skills" }
    }
  }
}
```

Regenerate deeplink: `node scripts/generate-mcp-deeplink.mjs`

---

## Cursor Marketplace (official plugin)

This repo is packaged as a [Cursor plugin](https://cursor.com/docs/plugins): manifest at [`.cursor-plugin/plugin.json`](../.cursor-plugin/plugin.json), `mcp.json`, and `hooks/`.

### Local test (before submit)

1. Build the server:

   ```bash
   npm install
   npm run build
   ```

2. Symlink into Cursor local plugins (adjust paths):

   ```bash
   # macOS / Linux
   ln -s "$(pwd)" ~/.cursor/plugins/local/skillpilot

   # Windows (junction — no admin on most setups)
   $target = (Get-Location).Path
   $link = "$env:USERPROFILE\.cursor\plugins\local\skillpilot"
   New-Item -ItemType Directory -Force -Path (Split-Path $link) | Out-Null
   if (Test-Path $link) { cmd /c "rmdir `"$link`"" }
   cmd /c "mklink /J `"$link`" `"$target`""
   ```

3. Restart Cursor or **Developer: Reload Window**.

4. Open a **different** workspace (not only this repo) and enable **skillpilot** MCP.

5. Verify: `npm run smoke` and `npm run benchmark`.

**Hooks:** Commands in `hooks/hooks.json` are relative to the plugin install directory. If auto-begin fails in another workspace, set `SKILLPILOT_SERVER_ROOT` to your SkillPilot clone. MCP tools work without hooks.

### Submit to Cursor Marketplace

1. Ensure [NOTICE](../NOTICE), [LICENSE](../LICENSE), and README install instructions are on `main`.
2. Open **[cursor.com/marketplace/publish](https://cursor.com/marketplace/publish)**.
3. Submit repository URL: `https://github.com/Troy-LL/SkillPilot`
4. Expect **manual review** (curated marketplace).

### Checklist

- [x] `.cursor-plugin/plugin.json` — manifest present
- [x] `NOTICE` — third-party skill attribution
- [x] Portable `mcp.json` (npx, no absolute paths)
- [x] `npm test` and `npm run benchmark` pass
- [ ] `npm publish` — run locally after `npm login`
- [ ] Symlink test in non–SkillPilot workspace
- [ ] Marketplace submission form completed

## Community MCP listing

For [cursor.directory](https://cursor.directory/), submit the public repo with the npx MCP snippet from [`mcp-config.example.json`](mcp-config.example.json).
