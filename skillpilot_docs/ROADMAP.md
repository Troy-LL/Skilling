# SkillPilot — Roadmap

> This is a living document. Items are not promises — they are intent with reasoning. Priorities shift based on real usage and contributor interest.

---

## North Star

SkillPilot should be the minimal, composable, open-source MCP server that lets any agent use the right skill at the right time, spending as few tokens as possible doing it. By the time a task ends, the context should be no heavier than when it started.

---

## v0.x — Foundation (current / in progress)

The core router is working. The goal for this phase is **correctness and stability** — not features.

### Done
- [x] MCP server with stdio transport (`@modelcontextprotocol/sdk`)
- [x] `skill_list`, `skill_select`, `skill_inject`, `skill_cleanup` tools (+ short-name aliases)
- [x] `skill_plan` tool (planning-first workflow)
- [x] Heuristic selector (tag + trigger + skill id matching; `token_budget`, `top_k`)
- [x] Front-matter parsing (`yaml`; ecosystem `name`/`description` normalization)
- [x] Correlation registry for inject/cleanup pairing
- [x] Skill store with path confinement, partial index, index cache
- [x] Tier 1 index in memory; Tier 2 body on load/inject only
- [x] Token estimate auto-computation when `token_estimate` omitted
- [x] `token_budget` enforcement in `skill_select`
- [x] Structured error codes (SPEC.md §7)
- [x] Body shaping pipeline (`shape-body.ts`, `MAX_INJECT_BYTES`)
- [x] `ttl_hint` on inject / `begin_task`
- [x] `skill_list` tag filtering
- [x] Config file support (`skillpilot.config.json`, env)
- [x] `health` tool
- [x] Canonical skill root **`.agents/skills/`** documented
- [x] Cursor extension for session-aware lifecycle hooks
- [x] Test suite (`node:test`) + MCP smoke
- [x] CI via GitHub Actions

### In Progress
- [x] npm package metadata as `skillpilot-mcp` (`files`, `prepare`, `.npmignore`) — run `npm publish` after `npm login`
- [x] Contributing guide ([CONTRIBUTING.md](../CONTRIBUTING.md))
- [ ] Example skill library polish

### Before v1.0 (remaining)
- [ ] README quick-start for Claude Desktop (same MCP JSON shape as Cursor)
- [ ] Broader heuristic tuning on 20–100 skill libraries

---

## v1.0 — Stable Core

**Theme: Zero surprises. Everything in the spec works. Open for contributors.**

- All five MCP tools (`skill_list`, `skill_select`, `skill_inject`, `skill_cleanup`, `skill_plan`) implemented and stable.
- Full tiered manifest system. Selection never reads Tier 2.
- Token budget enforcement end-to-end.
- Skill file format finalized with full front-matter schema.
- Heuristic selector performs well on a library of 20–100 skills.
- Comprehensive test coverage for all tools and failure modes.
- Published to npm as `skillpilot-mcp`.
- Contributing guide, skill authoring guide, and example skill library.

**Non-goals for v1.0:**
- Embedding-based selection (v2)
- LLM-assisted ranking (v2)
- Skill feedback / helpfulness tracking (v2)
- Remote skill stores (v2)

---

## v1.x — Developer Experience

**Theme: Easy to adopt. Easy to write skills. Easy to debug.**

### v1.1 — Skill Authoring Tooling
- [ ] `skillpilot validate <path>` CLI command — lint a skill file against the schema
- [ ] `skillpilot preview <skill-id>` — show what the shaped body looks like before injection
- [ ] `skillpilot stats` — show token estimates and coverage metrics for a skill library
- [ ] Front-matter auto-completion schema for VS Code / Cursor (JSON Schema)
- [ ] Skill template scaffold (`skillpilot new <skill-id>`)

### v1.2 — Observability
- [ ] Structured JSON log output (currently mixed)
- [ ] Per-skill usage counters persisted to a lightweight file store
- [ ] `skill_list` response includes `last_used_at` and `use_count` for each skill
- [ ] Debug mode: `SKILLPILOT_DEBUG=true` logs selection scoring details

### v1.3 — Multi-Root Support
- [ ] Multiple skill roots (workspace-local + global), merged with precedence rules
- [ ] Namespace prefixes to avoid id collisions across roots
- [ ] Read-only remote root via HTTP (skill library served over plain HTTP/HTTPS)

---

## v2.0 — Smart Selection

**Theme: Better selection quality. Still zero required dependencies.**

### Embedding-Based Selector
- [ ] Local embedding model via `@xenova/transformers` (Apache 2.0, runs in-process)
- [ ] Default model: `Xenova/all-MiniLM-L6-v2` — ~25 MB, no GPU required
- [ ] Embeddings computed at startup for all Tier 1 summaries, cached to `.skillpilot-cache/`
- [ ] Cosine similarity replaces keyword scoring when enabled
- [ ] Opt-in via `SKILLPILOT_SELECTOR=embedding`
- [ ] Fallback to heuristic if model load fails

### LLM-Assisted Ranker
- [ ] Configurable endpoint (default: `localhost:11434/v1` for Ollama)
- [ ] Pass skill summaries + prompt to a local model, parse ranked output
- [ ] Works with any OpenAI-compatible API (local or remote)
- [ ] Opt-in via `SKILLPILOT_SELECTOR=llm`
- [ ] Strict timeout to prevent blocking the MCP call

### Skill Plan Improvements (v2 selector)
- [ ] `skill_plan` with LLM selector produces richer, reasoning-annotated plans
- [ ] Plan includes `confidence` per step, not just per-skill
- [ ] Plan can reference multiple skills per step (composite guidance)

---

## v2.x — Feedback and Adaptation

**Theme: Skills that get better with use. Still no required training or external APIs.**

### v2.1 — Skill Feedback Loop
- [ ] `skill_feedback(correlation_id, success: boolean)` MCP tool
- [ ] Server accumulates success/failure rates per skill in a local JSON file
- [ ] Helpfulness score `Δk` computed per-skill: `accuracy_with - accuracy_without`
- [ ] Selector uses `Δk` as a gate: skills with `Δk ≤ 0` over the last N tasks are penalized
- [ ] Inspired by Skill0's Dynamic Curriculum, adapted for inference-time (not training-time) use

### v2.2 — Usage-Driven Trigger Discovery
- [ ] When a skill is successfully used, extract the prompt that triggered it
- [ ] Periodically suggest new trigger phrases to skill authors (reported via `skillpilot stats`)
- [ ] Opt-in: never modifies skill files automatically

### v2.3 — Skill Conflict Detection
- [ ] Detect when two skills have highly overlapping tags/triggers
- [ ] `skillpilot validate` warns on overlap during authoring
- [ ] `skill_select` warns on ambiguous match (multiple high-confidence candidates)

---

## v3.0 — Skill Graph and Composition

**Theme: Skills that know about each other. Sequences. Conditionals.**

### Skill References
- [ ] Skills can reference other skills in their body: `{{ skill: canvas }}` is replaced with the summary of the referenced skill
- [ ] `skill_plan` resolves the full dependency graph before returning the plan
- [ ] Circular reference detection at load time

### Composite Skills
- [ ] A skill can declare `requires: [canvas, create-rule]` in front matter
- [ ] `skill_inject` for a composite skill automatically injects all required skills in order, respecting token budgets
- [ ] Each component skill still maintains its own `correlation_id` for independent cleanup

### Conditional Injection
- [ ] Skills can declare `applies_when` conditions in front matter (e.g., `file_extension: .tsx`)
- [ ] `skill_select` evaluates conditions against the provided context before scoring
- [ ] Reduces false positives without requiring LLM calls

---

## Long-Term / Research Directions

These are ideas worth tracking but not currently on a release timeline:

**Skill internalization signals**  
SkillPilot operates at inference time — it cannot train models. But it *can* collect data that would be useful for training a model that no longer needs runtime skill injection (the goal of Skill0). Logging which skills were helpful, in what context, with what outcome, creates a dataset for future offline training.

**Skill evolution pipeline**  
An external tool (not part of the core router) could watch usage logs, identify skills that consistently fail, and propose updated bodies. The router remains read-only; evolution happens out-of-band.

**Skill marketplaces / sharing**  
A signed skill package format that allows skill libraries to be published and shared without requiring trust in the contents. The router validates signatures before loading from untrusted sources.

**Cross-agent skill sync**  
When multiple agents in the same workspace share a skill library, synchronize which skills are currently active to avoid redundant injection and conflicting guidance.

---

## How to Influence the Roadmap

SkillPilot is open source. The most direct way to influence priorities:

1. **Use it and report what breaks.** Bugs in the core always take priority over new features.
2. **Write skills.** A rich skill library reveals gaps in the selection logic faster than any spec review.
3. **Open an issue with a concrete use case** when you want a feature. "I need X because I am trying to do Y" is more actionable than "add feature X."
4. **Submit a PR.** Features with implementations ship faster than features with only issues.

The maintainers will not add features that violate the philosophy (proprietary deps, permanent injection, hard-coded model coupling) regardless of how they are requested.
