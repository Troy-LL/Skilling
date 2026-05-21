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
npm test
npm run pack:check
npm publish --access public
```

### 2.1.1 release (routing polish)

- **`suggest_skills`**: no longer returns `weak_candidates` — use `candidates[]` and pick from `list` / plan
- **`skill_plan.estimated_tokens`**: primary included match only (one stage); budget per skill via `suggestions[].inject_token_estimate`

### 2.1.0 release (catalog chunking + routing polish)

Ship after merge when ready:

```bash
npm test          # unit + setup + hooks + smoke
npm run benchmark # Section 2b selection regression + per-chunk rows
npm run pack:check
npm publish --access public
```

**2.1.0** highlights (non-breaking):

- Hybrid **chunk skills** for `mcp-builder`, `skill-creator`, and `create-hook` (legacy monolith ids catalog-only)
- **`suggest_skills` weak band** (≥0.15) with `weak_candidates`; aligned rounding vs `skill_plan` `included`
- Metadata overlays: orchestrator, find-skills, create-rule; `inject_brief` / `inject_sections` fixes
- Docs sync (README, SKILLS_CATALOG, HOST_MCP_SETUP v1 migration); post-publish MCP restart checklist
- Smoke/benchmark: shaping metadata asserts, per-chunk compact inject rows, selection regression on chunk ids

### 2.0.0 release (breaking — context engine rework)

Ship after merge when ready:

```bash
npm test          # unit + setup + hooks + smoke
npm run benchmark # Section 2b selection regression
npm run pack:check
npm publish --access public
```

**2.0.0** breaking changes:

- `begin_task` **requires `skill_id`** — use `list` or `suggest_skills` first
- New **`suggest_skills`** tool (heuristics only; `select` is a deprecated alias)
- `token_budget` is **inject-only**; use `select_max_tokens` on `suggest_skills` for selection caps
- Default inject budget **900** (discovery/plan phase → **300**)
- `skill_plan` deprecated — returns `suggestions` + shaped token estimates (no plan steps)
- Cursor hook auto-inject **off by default** — set `SKILLING_HOOK_AUTO_INJECT=1` for legacy behavior

### 1.7.1 release (supersedes 1.7.0 on npm)

**1.7.1** includes: `--write-rules` opt-in and scoped rules writes, deeplink/config without `${workspaceFolder}`, smoke coverage for server instructions + MCP prompt, Claude Code MCP detect tied to `.mcp.json`/`.claude/`, global-host repoint messaging.

First-time publishers need an npm account and a public GitHub repo ([Troy-LL/SkillPilot](https://github.com/Troy-LL/SkillPilot)).

After publish, users install from **[cursor.directory/plugins/skilling](https://cursor.directory/plugins/skilling)** (full plugin; **Add to Cursor** on that page) or via `npm install skilling` for zero-config auto-setup.

**Post-publish (required):** restart or reload the MCP server in every host (Cursor, Claude Desktop, VS Code, etc.) so clients load new tools and schemas. Verify with `npm run smoke` or MCP Inspector (`suggest_skills` present; `begin_task` without `skill_id` returns validation error).

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
- [ ] `npm test` green
- [ ] `npm run test:setup` green (postinstall + setup script validation)
- [ ] `npm run smoke` green (full MCP lifecycle)
- [ ] `npm run pack:check` reviewed
- [ ] README install section matches `mcp.json` / deeplink
- [ ] `docs/HOST_MCP_SETUP.md` host compatibility table current
- [ ] Changelog or release notes for breaking renames or new features

---

## VS Code extension (`skilling-lifecycle`)

Optional companion extension under [`extension/`](../extension/). Not published to npm with the MCP server.

```bash
cd extension
npm install
npm run compile
```

Package with `vsce package` when ready to publish to Open VSX / Marketplace.
