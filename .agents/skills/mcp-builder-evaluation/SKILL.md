---
id: mcp-builder-evaluation
title: MCP Server Evaluation
summary: Phase 3 review/test and Phase 4 eval harness — quality gate, Inspector smoke test, 10 QA pairs.
tags:
  - mcp
  - server
  - testing
  - evaluation
  - qa
triggers:
  - test mcp server
  - mcp server evaluation
  - mcp eval harness
  - review mcp server
  - mcp qa pairs
inject_mode_default: compact
inject_brief: "Phase 3–4: code review, Inspector test, 10 independent read-only eval questions with verified answers."
inject_sections:
  - When to use
  - Code quality review
  - Build and test
  - Create evaluations
  - Procedure
  - Output format
---

## When to use

Apply after Phase 2 implementation (`mcp-builder-implementation`) when tools build and register successfully.

Validates the server works for LLM agents and produces a regression eval set.

## Code quality review

Review the implementation for:

- **DRY** — shared client/error/pagination logic, not copy-pasted per tool
- **Consistent errors** — same format and tone across tools
- **Type coverage** — no untyped `any` escape hatches on public tool boundaries
- **Descriptions** — every tool self-explanatory; parameters documented
- **Annotations** — `readOnlyHint` / `destructiveHint` match actual behavior
- **Security** — no hardcoded tokens; minimal scopes

Fix issues before writing evaluations.

## Build and test

**TypeScript:**
```bash
npm run build
npx @modelcontextprotocol/inspector
```

**Python:**
```bash
python -m py_compile your_server.py
npx @modelcontextprotocol/inspector
```

In Inspector:
1. Connect via configured transport (stdio or HTTP).
2. List tools — confirm names, schemas, annotations.
3. Call each read-only tool with valid and invalid inputs; verify error messages guide fixes.
4. Spot-check write tools in a sandbox if available.

See language guides in `../mcp-builder/reference/` for extended checklists.

## Create evaluations

**Purpose:** Test whether an LLM can use your MCP server to answer realistic, complex questions — not unit-test individual endpoints.

Load `../mcp-builder/reference/evaluation.md` for extended guidelines and runner scripts when available.

### Requirements per question

Each of the **10 questions** must be:

| Criterion | Meaning |
|-----------|---------|
| **Independent** | No dependency on other questions' answers |
| **Read-only** | Answerable without destructive tool calls |
| **Complex** | Requires multiple tool calls and exploration |
| **Realistic** | Reflects real user tasks |
| **Verifiable** | Single clear answer (string/numeric compare) |
| **Stable** | Answer won't change over time |

### Authoring process

1. **Tool inspection** — list all tools; note inputs, outputs, pagination.
2. **Content exploration** — use read-only tools yourself to learn available data.
3. **Draft 10 questions** — progressively harder; each needs ≥2 tool calls.
4. **Solve each question** — record the verified answer yourself before adding to the file.
5. **Reject** questions needing writes, multi-step state, or subjective judgment.

### Example question shape

> Find discussions about AI model launches with animal codenames. One model needed safety designation ASL-X. What number X was determined for the model named after a spotted wild cat?

Answer: `3` (single verifiable token)

## Procedure

1. Run code quality review checklist; fix gaps.
2. Build and connect MCP Inspector; smoke-test all tools.
3. Inspect tools and explore data read-only.
4. Write 10 QA pairs meeting all criteria; verify each answer manually.
5. Save eval XML (see Output format).
6. Run eval runner if bundled scripts exist.
7. **`end_task`** when eval file is committed and smoke tests pass.

## Output format

Create `evaluations/<server-name>.xml`:

```xml
<evaluation>
  <qa_pair>
    <question>Your complex read-only question here?</question>
    <answer>exact-verifiable-answer</answer>
  </qa_pair>
  <!-- 9 more qa_pair elements -->
</evaluation>
```

Answers must match exactly what string comparison expects (case, formatting). Document any normalization the runner applies.
