/**
 * token-benchmark.mjs
 *
 * Measures real token savings: naïve "inject everything" baseline vs
 * Skilling's tiered approach (Tier 1 selection + single shaped body).
 *
 * Run: npm run benchmark
 * Prereq: npm run build (uses dist/ modules)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SKILL_ROOT = path.join(ROOT, '.agents', 'skills');
const SKILLS_META_DIR = path.join(ROOT, '.agents', 'skills-meta');

// ── Dynamic imports from compiled dist ───────────────────────────────────────
const { buildIndex, loadSkillBody } = await import('../dist/store.js');
const { shapeSkillBody } = await import('../dist/shape-body.js');
const { estimateTokens } = await import('../dist/token-estimate.js');
const { selectFromCandidates } = await import('../dist/selector/heuristic.js');

// ── Test scenarios (representative real-world prompts) ────────────────────────
const SCENARIOS = [
  {
    id: 'frontend_design',
    prompt: 'create a beautiful React UI with Tailwind CSS, modern layout, and polished UX design',
    expected_skill_id: 'frontend-design',
  },
  {
    id: 'find_skills',
    prompt: 'find and install a skill for pull request review automation from the ecosystem',
    expected_skill_id: 'find-skills',
  },
  {
    id: 'create_hook',
    prompt: 'create a cursor hook that fires at session start to auto-load context',
    expected_skill_id: 'com-skilling-orchestrator',
  },
  {
    id: 'create_rule',
    prompt: 'write a new cursor rule for enforcing TypeScript code review standards',
    expected_skill_id: 'create-rule',
  },
  {
    id: 'mcp_builder',
    prompt: 'build an mcp server with Python tools, evaluation harness, and testing',
    expected_skill_id: 'mcp-builder',
  },
  {
    id: 'skill_creator',
    prompt: 'author and package a reusable skill for deployment automation',
    expected_skill_id: 'skill-creator',
  },
  {
    id: 'ts_mcp_generator',
    prompt: 'generate a new TypeScript MCP server project from scratch with all boilerplate',
    expected_skill_id: 'typescript-mcp-server-generator',
  },
  {
    id: 'orchestrator',
    prompt: 'begin a Skilling task, run skill_plan, and track the full session lifecycle',
    expected_skill_id: 'com-skilling-orchestrator',
  },
  {
    id: 'typescript_cli',
    prompt: 'build a simple TypeScript CLI weather tool that fetches forecast data from an API',
    expected_skill_id: 'typescript-cli',
  },
  {
    id: 'weather_card_ui',
    prompt: 'create a beautiful weather card UI with React and Tailwind CSS',
    expected_skill_id: 'frontend-design',
  },
  {
    id: 'no_match',
    prompt: 'deploy my kubernetes cluster to production with helm charts and RBAC policies',
    expected_skill_id: null,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(str, len, right = false) {
  const s = String(str);
  return right ? s.padStart(len) : s.padEnd(len);
}

function pct(saved, total) {
  if (total === 0) return '—';
  return `${Math.round((saved / total) * 100)}%`;
}

function formatNum(n) {
  return n.toLocaleString('en-US');
}

/**
 * Build a Tier 1 "summary block" for a skill as it would appear in context
 * if summaries were injected for selection.
 */
function summaryBlock(entry) {
  const tags = (entry.tags ?? []).join(', ');
  return `**${entry.title}** (${entry.id})\n${entry.summary}${tags ? `\nTags: ${tags}` : ''}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║         Skilling — Token Savings Benchmark                 ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// 1. Index all skills
const index = buildIndex(SKILL_ROOT, SKILLS_META_DIR);
if (!index.ok) {
  console.error('Index build failed:', index.error);
  process.exit(1);
}

const { skills, metas } = index;
console.log(`Loaded ${skills.length} skills from ${SKILL_ROOT}\n`);

// Use a very large byte cap when measuring raw sizes — this lets the benchmark
// see the true body token counts even for oversized skills.  The default 8 KB
// cap is still used to flag whether a skill would be "injectable" in practice.
const MEASURE_CAP = 2 ** 24; // 16 MB — effectively unbounded for measurement
const DEFAULT_CAP = 8192;    // real production cap

// 2. Pre-load all skill bodies + compute per-skill token counts
const skillData = [];
for (const entry of skills) {
  const { meta, body } = loadSkillBody(SKILL_ROOT, entry.id, SKILLS_META_DIR);
  const rawBodyTokens = estimateTokens(body);

  // Measure full tokens without the production cap (raw size)
  const full = shapeSkillBody(body, MEASURE_CAP, { mode: 'full' });

  // Check whether full injection would work within the production cap
  let fullFeasible = true;
  try {
    shapeSkillBody(body, DEFAULT_CAP, { mode: 'full' });
  } catch {
    fullFeasible = false;
  }

  // compact — truncates gracefully, so always works within cap
  let compact;
  try {
    compact = shapeSkillBody(body, DEFAULT_CAP, {
      mode: 'compact',
      meta: { title: meta.title, summary: meta.summary },
    });
  } catch {
    // still too large even after compaction — measure raw compact size
    compact = shapeSkillBody(body, MEASURE_CAP, {
      mode: 'compact',
      meta: { title: meta.title, summary: meta.summary },
    });
  }

  // summary — always tiny (just title + summary line)
  const summaryMode = shapeSkillBody(body, MEASURE_CAP, {
    mode: 'summary',
    meta: { title: meta.title, summary: meta.summary, inject_brief: meta.inject_brief },
  });

  const tier1Text = summaryBlock(entry);
  const tier1Tokens = estimateTokens(tier1Text);

  skillData.push({
    id: entry.id,
    title: entry.title,
    summary: entry.summary,
    meta,
    rawBodyTokens,
    fullTokens: full.token_estimate,
    fullFeasible,
    compactTokens: compact.token_estimate,
    summaryTokens: summaryMode.token_estimate,
    tier1Tokens,
    shapedFullBody: full.body,
    shapedCompactBody: compact.body,
    shapedSummaryBody: summaryMode.body,
  });
}

// ── Section 1: Per-Skill Tier Breakdown ──────────────────────────────────────
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  Section 1: Per-Skill Token Sizes by Tier');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const h = ['Skill ID', 'Tier1 (select)', 'Full (inject)', 'Compact', 'Summary'];
const col = [36, 16, 16, 10, 10];
console.log(
  pad(h[0], col[0]) +
    pad(h[1], col[1], true) +
    pad(h[2], col[2], true) +
    pad(h[3], col[3], true) +
    pad(h[4], col[4], true),
);
console.log('─'.repeat(col.reduce((a, b) => a + b, 0)));

let totalTier1 = 0;
let totalFull = 0;
let totalCompact = 0;
let totalSummary = 0;

for (const s of skillData) {
  totalTier1 += s.tier1Tokens;
  totalFull += s.fullTokens;
  totalCompact += s.compactTokens;
  totalSummary += s.summaryTokens;

  const fullLabel = s.fullFeasible
    ? formatNum(s.fullTokens)
    : `${formatNum(s.fullTokens)} ✗`;

  console.log(
    pad(s.id, col[0]) +
      pad(formatNum(s.tier1Tokens), col[1], true) +
      pad(fullLabel, col[2], true) +
      pad(formatNum(s.compactTokens), col[3], true) +
      pad(formatNum(s.summaryTokens), col[4], true),
  );
}

console.log('─'.repeat(col.reduce((a, b) => a + b, 0)));
console.log(
  pad('TOTAL (all skills injected)', col[0]) +
    pad(formatNum(totalTier1), col[1], true) +
    pad(formatNum(totalFull), col[2], true) +
    pad(formatNum(totalCompact), col[3], true) +
    pad(formatNum(totalSummary), col[4], true),
);

console.log(`
Key:
  Tier1 (select) — summary block scanned during heuristic selection (never injected)
  Full           — full shaped body (inject_mode=full); ✗ = exceeds 8 KB production cap
  Compact        — code blocks stripped (inject_mode=compact); truncates to fit cap
  Summary        — title + summary only (inject_mode=summary)
  Naive baseline uses raw full token counts (no cap) to represent worst-case injection cost.
`);

// ── Section 2: Per-Scenario Comparison ───────────────────────────────────────
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  Section 2: Per-Request Token Comparison');
console.log('  Baseline = inject ALL skill bodies unconditionally');
console.log('  Skilling = Tier 1 scan (selection) + 1 matched body (injection)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const metasArr = [...metas.values()];
const scenarioResults = [];

for (const scenario of SCENARIOS) {
  const result = selectFromCandidates(metasArr, { prompt: scenario.prompt });
  const matched = result.skill_id;

  let spFullTokens = 0;
  let spCompactTokens = 0;
  let spSummaryTokens = 0;
  let matchedSkillLabel = 'no match';

  if (matched) {
    const sd = skillData.find((s) => s.id === matched);
    if (sd) {
      spFullTokens = sd.fullTokens;
      spCompactTokens = sd.compactTokens;
      spSummaryTokens = sd.summaryTokens;
      matchedSkillLabel = matched;
    }
  }

  // Naive baseline: all full bodies in context
  const naiveTokens = totalFull;

  // Skilling total cost = Tier 1 scan + injected body
  const spTotalFull = totalTier1 + spFullTokens;
  const spTotalCompact = totalTier1 + spCompactTokens;
  const spTotalSummary = totalTier1 + spSummaryTokens;

  const savedFull = naiveTokens - spFullTokens;
  const savedCompact = naiveTokens - spCompactTokens;
  const savedSummary = naiveTokens - spSummaryTokens;

  scenarioResults.push({
    scenario: scenario.id,
    prompt: scenario.prompt,
    expected: scenario.expected_skill_id,
    matched: matchedSkillLabel,
    confidence: result.confidence,
    warnings: result.warnings ?? [],
    naiveTokens,
    tier1Cost: totalTier1,
    spFullTokens,
    spCompactTokens,
    spSummaryTokens,
    spTotalFull,
    spTotalCompact,
    spTotalSummary,
    savedFull,
    savedCompact,
    savedSummary,
  });
}

// Print per-scenario table
const sc = [22, 24, 10, 12, 14, 14, 10, 10];
console.log(
  pad('Scenario', sc[0]) +
    pad('Matched Skill', sc[1]) +
    pad('Conf', sc[2], true) +
    pad('Naive (all)', sc[3], true) +
    pad('SP Full+T1', sc[4], true) +
    pad('SP Cmpct+T1', sc[5], true) +
    pad('Saved(Full)', sc[6], true) +
    pad('Saved%', sc[7], true),
);
console.log('─'.repeat(sc.reduce((a, b) => a + b, 0)));

for (const r of scenarioResults) {
  console.log(
    pad(r.scenario, sc[0]) +
      pad(r.matched, sc[1]) +
      pad(r.confidence > 0 ? r.confidence.toFixed(2) : '—', sc[2], true) +
      pad(formatNum(r.naiveTokens), sc[3], true) +
      pad(formatNum(r.spTotalFull), sc[4], true) +
      pad(formatNum(r.spTotalCompact), sc[5], true) +
      pad(formatNum(r.savedFull), sc[6], true) +
      pad(pct(r.savedFull, r.naiveTokens), sc[7], true),
  );
}

// ── Section 2b: Selection regression gate ────────────────────────────────────
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  Section 2b: Selection Regression (expected_skill_id)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

let selectionFailures = 0;
for (const r of scenarioResults) {
  const expected = r.expected;
  const actual = r.matched === 'no match' ? null : r.matched;
  const ok = expected === actual;
  const warn =
    r.warnings?.includes('low_confidence') && r.confidence > 0 ? ' [low_confidence]' : '';
  const status = ok ? 'PASS' : 'FAIL';
  if (!ok) selectionFailures++;
  console.log(
    `  ${status} ${r.scenario}: expected=${expected ?? 'null'} got=${actual ?? 'null'} conf=${r.confidence}${warn}`,
  );
}

if (selectionFailures > 0) {
  console.error(`\nSelection regression: ${selectionFailures} scenario(s) failed.\n`);
  process.exit(1);
}
console.log('\n  All selection scenarios passed.\n');

// ── Section 3: Multi-Step Projection ─────────────────────────────────────────
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  Section 3: Cumulative Token Cost over N Steps (matched scenario avg)');
console.log('  Naive: all bodies stay in context every step');
console.log('  Skilling: Tier 1 scan once + one body in context (evicted after task)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const matchedResults = scenarioResults.filter((r) => r.matched !== 'no match');
const avgFullInjected =
  matchedResults.reduce((s, r) => s + r.spFullTokens, 0) / Math.max(1, matchedResults.length);
const avgCompactInjected =
  matchedResults.reduce((s, r) => s + r.spCompactTokens, 0) / Math.max(1, matchedResults.length);

console.log(
  `  Avg matched body size: full=${Math.round(avgFullInjected)} tokens, compact=${Math.round(avgCompactInjected)} tokens\n`,
);

const steps = [1, 3, 5, 10, 20];
const ms = [6, 16, 16, 16, 16, 16, 14, 14];
console.log(
  pad('Steps', ms[0]) +
    pad('Naive (full dump)', ms[1], true) +
    pad('SP Full+T1', ms[2], true) +
    pad('SP Compact+T1', ms[3], true) +
    pad('Saved (Full)', ms[4], true) +
    pad('Saved% (Full)', ms[5], true) +
    pad('Saved (Cmpct)', ms[6], true) +
    pad('Saved%', ms[7], true),
);
console.log('─'.repeat(ms.reduce((a, b) => a + b, 0)));

for (const n of steps) {
  // Naive: all bodies × N steps (they persist the whole time)
  const naiveTotal = totalFull * n;

  // Skilling: T1 scan once (selection is amortized per task, not per step)
  // + one matched body stays in context for all N steps
  // Note: T1 scan cost is paid once at task start, body stays in context
  const spFullTotal = totalTier1 + Math.round(avgFullInjected) * n;
  const spCompactTotal = totalTier1 + Math.round(avgCompactInjected) * n;

  const savedFull = naiveTotal - spFullTotal;
  const savedCompact = naiveTotal - spCompactTotal;

  console.log(
    pad(n, ms[0]) +
      pad(formatNum(naiveTotal), ms[1], true) +
      pad(formatNum(spFullTotal), ms[2], true) +
      pad(formatNum(spCompactTotal), ms[3], true) +
      pad(formatNum(savedFull), ms[4], true) +
      pad(pct(savedFull, naiveTotal), ms[5], true) +
      pad(formatNum(savedCompact), ms[6], true) +
      pad(pct(savedCompact, naiveTotal), ms[7], true),
  );
}

// ── Section 2c: Staged pipeline (list → discovery → implement) ───────────────
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  Section 2c: Staged Pipeline (shaped inject estimates)');
console.log('  list + begin_task(find-skills,300) + begin_task(impl,900) + end_task');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const findSkillsData = skillData.find((s) => s.id === 'find-skills');
const discoveryTokens = findSkillsData?.summaryTokens ?? 0;
const listCatalogTokens = totalTier1;
const implementTokens = Math.round(avgCompactInjected || 0);
const stagedTotal = listCatalogTokens + discoveryTokens + implementTokens;
console.log(`  list (tier-0 catalog):           ${formatNum(listCatalogTokens)} tokens`);
console.log(`  begin_task(find-skills, 300):    ${formatNum(discoveryTokens)} tokens (summary)`);
console.log(`  begin_task(impl skill, 900):     ${formatNum(implementTokens)} tokens (compact avg)`);
console.log(`  Staged total (one discovery + one implement stage): ${formatNum(stagedTotal)} tokens`);
console.log(`  Naive baseline (all bodies):     ${formatNum(totalFull)} tokens\n`);

// ── Section 4: Selection-Only Cost (Tier 1 vs Tier 2 selection) ──────────────
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  Section 4: Selection Phase Cost');
console.log('  (What is read to decide WHICH skill to inject)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const selectionRatio = (totalFull / totalTier1).toFixed(1);

console.log(`  Skills in catalog:           ${skills.length}`);
console.log(`  Tier 1 scan cost (summaries): ${formatNum(totalTier1)} tokens total`);
console.log(`  Tier 2 scan cost (all bodies): ${formatNum(totalFull)} tokens total`);
console.log(`  Selection savings ratio:       ${selectionRatio}× cheaper with Tier 1\n`);
console.log(
  `  If selection used full bodies (naïve RAG), every request would read ${formatNum(totalFull)} tokens`,
);
console.log(
  `  just to decide which skill to use — before any injection happens.\n`,
);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  Summary');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const avgSavedPct =
  scenarioResults.reduce((s, r) => s + (r.savedFull / Math.max(1, r.naiveTokens)) * 100, 0) /
  scenarioResults.length;

const avgMatchedSavedPct =
  matchedResults.reduce((s, r) => s + (r.savedFull / Math.max(1, r.naiveTokens)) * 100, 0) /
  Math.max(1, matchedResults.length);

console.log(
  `  Naive baseline (inject all):     ${formatNum(totalFull)} tokens per request`,
);
console.log(
  `  Skilling Tier 1 scan overhead: ${formatNum(totalTier1)} tokens per request`,
);
console.log(`  Average context reduction:       ~${Math.round(avgSavedPct)}% per matched request`);
console.log(`  Matched-only context reduction:  ~${Math.round(avgMatchedSavedPct)}%`);
console.log(`  Selection cost ratio (T1 vs T2): ${selectionRatio}× cheaper\n`);
console.log(
  `  No-match path: 0 tokens injected (vs ${formatNum(totalFull)} naive) — correct behavior preserved.\n`,
);
