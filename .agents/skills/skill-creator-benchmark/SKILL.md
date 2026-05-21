---
name: skill-creator-benchmark
description: Optimize skill descriptions for triggering accuracy and run blind A/B comparisons between skill versions. Use when tuning SKILL.md description front matter, generating trigger eval queries, running the description optimization loop, comparing two skill versions blindly, or asking whether a new version is actually better. Not for drafting skills (skill-creator-authoring) or running standard eval iterations (skill-creator-eval).
---

# Skill Creator — Benchmark

Measure and improve how skills trigger and compare versions rigorously. Run after the skill body is in good shape and the user agrees.

Paths use `<skill-creator-path>` for the skill-creator package.

## Description Optimization

The YAML **description** is the primary trigger signal. Offer optimization after authoring or major eval improvements.

### Step 1: Generate trigger eval queries

Create ~20 realistic queries — mix of should-trigger and should-not-trigger:

```json
[
  {"query": "the user prompt", "should_trigger": true},
  {"query": "another prompt", "should_trigger": false}
]
```

Queries should look like real Claude Code / Claude.ai messages: file paths, job context, column names, casual typos, varied length. Focus on edge cases, not obvious matches.

**Bad:** `"Format this data"`, `"Extract text from PDF"`

**Good:** `"ok so my boss sent this xlsx in downloads called Q4 sales final v2 and she wants profit margin % — revenue col C costs col D i think"`

**Should-trigger (8–10):** varied phrasings, implicit need without naming the skill, uncommon cases, near-competitor queries where this skill should win.

**Should-not-trigger (8–10):** near-misses sharing keywords but needing something else — adjacent domains, ambiguous phrasing, wrong tool for the context. Avoid trivial negatives that do not test discrimination.

### Step 2: Review with user

Use `assets/eval_review.html`:

1. Replace `__EVAL_DATA_PLACEHOLDER__` with the JSON array (unquoted JS assignment)
2. Replace `__SKILL_NAME_PLACEHOLDER__` and `__SKILL_DESCRIPTION_PLACEHOLDER__`
3. Write temp HTML and open for the user
4. User edits, toggles, exports → `~/Downloads/eval_set.json` (check for `(1)` suffix duplicates)

Bad queries produce bad descriptions — this review matters.

### Step 3: Run optimization loop

Tell the user it runs in the background. Save eval set to workspace, then:

```bash
python -m scripts.run_loop \
  --eval-set <path-to-trigger-eval.json> \
  --skill-path <path-to-skill> \
  --model <model-id-powering-this-session> \
  --max-iterations 5 \
  --verbose
```

Use the session model ID so triggering matches user experience. Periodically report iteration and scores.

The loop splits 60/40 train/test, evaluates current description (3 runs per query), proposes improvements, re-evaluates up to 5 iterations, opens an HTML report, returns JSON with `best_description` (selected by **test** score).

**How triggering works:** skills appear in `available_skills` by name + description; the model consults them for tasks that benefit from procedure. Simple one-step queries may not trigger even with a perfect description — eval queries must be substantive enough to need a skill.

### Step 4: Apply result

Update SKILL.md frontmatter with `best_description`. Show before/after and report scores.

**Claude.ai:** requires `claude -p` CLI — skip if unavailable.

**Cowork:** `run_loop` works via subprocess; run only after skill body is finalized.

## Blind Comparison

Optional rigor when the user asks "is the new version actually better?" Requires subagents. Human review loop is usually enough.

Read `agents/comparator.md` and `agents/analyzer.md`.

**Basic idea:** give an independent agent two outputs without revealing which is which; judge quality; analyze why the winner won.

Use when quantitative evals and user review leave version quality ambiguous — e.g. subjective tradeoffs or small metric deltas.

## Improve From Results

When benchmark or blind comparison surfaces issues:

- **Trigger failures:** broaden description phrasing for missed should-trigger queries; tighten for false positives on should-not-trigger near-misses
- **Non-discriminating assertions:** from eval runs — rewrite or drop assertions that pass with and without the skill
- **Version wins/loses blind compare:** read `analyzer.md` guidance; generalize fixes into the skill body, not one-off eval hacks

After description changes, spot-check with a few held-out user phrases before closing the task.

## Reference files

In skill-creator package:

- `agents/comparator.md` — blind A/B procedure
- `agents/analyzer.md` — why one version beat another
- `references/schemas.md` — benchmark and grading JSON schemas
