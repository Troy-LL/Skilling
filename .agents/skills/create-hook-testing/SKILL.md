---
name: create-hook-testing
description: Test Claude Code hooks with happy/sad paths, validate I/O, and troubleshoot failures
---

# Create Hook — Testing & Validation

Run after **create-hook-workflow** creates and registers a hook. Confirm both pass and fail behavior.

## Testing procedure

**CRITICAL: test happy and sad paths.**

### Happy path

1. Create conditions where the hook should **pass**
   - TypeScript: valid code
   - Linting/formatting: clean files
   - Security: safe commands

### Sad path

2. Create conditions where the hook should **fail, warn, or block**
   - TypeScript: type errors
   - Linting: unformatted code
   - Security: dangerous operations or protected paths

### Verification

3. Confirm expected behavior: blocks, warns, or injects `additionalContext` as designed
4. Example: for a file-protection hook, create a test file, attempt a blocked edit, verify exit 2 and stderr message

### Manual smoke test

Pipe sample JSON to the script:

```bash
echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}' | ./my-hook.sh
echo $?   # 2 = blocked, 0 = allowed

echo '{"tool_name":"Edit","tool_input":{"file_path":"src/ok.ts"}}' | ./my-hook.sh
```

For PostToolUse JSON output hooks, capture stdout on exit 0 and verify parseable JSON with expected fields.

## Input/output checklist

- [ ] Script reads **stdin JSON**, not argv
- [ ] PreToolUse block uses **exit 2** + stderr (or exit 0 + JSON decision per event schema)
- [ ] Success paths use **`suppressOutput: true`** when silent
- [ ] Errors use **`additionalContext`** when Claude should auto-fix
- [ ] stdout contains **only JSON** when returning JSON (no shell profile noise)
- [ ] Script is **executable** (`chmod +x`) and referenced with absolute/`$CLAUDE_PROJECT_DIR` paths
- [ ] Hook appears under correct event in `/hooks` or settings after reload

**Exit code 2 effects (summary):**

| Event | Exit 2 effect |
|-------|---------------|
| PreToolUse | Blocks tool call |
| PermissionRequest | Denies permission |
| UserPromptSubmit | Blocks prompt |
| Stop / SubagentStop | Prevents stopping |
| PostToolUse | stderr to Claude only (action already ran) |

Full table: <https://docs.claude.com/en/docs/claude-code/hooks>

## Troubleshooting

**Hook not firing**

- Run `/hooks`; confirm event and matcher (case-sensitive)
- Trigger the correct event (`PreToolUse` before tool, `PostToolUse` after)
- Reload session after manual settings edits

**Hook error in transcript**

- Test manually with piped JSON (see above)
- Fix "command not found" with absolute paths
- Install `jq` or parse JSON in Node/Python
- `chmod +x` the script

**Settings not loaded**

- Valid JSON only (no trailing commas/comments)
- Correct file: `.claude/settings.json` vs `~/.claude/settings.json`

**JSON validation failed**

- Shell profile `echo` on startup prepends non-JSON text; wrap profile echoes in interactive checks:

```bash
if [[ $- == *i* ]]; then echo "Shell ready"; fi
```

**Stop hook loops**

- Check `stop_hook_active` in input; exit 0 early when true

**Debug**

- `Ctrl+O` verbose mode for hook output
- `claude --debug` for matcher and exit-code details

## Success criteria

Hook is **done** when:

- Script has executable permissions
- Registered in the correct `settings.json`
- Passes happy-path and sad-path tests
- Integrates with Claude (`additionalContext` or `suppressOutput` as intended)
- Follows project conventions and detected tooling

**Result**: a working hook that automates quality, security, or workflow checks without noisy success output.
