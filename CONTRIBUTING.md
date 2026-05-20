# Contributing

## Setup

```bash
npm install
npm run build
npm test
npm run smoke
```

## Skill catalog changes

- Install ecosystem skills with `npx skills add <pkg> -y` (project-local, not `-g`).
- Add routing metadata in `.agents/skills-meta/<skill-id>.yaml` — do not edit upstream `SKILL.md` bodies when avoidable.
- Run `npm run benchmark` — Section 2b must pass (selection regression).

## Pull requests

- Keep diffs focused; match existing TypeScript and test style (`node:test`).
- No secrets, `.env`, or local `mcp.json` paths in commits.

## Publish

```bash
npm run pack:check   # verify tarball contents
npm login
npm publish --access public
```

Use **`--access`** (not `--acess`). npm will prompt for a one-time password if 2FA is enabled on your account.

See [docs/PUBLISHING.md](docs/PUBLISHING.md) for Cursor Marketplace steps.
