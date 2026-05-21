---
name: create-hook-workflow
description: Analyze project tooling, suggest Claude Code hooks, and configure hook scripts with proper scope and Claude integration
argument-hint: Optional hook type or desired behavior
---

# Create Hook — Workflow

Analyze the project, suggest practical hooks, configure them, then validate with **create-hook-testing**.

## Your Task

1. **Analyze environment** — Detect tooling and existing hooks
2. **Suggest hooks** — Based on project configuration
3. **Configure hook** — Ask targeted questions and create the script
4. **Test & validate** — Use **create-hook-testing** for happy/sad paths

## Your Workflow

### 1. Environment Analysis & Suggestions

Automatically detect project tooling and suggest relevant hooks:

**When TypeScript is detected (`tsconfig.json`):**

- PostToolUse: "Type-check files after editing"
- PreToolUse: "Block edits with type errors"

**When Prettier is detected (`.prettierrc`, `prettier.config.js`):**

- PostToolUse: "Auto-format files after editing"
- PreToolUse: "Require formatted code"

**When ESLint is detected (`.eslintrc.*`):**

- PostToolUse: "Lint and auto-fix after editing"
- PreToolUse: "Block commits with linting errors"

**When package.json has scripts:**

- `test` script → "Run tests before commits"
- `build` script → "Validate build before commits"

**When a git repository is detected:**

- PreToolUse/Bash hook: "Prevent commits with secrets"
- PostToolUse: "Security scan on file changes"

**Decision tree:**

```
TypeScript? → type-check hooks
Formatter? → formatting hooks
Tests? → test validation hooks
Security sensitive? → security hooks
Also scan: custom package.json scripts, file patterns, workflow indicators
```

### 2. Hook Configuration

Start with **"What should this hook do?"** and offer suggestions from your analysis.

Ask only about details you are unsure of:

1. **Trigger timing**: `PreToolUse` (before, can block), `PostToolUse` (after, feedback/fixes), `UserPromptSubmit`, or other events as needed
2. **Tool matcher**: Which tools? (`Write`, `Edit`, `Bash`, `*`, etc.)
3. **Scope**: `global` (`~/.claude/`), `project` (`.claude/`), or `project-local`
4. **Response approach**: exit codes for simple pass/fail; JSON for blocking, context, and rich feedback
5. **Blocking behavior**: Should operations stop when issues are found? (PreToolUse can block; PostToolUse usually feedback only)
6. **Claude integration** (CRITICAL): Should Claude automatically see and fix issues?
   - YES → `additionalContext` for errors
   - NO → `suppressOutput: true` for silent success
7. **Context pollution**: Silent on success for formatting/routine checks; loud for security/critical errors
8. **File filtering**: Which extensions or paths?

### 3. Hook Creation

- **Create hooks directory**: `~/.claude/hooks/` or `.claude/hooks/` per scope
- **Generate script**: shebang, executable permissions, detected config paths, purpose comments
- **Update settings**: register in the correct `settings.json`
- **Use absolute paths**: `$CLAUDE_PROJECT_DIR` for project root; avoid relative script paths
- **Offer validation**: ask if the user wants testing (see **create-hook-testing**)

**Implementation standards:**

- Read JSON from stdin (never argv)
- Top-level `additionalContext` / `systemMessage` for Claude communication
- `suppressOutput: true` on successful operations
- Specific error counts and actionable feedback
- Focus on changed files, not the whole codebase

**Critical I/O:**

- **Input**: parse JSON from stdin correctly
- **Output**: correct top-level JSON structure for Claude
- Consult official docs when schemas are unclear: <https://docs.claude.com/en/docs/claude-code/hooks>

### 4. Hand off to templates and testing

- Script patterns and settings blocks → **create-hook-templates**
- Happy/sad path tests, success criteria, troubleshooting → **create-hook-testing**
