---
name: skill-creator-eval
description: Run skill evals — spawn with-skill and baseline subagents, draft assertions, grade outputs, aggregate benchmarks, and launch the review viewer. Use when testing a skill, running eval iterations, grading assertions, reviewing benchmark results, or improving a skill from user feedback. Do not use for initial SKILL.md drafting (skill-creator-authoring) or description trigger optimization (skill-creator-benchmark).
---

# Skill Creator — Evals

Run test cases end-to-end. One continuous sequence — do not stop partway. Do not use `/skill-test`.

Put results in `<skill-name>-workspace/` beside the skill. Organize by iteration (`iteration-1/`, …) and eval directories (`eval-0/`, or descriptive names). Create directories as you go.

Paths below use `<skill-creator-path>` for the skill-creator package (scripts, eval-viewer, agents/).

## Running Evals

Prerequisites: draft skill and prompts in `evals/evals.json` (from authoring). Share the eval plan with the user before spawning.

## Spawn Runs

For **each** test case, spawn **two** subagents in the **same turn** — with-skill and baseline. Do not run with-skill first and baselines later.

**With-skill subagent prompt:**

```
Execute this task:
- Skill path: <path-to-skill>
- Task: <eval prompt>
- Input files: <eval files or "none">
- Save outputs to: <workspace>/iteration-<N>/eval-<ID>/with_skill/outputs/
- Outputs to save: <what matters — e.g. the .docx, final CSV>
```

**Baseline:**
- **New skill:** same prompt, no skill path → `without_skill/outputs/`
- **Improving existing skill:** snapshot first (`cp -r <skill-path> <workspace>/skill-snapshot/`), baseline uses snapshot → `old_skill/outputs/`

Write `eval_metadata.json` per eval (assertions may be empty initially). Use descriptive eval names, not only `eval-0`:

```json
{
  "eval_id": 0,
  "eval_name": "descriptive-name",
  "prompt": "The user task prompt",
  "assertions": []
}
```

## Assertions and Grading

While runs execute, draft objective assertions; explain them to the user. Review existing assertions in `evals/evals.json` if present. Subjective quality (style, design) → qualitative review, not forced assertions.

Update `eval_metadata.json` and `evals/evals.json` with assertions. Describe what the viewer will show.

**Timing:** when each subagent completes, save notification `total_tokens` and `duration_ms` immediately to `timing.json` in that run directory:

```json
{
  "total_tokens": 84852,
  "duration_ms": 23332,
  "total_duration_seconds": 23.3
}
```

Process notifications as they arrive — this data is not persisted elsewhere.

When all runs finish:

1. **Grade** — subagent or inline, following `agents/grader.md`. Save `grading.json` per run; `expectations` entries must use `text`, `passed`, `evidence` (viewer depends on these names). Prefer scripts for programmatic checks.
2. **Aggregate** — from skill-creator directory:
   ```bash
   python -m scripts.aggregate_benchmark <workspace>/iteration-N --skill-name <name>
   ```
   Produces `benchmark.json` and `benchmark.md`. Put each with_skill row before its baseline counterpart.
3. **Analyze** — read aggregates plus `agents/analyzer.md` for non-discriminating assertions, flaky high-variance evals, time/token tradeoffs.

## Review Viewer

Always generate the viewer **before** you evaluate outputs yourself — get results in front of the human first.

```bash
nohup python <skill-creator-path>/eval-viewer/generate_review.py \
  <workspace>/iteration-N \
  --skill-name "my-skill" \
  --benchmark <workspace>/iteration-N/benchmark.json \
  > /dev/null 2>&1 &
VIEWER_PID=$!
```

Iteration 2+: add `--previous-workspace <workspace>/iteration-<N-1>`.

**Headless / Cowork:** use `--static <output_path>` for standalone HTML; feedback downloads as `feedback.json` — copy into the workspace after submit.

Tell the user: Outputs tab for per-case review and feedback; Benchmark tab for pass rates, timing, tokens. Return when done reviewing.

**Outputs tab:** prompt, rendered output, previous output (iter 2+), formal grades, feedback textbox (auto-saves).

When the user finishes, read `feedback.json`. Empty feedback means OK. Focus improvements on cases with specific complaints. Kill the viewer: `kill $VIEWER_PID 2>/dev/null`.

## Iteration Loop

After improving the skill:

1. Apply edits to the skill
2. Rerun all cases into `iteration-<N+1>/` with baselines (new skill: always `without_skill`; improvements: original or previous iteration — your judgment)
3. Launch viewer with `--previous-workspace`
4. Wait for user review
5. Read feedback; repeat until the user is happy, feedback is empty, or progress stalls

**Improvement principles:** generalize from feedback (avoid overfit MUSTs); keep the skill lean; explain why; bundle repeated helper scripts into `scripts/` when all runs reinvent the same code.

Read run transcripts, not only final artifacts.

## Platform notes

**Claude.ai:** no parallel subagents or baselines; run prompts sequentially yourself; skip quantitative benchmark aggregation; ask for inline feedback.

**Cowork:** parallel runs OK; `--static` viewer; feedback via downloaded `feedback.json`.

**Packaging (if `present_files` available):** `python -m scripts.package_skill <skill-folder>` after the user is satisfied.
