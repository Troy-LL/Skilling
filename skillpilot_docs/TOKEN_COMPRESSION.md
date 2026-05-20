# SkillPilot — Token Compression Strategy

> This document explains *why* token cost matters for skill-augmented agents, *what* strategies SkillPilot uses to reduce it, and *how* each strategy maps to the codebase. It also draws directly from research in this space to ground the decisions.

---

## The Problem: Skills Are Expensive

When an agent injects a skill into its system prompt, it is spending tokens on every subsequent step of that conversation — even steps where the skill guidance is irrelevant. In multi-turn agentic tasks, this cost compounds:

> Research from Skill0 (arXiv:2604.02268) measured token cost per step across methods:
> - SkillRL (naïve full injection): **2.21k tokens/step** on ALFWorld
> - Skill0 (filtered, compressed): **0.38k tokens/step** — a **5.8× reduction**
> - And Skill0 achieved *better* task performance (+9.7% over SkillRL)

The problem has three distinct components:

1. **Retrieval noise** — Injecting skills that don't match the current task introduces irrelevant guidance that can corrupt model reasoning.
2. **Accumulation** — Skills injected early stay in context through later steps where they no longer apply.
3. **Full-body loading** — Using the entire skill body for selection wastes tokens; only a small fraction is needed to decide *whether* a skill applies.

SkillPilot addresses all three.

---

## Strategy 1: Tiered Manifests (Sketch Before Expand)

The most important optimization. The core insight: **you should never read a skill body just to decide if the skill is relevant.**

SkillPilot structures each skill into three tiers:

```
Tier 0 — Index entry     ~5 tokens     { id, title }
Tier 1 — Summary         ~60 tokens    { id, title, summary, tags, triggers }
Tier 2 — Body            200–2000 tokens  (the full injectable SKILL.md content)
```

**Selection operates on Tier 1 only.** The selector reads summaries of all skills (typically < 60 tokens each, < 3000 tokens for a 50-skill library) and picks the best match. The full body (Tier 2) is loaded *only after* a match is confirmed.

**Token savings calculation:**  
Selecting from a 50-skill library using Tier 1: ~3000 tokens read total.  
Selecting using Tier 2 bodies: potentially 50,000–100,000 tokens read total.  
For selection: **~20–30× cheaper** with Tier 1.

**Implementation:** Front matter in each `SKILL.md` carries the Tier 1 data. The store indexes summaries at startup and keeps them in memory. Bodies are read from disk on-demand per `skill_inject` call.

---

## Strategy 2: Intent-Gated Injection

Skills are only injected when the incoming prompt has sufficient evidence of need. The heuristic selector applies a scoring function:

```
score = trigger_match × 1.0 + partial_overlap × 0.6 + tag_match × 0.3 + title_overlap × 0.1
```

Skills below a confidence threshold (default: 0.1) are **excluded entirely** — the server returns `skill_id: null` and the agent proceeds without any injection. This is the correct behavior for tasks that don't need any skill.

**Why this matters:** The alternative — returning a "safe default" skill when nothing matches — fills the agent's context with irrelevant guidance. Skill0 showed that this pattern (random or over-broad skill injection) causes up to a **13.7% performance drop** vs. no injection at all (Table 3, ablation "w/o Rank").

**The lesson:** No match is better than a wrong match.

---

## Strategy 3: Token Budget Enforcement

Every `skill_select` call accepts an optional `token_budget`. The router enforces this before returning a recommendation:

```
If token_estimate(skill) > token_budget → exclude from candidates
```

This lets the calling agent communicate its context constraints explicitly, rather than having the router guess. In low-context situations (e.g., long conversation histories), the agent can request a tighter budget, and the router will either find a leaner skill or return no match.

**Default budget:** 2048 tokens. This is configurable per deployment and per call.

---

## Strategy 4: Eviction and TTL

An injected skill that is never evicted keeps costing tokens for the lifetime of the conversation. SkillPilot makes eviction a first-class operation (`skill_cleanup`) and returns a `ttl_hint` with every inject response.

**TTL hint:** The skill front matter can set `ttl_seconds`. This is a *suggestion* to the client — the client is responsible for eviction, the server does not force it. But providing the hint makes it easy for well-behaved clients to implement auto-cleanup.

**Session cleanup hooks:** SkillPilot integrates with Cursor's session end hooks (`skillpilot-session-end.mjs`) to ensure cleanup happens even when the agent forgets to call it explicitly.

**Design principle (from PHILOSOPHY.md):** Skills are scaffolding. Once the task is done, the scaffolding must come down.

---

## Strategy 5: Body Shaping Before Injection

Before a skill body is returned, the injector applies shaping:

1. **Strip internal-only sections** — Any `<!-- internal-only --> ... <!-- /internal-only -->` blocks are removed. These contain developer notes, checklists, or meta-comments that are useful for skill authors but not for model injection.

2. **Activation header** — A short header is prepended: `> The following skill applies only to the current task. Discard after task completion.` This cues the model to treat the skill as ephemeral, reducing the risk it "leaks" into unrelated turns.

3. **Size enforcement** — Bodies are capped at `MAX_INJECT_BYTES` (default: 8192 bytes ≈ 2000 tokens). Oversized bodies return an error — the server never partially injects.

**Implication for skill authors:** Write lean bodies. Target 400–1200 tokens. If a skill needs more, split it into a general skill + a task-specific supplement.

---

## Strategy 6: Plan-First Workflow (Front-Loaded Reasoning)

Mid-task context thrash is a hidden token cost: when the agent discovers mid-execution that a different skill is needed, it must re-plan in an already-loaded context. This burns tokens on the re-planning and risks incoherence.

The `skill_plan` tool lets agents front-load this reasoning:

```
skill_plan(goal) → structured plan with skill_id refs and estimated_tokens
```

The plan is built from Tier 1 summaries only (cheap). The agent reads the plan, decides if scope is correct, and *then* calls `skill_inject` for each needed skill in order.

**Token benefit:** Planning at Tier 1 costs hundreds of tokens. Discovering a wrong skill mid-task and replanning at Tier 2 costs thousands. The upfront investment pays off on any task longer than ~3 steps.

---

## Strategy 7: Inject Depth (`inject_mode`)

Not every task needs the full Tier 2 body. **`inject_mode`** on `load` / `begin_task` controls how much text is shaped into context:

| Mode | What is injected | Typical use |
|------|------------------|-------------|
| **`summary`** | `title` + `summary` / `inject_brief` only | Very tight budget; skill already familiar |
| **`sections`** | Only headings listed in `inject_sections` (or Procedure / When to use) | Need steps, not examples |
| **`compact`** | Body with fenced code stripped; truncates instead of error if over cap | Default for large ecosystem skills |
| **`full`** | Full shaped body (still strips `internal-only`) | First use or debugging |

When `inject_mode` is omitted, **`token_budget`** selects depth: &lt;350 → summary, &lt;900 → compact, else full (or per-skill `inject_mode_default`).

See **`docs/CONTEXT_ENGINEERING.md`** for the full agent ladder.

---

## Strategy 8: Helpfulness-Aware Filtering (Advanced / Future)

Inspired by Skill0's **Dynamic Curriculum**, a more advanced selector could track per-skill helpfulness across tasks:

```
Δk = accuracy(with skill k) − accuracy(without skill k)
```

Skills where `Δk ≤ 0` provide no benefit and should be excluded from selection even if they match tags. This requires feedback from the agent on task outcomes — something not available in the basic v1 request/response model.

**How SkillPilot could implement this:**
- An optional `skill_feedback` tool that accepts `{ correlation_id, success: boolean }`.
- The server accumulates success/failure pairs per skill and computes rolling `Δk` estimates.
- The selector uses `Δk` as a filter gate before confidence scoring.

This is a v2+ feature. It requires a lightweight persistence layer (a JSON file is enough for v1 of the feature). The key design constraint: **this must be opt-in**. The default stateless path must remain correct without it.

---

## Summary: Token Cost at Each Phase

| Phase | Tier used | Typical token cost | Notes |
|---|---|---|---|
| `skill_list()` | Tier 0 + 1 | ~100–300 tokens total | Fixed overhead, amortized |
| `skill_select()` | Tier 1 only | ~60 × N_candidates tokens | N typically < 50 |
| `skill_plan()` | Tier 1 only | ~60 × N_candidates + plan output | One-time upfront cost |
| `skill_inject()` | Tier 2 only | 200–2000 tokens per skill | Only for matched skills |
| Per-step overhead | None after inject | 0 additional per step | Eviction removes all overhead |

**Comparison with naïve full-library injection:**

| Approach | Selection cost | Per-inject cost | Ongoing step cost |
|---|---|---|---|
| Naïve (full bodies for selection) | 50,000–100,000 tokens | — | Full skill body every step |
| SkillPilot (tiered) | 3,000 tokens | 200–2000 tokens once | 0 after cleanup |

---

## Skill Authoring Checklist for Token Efficiency

When writing a new skill, check:

- [ ] `summary` is ≤ 120 characters — a clear, one-sentence description
- [ ] `triggers` lists 3–7 natural-language phrases that accurately signal need
- [ ] `tags` covers the skill's domain broadly (3–8 tags)
- [ ] `token_estimate` is set (or will be auto-computed accurately)
- [ ] Body is ≤ 1200 tokens in normal cases
- [ ] Internal notes are inside `<!-- internal-only -->` blocks
- [ ] `ttl_seconds` is set to a reasonable session duration for this skill type
- [ ] Body uses imperative, actionable language — no padding, no repetition

Skills that fail the above checklist cost more tokens *and* perform worse due to noise and poor matching.

---

## References

- Skill0: In-Context Agentic Reinforcement Learning for Skill Internalization — arXiv:2604.02268  
  Key findings adopted: tiered manifest concept, helpfulness filtering, budget-limited selection, the finding that retrieval noise hurts more than missing skills.
- AgentOCR: Reimagining Agent History via Optical Self-Compression — arXiv:2601.04786  
  Context compression via visual encoding (not directly applicable to SkillPilot's text-based approach, but informs the principle that history compression is tractable).
- Lost in the Middle: How Language Models Use Long Contexts — Liu et al., 2024  
  Key finding: information in the middle of long contexts is systematically underused. Skills injected into already-long contexts may not be used at all — reinforcing the case for lean, targeted injection.
