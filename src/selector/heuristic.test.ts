import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SkillFrontMatter } from '../parse.js';
import { planFromCandidates, selectFromCandidates } from './heuristic.js';

const review: SkillFrontMatter = {
  id: 'com-skillpilot-code-review',
  title: 'Lightweight code review',
  summary: 'Spot correctness, edge cases, and test gaps.',
  tags: ['review', 'quality', 'security'],
  token_estimate: 500,
  inject: true,
};

const prBabysit: SkillFrontMatter = {
  id: 'com-skillpilot-pr-babysit',
  title: 'PR babysitting loop',
  summary: 'Keep a PR merge-ready by triaging review comments and fixing CI.',
  tags: ['pr', 'merge', 'ci'],
  token_estimate: 600,
  inject: true,
};

const candidates = [review, prBabysit];

const findSkills: SkillFrontMatter = {
  id: 'find-skills',
  title: 'Find Skills',
  summary: 'Discover and install agent skills from the open ecosystem.',
  tags: ['discovery', 'skills', 'ecosystem'],
  triggers: ['find a skill', 'npx skills find', 'skills.sh'],
  token_estimate: 400,
  inject: true,
};

const orchestrator: SkillFrontMatter = {
  id: 'com-skillpilot-orchestrator',
  title: 'SkillPilot task orchestration',
  summary: 'Use MCP begin_task and end_task per dev stage.',
  tags: ['skillpilot', 'workflow'],
  triggers: ['begin task', 'skillpilot', 'end task'],
  token_estimate: 800,
  inject: true,
};

describe('selectFromCandidates', () => {
  it('picks find-skills over orchestrator for discovery prompts', () => {
    const r = selectFromCandidates([orchestrator, findSkills], {
      prompt: 'find a skill for API testing',
    });
    assert.equal(r.skill_id, 'find-skills');
    assert.ok(r.confidence >= 0.1);
  });

  it('scores >= 0.35 without low_confidence when tags and triggers match', () => {
    const mcpBuilder: SkillFrontMatter = {
      id: 'mcp-builder',
      title: 'MCP Builder',
      summary: 'Build MCP servers with tools and evaluation.',
      tags: ['mcp', 'server', 'python', 'api', 'tools'],
      triggers: ['build an mcp server', 'create an mcp server'],
      token_estimate: 3000,
      inject: true,
    };
    const r = selectFromCandidates([mcpBuilder, orchestrator], {
      prompt: 'build a new MCP server with Python tools, evaluation harness, and testing',
    });
    assert.equal(r.skill_id, 'mcp-builder');
    assert.ok(r.confidence >= 0.35);
    assert.ok(!r.warnings?.includes('low_confidence'));
  });

  it('picks code review for review-oriented prompt', () => {
    const r = selectFromCandidates(candidates, {
      prompt: 'Please do a code review of this diff and find security issues',
    });
    assert.equal(r.skill_id, 'com-skillpilot-code-review');
    assert.ok(r.confidence > 0);
  });

  it('returns null when nothing matches', () => {
    const r = selectFromCandidates(candidates, { prompt: 'xyzzy unrelated fluff' });
    assert.equal(r.skill_id, null);
    assert.equal(r.confidence, 0);
  });

  it('excludes skills over token_budget', () => {
    const r = selectFromCandidates(candidates, {
      prompt: 'code review security',
      token_budget: 100,
    });
    assert.equal(r.skill_id, null);
    assert.ok(r.warnings?.includes('budget_exceeded'));
  });
});

describe('planFromCandidates', () => {
  it('returns plan steps and skills_needed', () => {
    const p = planFromCandidates(candidates, {
      goal: 'review this PR and fix CI',
    });
    assert.ok(p.plan.length >= 1);
    assert.ok(Array.isArray(p.skills_needed));
    assert.ok(p.estimated_tokens >= 0);
  });
});
