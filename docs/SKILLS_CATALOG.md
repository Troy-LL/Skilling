# Skill catalog — discover, install locally, route with Skilling

Skilling **lists / suggests / injects** skills under **`SKILL_ROOT`**. For this repo, the **canonical** root is **`.agents/skills/`**.

## Pipeline (v2 recommended)

```text
list → begin_task(find-skills, 300) → agent picks skill_id
→ begin_task(skill_id, 900) → end_task → next stage
```

| Step | What | Where files live |
|------|------|------------------|
| 1. Local catalog | MCP **`list`** for installed skill IDs (~280 tokens) | `.agents/skills/` |
| 2. Discover ecosystem | **`begin_task(find-skills, 300)`** or `npx skills find` / [skills.sh](https://skills.sh/) | find-skills skill body |
| 3. Route (optional) | **`suggest_skills`** for ranked hints — agent picks `skill_id` | Metadata only |
| 4. Inject | **`begin_task(skill_id, token_budget)`** → **`end_task`** before next skill | Session in `.skilling/` |
| 5. Overlay | **`.agents/skills-meta/<id>.yaml`** | Tags, triggers, inject defaults |

## Commands (Skilling repo root)

PowerShell:

```powershell
npm run build
$env:SKILL_ROOT = "$PWD/.agents/skills"
npx skills add anthropics/skills@mcp-builder -y
npm run smoke
```

## MCP configuration

Point **`env.SKILL_ROOT`** at **this repo’s `.agents/skills`** folder:

```json
"env": { "SKILL_ROOT": "<REPO>/.agents/skills" }
```

See **`docs/mcp-config.example.json`**.

## Bundled / project skills (`.agents/skills/`)

| Skill id | Role |
|----------|------|
| **find-skills** | Discover ecosystem skills + local `list` routing SOP |
| **com-skilling-orchestrator** | v2 lifecycle SOP (`list`, `suggest_skills`, `begin_task`, `end_task`) |
| **mcp-builder-*** | MCP server work (chunked: overview / implementation / evaluation) |
| **skill-creator-*** | Skill authoring (chunked: authoring / eval / benchmark) |
| **create-hook-*** | Git hooks (chunked: workflow / templates / testing) |
| **typescript-cli** | Node/TypeScript CLI tools (not MCP servers) |
| **frontend-design** | Distinctive web UI / React components |
| **create-rule** | Cursor rules |
| **typescript-mcp-server-generator** | TypeScript MCP server scaffold |

Legacy monolith ids (`mcp-builder`, `skill-creator`, `create-hook`) may remain for compatibility; prefer **chunk ids** for staged `begin_task`.

## Routing accuracy

Tune routing without editing skill bodies via **`.agents/skills-meta/<id>.yaml`**:

| Overlay field | Purpose |
|---------------|---------|
| `triggers` | Phrases that strongly signal this skill |
| `tags` | Token overlap for heuristic matching |
| `inject_brief` | Summary-tier inject bullets |
| `inject_sections` | Headings for section/compact mode (must match `##` in body) |
| `min_confidence` | Per-skill floor (e.g. `0.35` for MCP skills) |
| `inject_mode_default` | Default inject tier at budget ≥900 |

Selector thresholds (env overrides):

- **`SKILLING_SELECT_MIN_CONFIDENCE`** — default `0.25` (minimum for top `skill_id` in `suggest_skills`)
- **`SKILLING_SUGGEST_DISPLAY_MIN`** — default `0.15` (minimum to appear in ranked `candidates`)
- **`SKILLING_PLAN_MIN_CONFIDENCE`** — default `0.35` (minimum for `skill_plan` `skills_needed` / `included: true`)

MCP-tagged skills require **mcp** or an exact MCP trigger in the query; otherwise their score is capped to avoid false positives on generic TypeScript prompts.

## Chunking (large skills)

Skills over ~4k raw tokens or that truncate at 8 KB in compact are split into **stage chunks** — each chunk ≤8 KB so `begin_task(chunk_id, 900)` injects without `truncated: true`. See [`docs/CONTEXT_ENGINEERING.md`](CONTEXT_ENGINEERING.md).

## Notes

- **`.agents/skills-meta/`** holds Skilling routing metadata; commit these files in the repo.
- **`com-skilling-orchestrator`** is first-party; not managed by `npx skills update`.
- **`token_estimate`** is computed from the skill **body** when not set explicitly.
- Folder name **must** match YAML **`id`**.

## Regression

```powershell
npm run benchmark
```

Section **2b** asserts each scenario matches `expected_skill_id` (selection regression gate).
