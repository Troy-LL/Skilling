---
id: mcp-builder-overview
title: MCP Server Planning
summary: Phase 1 — research MCP design, study protocol/SDK docs, map API coverage, and plan tool naming.
tags:
  - mcp
  - server
  - planning
  - research
  - api
triggers:
  - plan mcp server
  - mcp server planning
  - design mcp tools
  - mcp api coverage
  - mcp research phase
inject_mode_default: compact
inject_brief: "Phase 1: MCP design principles, protocol/SDK docs, API mapping, tool naming plan."
inject_sections:
  - When to use
  - MCP design principles
  - Study MCP docs
  - Study framework docs
  - API research and tool plan
  - Procedure
  - Deliverables
---

## When to use

Apply at the **start** of MCP server work — before writing code. Covers Phase 1: deep research and planning.

**Next stage:** `mcp-builder-implementation` after you have a tool list and stack choice.

**Not for:** scaffolding boilerplate — use `typescript-mcp-server-generator`. Evaluation harness — use `mcp-builder-evaluation`.

## MCP design principles

**API coverage vs workflow tools:** Balance full endpoint coverage with convenience workflow tools. When uncertain, **prioritize comprehensive API coverage** — agents compose basic tools; some clients execute code to combine them.

**Tool naming:** Clear, action-oriented names with consistent prefixes (e.g. `github_create_issue`, `github_list_repos`). Names are the primary discovery mechanism.

**Context management:** Concise descriptions; paginate/filter large results. Return focused data, not raw API dumps.

**Actionable errors:** Messages must suggest fixes and next steps, not just status codes.

**Transport:**
- **Remote:** Streamable HTTP, stateless JSON (simpler to scale).
- **Local:** stdio.

**Stack (recommended):** TypeScript + MCP TypeScript SDK — strong typing, broad AI codegen support, good linting.

## Study MCP docs

1. Open sitemap: `https://modelcontextprotocol.io/sitemap.xml`
2. Fetch pages with `.md` suffix for markdown (e.g. `https://modelcontextprotocol.io/specification/draft.md`).
3. Review: architecture overview, transports (streamable HTTP, stdio), tool/resource/prompt definitions, tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`).

Load bundled reference if present: `../mcp-builder/reference/mcp_best_practices.md` — naming, pagination, response formats, security.

## Study framework docs

**TypeScript (recommended):**
- SDK README: `https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md`
- Bundled guide: `../mcp-builder/reference/node_mcp_server.md` (project structure, Zod schemas, `registerTool`)

**Python:**
- SDK README: `https://raw.githubusercontent.com/modelcontextprotocol/python-sdk/main/README.md`
- Bundled guide: `../mcp-builder/reference/python_mcp_server.md` (FastMCP, Pydantic, `@mcp.tool`)

Use WebFetch for remote READMEs when bundled references are missing.

## API research and tool plan

1. **Understand the service API** — auth (API keys, OAuth), rate limits, pagination, error shapes, idempotency.
2. **List endpoints** to expose as tools; start with highest-value read + common write operations.
3. **Draft tool inventory** — one row per tool:

| Tool name | HTTP/API op | readOnly | destructive | Notes |
|-----------|-------------|----------|-------------|-------|
| `svc_list_items` | GET /items | yes | no | paginated |

4. **Input/output sketch** — key parameters, structured vs markdown response, pagination cursors.
5. **Shared infra needs** — auth client, error mapper, pagination helper, response formatter.

## Procedure

1. Confirm target service, runtime (local stdio vs remote HTTP), and language.
2. Read MCP design principles above; note transport and naming prefix (`<service>_`).
3. Fetch MCP spec pages for tools and transports.
4. Load SDK README + language guide for chosen stack.
5. Research service API docs (WebSearch/WebFetch); capture auth and pagination.
6. Produce tool inventory table with annotation hints.
7. **`end_task`** → `begin_task(mcp-builder-implementation, 900)`.

## Deliverables

Before leaving Phase 1, you should have:
- Chosen language and transport
- Service prefix and naming convention
- Tool inventory (names, API mapping, annotation hints)
- Notes on auth, pagination, and error patterns
- List of shared utilities to build first
