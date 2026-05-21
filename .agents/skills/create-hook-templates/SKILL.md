---
name: create-hook-templates
description: Hook script templates, settings.json patterns, and quick reference for Claude Code hooks
---

# Create Hook — Templates & Reference

Use after **create-hook-workflow** analysis. Copy/adapt templates; register in `settings.json`.

## Hook Templates

### Type checking (PostToolUse)

```javascript
#!/usr/bin/env node
const input = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const file = input.tool_input?.file_path ?? '';
if (!/\.tsx?$/.test(file)) process.exit(0);
const { execSync } = require('child_process');
try {
  execSync('npx tsc --noEmit --pretty', { stdio: 'pipe' });
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
} catch (e) {
  console.log(JSON.stringify({
    continue: true,
    additionalContext: String(e.stdout ?? e.message),
  }));
}
```

### Auto-formatting (PostToolUse)

```javascript
#!/usr/bin/env node
const input = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const file = input.tool_input?.file_path ?? '';
if (!/\.(ts|tsx|js|jsx|json|md)$/.test(file)) process.exit(0);
require('child_process').execSync(`npx prettier --write "${file}"`);
console.log(JSON.stringify({ continue: true, suppressOutput: true }));
```

### Security scanning (PreToolUse)

```bash
#!/bin/bash
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
if echo "$CMD" | grep -qE '(AKIA|sk_live_|-----BEGIN (RSA )?PRIVATE KEY)'; then
  echo "Blocked: possible secret in command" >&2
  exit 2
fi
exit 0
```

### Block protected files (PreToolUse)

```bash
#!/bin/bash
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
for p in ".env" "package-lock.json" ".git/"; do
  [[ "$FILE" == *"$p"* ]] && { echo "Blocked: $FILE" >&2; exit 2; }
done
exit 0
```

More examples: <https://docs.claude.com/en/docs/claude-code/hooks#examples>

## Settings registration

**PostToolUse — format after Edit/Write** (`.claude/settings.json`):

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{
        "type": "command",
        "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write"
      }]
    }]
  }
}
```

**PreToolUse — protect files**:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{
        "type": "command",
        "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/protect-files.sh"
      }]
    }]
  }
}
```

**Notification — desktop alert** (Windows PowerShell):

```json
{
  "hooks": {
    "Notification": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "powershell.exe -Command \"[System.Windows.Forms.MessageBox]::Show('Claude needs attention','Claude Code')\""
      }]
    }]
  }
}
```

Locations: `~/.claude/settings.json` (global), `.claude/settings.json` (project). Make scripts executable: `chmod +x`.

## Quick reference

**Official docs**: <https://docs.claude.com/en/docs/claude-code/hooks>

**Common patterns:**

- **stdin**: `JSON.parse(fs.readFileSync(0, 'utf8'))` or `INPUT=$(cat)`
- **Filter files**: check extension/path before running tools
- **Success**: `{ "continue": true, "suppressOutput": true }`
- **Feedback**: `{ "continue": true, "additionalContext": "..." }`
- **Block (PreToolUse)**: `exit 2` with message on stderr

**Hook types by use case:**

- **Code quality**: PostToolUse for feedback and fixes
- **Security**: PreToolUse to block dangerous operations
- **CI/CD**: PreToolUse before commits/pushes
- **Development**: PostToolUse for automated improvements

**Execution notes:**

- Hooks run in parallel; design for independence
- Order is not guaranteed when multiple hooks touch the same files
- Use matchers (`Edit|Write`, `Bash`, `*`) to limit scope
