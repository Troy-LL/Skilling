---
name: skill-creator-authoring
description: Create and draft agent skills — capture intent, interview the user, write SKILL.md with front matter, anatomy, and writing patterns. Use when the user wants to create a skill from scratch, turn a workflow into a skill, draft or edit SKILL.md, define triggers and descriptions, or set up initial test prompts before running evals. Prefer this chunk for authoring; use skill-creator-eval for test runs and skill-creator-benchmark for description optimization.
---

# Skill Creator — Authoring

Draft or revise a skill before evals. Self-contained authoring workflow.

## Communicating with the user

Match the user's technical level. "Evaluation" and "benchmark" are fine by default; explain JSON or assertions only when the user shows they know those terms. Brief definitions are OK when unsure.

If the user wants to skip formal evals and iterate conversationally, follow their lead.

## Capture Intent

Start from the conversation when the user says "turn this into a skill." Extract tools used, step order, corrections, and I/O formats from history. Have the user confirm gaps.

1. What should this skill enable the agent to do?
2. When should it trigger? (phrases and contexts)
3. What output format is expected?
4. Should we set up test cases? Objective outputs (transforms, extraction, codegen, fixed steps) benefit from tests; subjective outputs (style, art) often do not. Suggest a default; let the user decide.

## Interview and Research

Ask about edge cases, formats, example files, success criteria, and dependencies before writing test prompts.

Use MCPs or subagents for research (similar skills, docs, best practices) when available. Come prepared to reduce user burden.

## Write the SKILL.md

From the interview, fill in:

- **name**: skill identifier (matches folder name)
- **description**: primary trigger mechanism — what the skill does AND when to use it. All "when to use" belongs here, not the body. Descriptions should be slightly pushy against undertriggering — include adjacent phrases users might say without naming the skill.
- **compatibility**: required tools (optional, rarely needed)
- **Body**: procedural instructions for the agent

### Skill Anatomy

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter (name, description required)
│   └── Markdown instructions
└── Bundled Resources (optional)
    ├── scripts/    — deterministic/repetitive tasks
    ├── references/ — docs loaded as needed
    └── assets/     — templates, icons, fonts for output
```

**Progressive disclosure:** metadata (~100 words) → SKILL.md body (<500 lines ideal) → bundled resources on demand.

**Patterns:**
- Split large skills into chunks or reference files; point clearly to follow-ups
- Reference files >300 lines: add a table of contents
- Multi-domain skills: organize by variant under `references/`

**Principle of lack of surprise:** no malware, exploits, or content that contradicts stated intent. Decline misleading or unauthorized-access skills.

**Writing patterns:** prefer imperative instructions. Explain *why* over heavy MUST/NEVER caps. Generalize beyond the current examples.

Define output formats with explicit templates. Include realistic input/output examples where helpful.

### Writing Style

Draft, then re-read with fresh eyes. Remove instructions that do not pull weight. Explain reasoning so the model can adapt.

## Test Cases

After the draft, propose 2–3 realistic user prompts. Confirm with the user, then save to `evals/evals.json` — prompts only, no assertions yet.

```json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "prompt": "User task prompt",
      "expected_output": "Description of expected result",
      "files": []
    }
  ]
}
```

Schema details: `references/schemas.md` in the skill-creator package (assertions added during evals).

## Next steps

When the draft and test prompts are ready, switch to **skill-creator-eval** to spawn runs, grade, and review. After the skill stabilizes, use **skill-creator-benchmark** for description optimization or blind comparison.

## Platform notes

**Claude.ai (no subagents):** run each test prompt yourself by following the skill; skip baselines and quantitative benchmarks; present outputs inline for feedback.

**Updating installed skills:** preserve the original `name` and folder id; copy read-only installs to a writable path before editing; package from the copy.

**Cowork:** subagents work; use `--static` for the eval viewer when there is no browser (handled in skill-creator-eval).
