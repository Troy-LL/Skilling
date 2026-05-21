---
id: typescript-cli
title: TypeScript CLI Tools
summary: Build Node/TypeScript CLI tools and small scripts — arg parsing, env, file I/O — not MCP servers.
tags:
  - typescript
  - node
  - cli
  - script
triggers:
  - cli tool
  - command line tool
  - node script
  - typescript script
  - npm package cli
  - simple cli
  - terminal app
token_estimate: 600
ttl_seconds: 1800
---

# TypeScript CLI Tools

Use when the user wants a **command-line tool or small Node/TypeScript script** — not an MCP server, web app, or full framework project.

## When to use

- CLI utilities (weather fetcher, file converter, batch processor)
- Scripts with args, stdin/stdout, env vars
- Small `npm` packages with a `bin` entry
- Local dev tooling and one-off automation

**Not for:** MCP servers (use `mcp-builder` / `typescript-mcp-server-generator`), web UI (use `frontend-design`), or discovering new skills (use `find-skills`).

## Procedure

1. **Clarify scope** — inputs, outputs, runtime (Node version), and whether it is a one-off script or publishable package.
2. **Project layout** — for packages: `package.json` with `"type": "module"`, `tsconfig.json`, `src/`, entry in `bin` or `main`.
3. **Args and env** — prefer `process.argv` parsing or a minimal parser; document required env vars; fail fast with clear usage text.
4. **Implementation** — async I/O with `node:fs/promises`, `fetch` for HTTP APIs; handle errors with actionable stderr messages and non-zero exit codes.
5. **Verify** — run with sample args; add a `--help` path when the tool has multiple flags.

## Conventions

- Use TypeScript strict mode; ESM (`import`/`export`) unless the repo uses CommonJS.
- Keep dependencies minimal; avoid frameworks for simple CLIs.
- Print human-readable errors to stderr; reserve stdout for machine-readable output when piping.

## Do not

- Scaffold MCP SDK boilerplate unless the user explicitly asked for MCP.
- Over-engineer config layers for a single-purpose script.
