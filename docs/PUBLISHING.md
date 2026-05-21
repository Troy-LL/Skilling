# Publishing Skilling

## npm (`skilling`)

Package name: **`skilling`**. Binary: **`skilling`** → `scripts/run-mcp.mjs`. **`npm install skilling`** runs postinstall (seed + auto setup); **`npx skilling setup`** for manual refresh.

Publish auth: use a **granular access token** with publish permission and **bypass 2FA for automation** (or a classic **Automation** token) if your npm account has 2FA enabled.

The legacy package [`skillpilot-mcp`](https://www.npmjs.com/package/skillpilot-mcp) can be deprecated after `skilling` is live; point users at `npx -y skilling@latest`.

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

After publish, users install from **[cursor.directory/plugins/skilling](https://cursor.directory/plugins/skilling)** (full plugin; **Add to Cursor** on that page) or the README MCP deeplink badge (server only):


```json
{
  "mcpServers": {
    "skilling": {
      "command": "npx",
      "args": ["-y", "skilling@latest"],
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
npm install && npm run build
```

2. In Cursor, add MCP from [`mcp.json`](../mcp.json) or run `node scripts/generate-mcp-deeplink.mjs` for a deeplink.
3. Enable hooks from [`.cursor/hooks.json`](../.cursor/hooks.json) if testing autonomous routing.

### Submit checklist

- [ ] `package.json` version bumped
- [ ] `.cursor-plugin/plugin.json` version aligned
- [ ] `npm run test` green
- [ ] `npm run pack:check` reviewed
- [ ] README install section matches `mcp.json` / deeplink
- [ ] Changelog or release notes for breaking renames (SkillPilot → Skilling, `.skillpilot/` → `.skilling/`)

---

## VS Code extension (`skilling-lifecycle`)

Optional companion extension under [`extension/`](../extension/). Not published to npm with the MCP server.

```bash
cd extension
npm install
npm run compile
```

Package with `vsce package` when ready to publish to Open VSX / Marketplace.
