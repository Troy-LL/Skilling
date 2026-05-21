---
id: mcp-builder-implementation
title: MCP Server Implementation
summary: Phase 2 — project structure, shared infra, tool schemas, annotations, and structured tool responses.
tags:
  - mcp
  - server
  - implementation
  - typescript
  - python
triggers:
  - implement mcp server
  - mcp server implementation
  - build mcp tools
  - register mcp tools
  - mcp tool schemas
inject_mode_default: compact
inject_brief: "Phase 2: scaffold project, shared API client, Zod/Pydantic schemas, tool registration, annotations."
inject_sections:
  - When to use
  - Project structure
  - Core infrastructure
  - Implement tools
  - Procedure
  - Quality checklist
---

## When to use

Apply after Phase 1 planning (`mcp-builder-overview`) when you have a tool inventory and stack choice.

**Next stage:** `mcp-builder-evaluation` after build passes and tools register in MCP Inspector.

## Project structure

**TypeScript:** See `../mcp-builder/reference/node_mcp_server.md` — `package.json`, `tsconfig.json`, entry server file, `src/tools/`, `src/client/`, env-based config.

Minimal layout:
```
src/
  index.ts          # server init, transport
  client.ts         # authenticated API client
  errors.ts         # map API errors → actionable messages
  tools/
    list-items.ts   # one file per tool or domain group
```

**Python:** See `../mcp-builder/reference/python_mcp_server.md` — single module or package, FastMCP instance, tool modules.

Run scaffold via `typescript-mcp-server-generator` when starting from zero in TypeScript.

## Core infrastructure

Build shared utilities **before** individual tools:

1. **API client** — auth headers, base URL, timeout, retry for transient failures.
2. **Error handling** — catch HTTP/API errors; return messages with suggested next steps (missing param, invalid ID, rate limit → wait/retry).
3. **Response formatting** — JSON for structured data; markdown summaries for human-readable lists when helpful.
4. **Pagination** — accept `cursor`/`limit`; return `next_cursor` in structured output when API supports it.

## Implement tools

For **each** planned tool:

### Input schema
- **TypeScript:** Zod schema with `.describe()` on every field; constraints (min/max, enum, regex).
- **Python:** Pydantic model with `Field(description=...)`.
- Include examples in field descriptions where non-obvious.

### Output schema
- Define `outputSchema` when SDK supports it.
- Return `structuredContent` (TypeScript SDK) alongside text content for machine parsing.
- Document return shape in tool description.

### Tool description
- One-line summary of what the tool does.
- When to use vs sibling tools.
- Parameter and return documentation (mirror schema).

### Implementation
- Async I/O for network calls.
- Map service errors to actionable MCP errors.
- Support pagination parameters where applicable.
- Never log secrets; read credentials from env.

### Annotations (set accurately)
| Hint | When true |
|------|-----------|
| `readOnlyHint` | No side effects (GET, list, search) |
| `destructiveHint` | Deletes or irreversible writes |
| `idempotentHint` | Safe to retry (PUT with stable id, delete-by-id) |
| `openWorldHint` | Interacts with external/live systems |

**TypeScript registration:**
```typescript
server.registerTool("svc_list_items", {
  description: "List items with optional cursor pagination",
  inputSchema: listItemsSchema,
  annotations: { readOnlyHint: true, openWorldHint: true },
}, async (input) => { /* ... */ });
```

**Python registration:**
```python
@mcp.tool(annotations={"readOnlyHint": True, "openWorldHint": True})
async def svc_list_items(cursor: str | None = None, limit: int = 20) -> str:
    ...
```

## Procedure

1. Scaffold or verify project structure for chosen language.
2. Implement API client + error mapper + pagination helpers.
3. Implement tools from Phase 1 inventory — highest-value reads first, then writes.
4. Set annotations per tool; verify input/output schemas compile.
5. Run build (`npm run build` or `python -m py_compile`).
6. Smoke-test each tool in MCP Inspector: `npx @modelcontextprotocol/inspector`.
7. **`end_task`** → `begin_task(mcp-builder-evaluation, 900)`.

## Quality checklist

- [ ] No duplicated API/error logic (DRY)
- [ ] Every tool has description, input schema, and correct annotations
- [ ] Errors are actionable, not raw stack traces
- [ ] Pagination on list/search tools where API supports it
- [ ] Secrets from environment only
- [ ] Build succeeds; Inspector lists all tools
