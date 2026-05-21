import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SkillFrontMatter } from '../parse.js';
import { planFromCandidates, selectFromCandidates } from './heuristic.js';

const review: SkillFrontMatter = {
  id: 'com-skilling-code-review',
  title: 'Lightweight code review',
  summary: 'Spot correctness, edge cases, and test gaps.',
  tags: ['review', 'quality', 'security'],
  token_estimate: 500,
  inject: true,
};

const prBabysit: SkillFrontMatter = {
  id: 'com-skilling-pr-babysit',
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
  id: 'com-skilling-orchestrator',
  title: 'Skilling task orchestration',
  summary: 'Use MCP begin_task and end_task per dev stage.',
  tags: ['skilling', 'workflow'],
  triggers: ['begin task', 'skilling', 'end task'],
  token_estimate: 800,
  inject: true,
};

const mcpBuilder: SkillFrontMatter = {
  id: 'mcp-builder',
  title: 'MCP Builder',
  summary: 'Build MCP servers with tools and evaluation.',
  tags: ['mcp', 'server', 'python', 'api', 'tools'],
  triggers: ['build an mcp server', 'create an mcp server'],
  min_confidence: 0.45,
  token_estimate: 3000,
  inject: true,
};

const tsMcpGenerator: SkillFrontMatter = {
  id: 'typescript-mcp-server-generator',
  title: 'TypeScript MCP Server Generator',
  summary: 'Scaffold a TypeScript MCP server project.',
  tags: ['typescript', 'mcp', 'node', 'generator'],
  triggers: ['generate a typescript mcp server', 'typescript mcp server generator'],
  min_confidence: 0.45,
  token_estimate: 2500,
  inject: true,
};

const typescriptCli: SkillFrontMatter = {
  id: 'typescript-cli',
  title: 'TypeScript CLI Tools',
  summary: 'Build Node/TypeScript CLI tools and small scripts.',
  tags: ['typescript', 'node', 'cli', 'script'],
  triggers: ['cli tool', 'command line tool', 'typescript script', 'node script'],
  min_confidence: 0.3,
  token_estimate: 600,
  inject: true,
};

const frontendDesign: SkillFrontMatter = {
  id: 'frontend-design',
  title: 'Frontend Design',
  summary: 'Production-grade UI with distinctive design.',
  tags: ['react', 'ui', 'css', 'design', 'frontend'],
  triggers: ['build a react component', 'weather card', 'beautiful react ui'],
  token_estimate: 1200,
  inject: true,
};

const mcpCatalog = [mcpBuilder, tsMcpGenerator, typescriptCli, frontendDesign, orchestrator];

describe('selectFromCandidates', () => {
  it('picks find-skills over orchestrator for discovery prompts', () => {
    const r = selectFromCandidates([orchestrator, findSkills], {
      prompt: 'find a skill for API testing',
    });
    assert.equal(r.skill_id, 'find-skills');
    assert.ok(r.confidence >= 0.25);
  });

  it('scores >= 0.35 without low_confidence when tags and triggers match', () => {
    const r = selectFromCandidates([mcpBuilder, orchestrator], {
      prompt: 'build an mcp server with Python tools, evaluation harness, and testing',
    });
    assert.equal(r.skill_id, 'mcp-builder');
    assert.ok(r.confidence >= 0.35);
    assert.ok(!r.warnings?.includes('low_confidence'));
  });

  it('picks code review for review-oriented prompt', () => {
    const r = selectFromCandidates(candidates, {
      prompt: 'Please do a code review of this diff and find security issues',
    });
    assert.equal(r.skill_id, 'com-skilling-code-review');
    assert.ok(r.confidence > 0);
  });

  it('returns candidates in weak band without skill_id when below select min', () => {
    const weak: SkillFrontMatter = {
      id: 'weak-skill',
      title: 'Weak Match',
      summary: 'Barely related',
      tags: ['kubernetes'],
      triggers: ['helm chart'],
      min_confidence: 0.5,
      token_estimate: 500,
      inject: true,
    };
    const r = selectFromCandidates([weak], {
      prompt: 'deploy kubernetes with helm charts and RBAC policies',
    });
    assert.equal(r.skill_id, null);
    assert.ok(r.candidates && r.candidates.length >= 1);
    assert.equal(r.weak_candidates, true);
  });

  it('uses rounded confidence consistently for low_confidence warning', () => {
    const meta: SkillFrontMatter = {
      id: 'edge-skill',
      title: 'Edge Skill',
      summary: 'Testing rounding',
      tags: ['mcp', 'server'],
      triggers: ['build an mcp server'],
      min_confidence: 0.25,
      token_estimate: 1000,
      inject: true,
    };
    const r = selectFromCandidates([meta], {
      prompt: 'build an mcp server with Python tools',
    });
    assert.equal(r.skill_id, 'edge-skill');
    if (r.confidence >= 0.35) {
      assert.ok(!r.warnings?.includes('low_confidence'));
    } else {
      assert.ok(r.warnings?.includes('low_confidence'));
    }
    assert.equal(r.confidence, Math.round(r.confidence * 1000) / 1000);
  });

  it('returns null when nothing matches', () => {
    const r = selectFromCandidates(candidates, { prompt: 'xyzzy unrelated fluff' });
    assert.equal(r.skill_id, null);
    assert.equal(r.confidence, 0);
  });

  it('excludes skills over select_max_tokens when set', () => {
    const r = selectFromCandidates(candidates, {
      prompt: 'code review security',
      select_max_tokens: 100,
    });
    assert.equal(r.skill_id, null);
    assert.ok(r.warnings?.includes('budget_exceeded'));
  });

  it('allows large skills when select_max_tokens omitted', () => {
    const large: SkillFrontMatter = {
      id: 'find-skills',
      title: 'Find Skills',
      summary: 'Discover skills',
      tags: ['discovery'],
      triggers: ['find a skill'],
      token_estimate: 1480,
      inject: true,
    };
    const r = selectFromCandidates([large], { prompt: 'find a skill for API testing' });
    assert.equal(r.skill_id, 'find-skills');
  });

  it('does not pick MCP skills for generic TypeScript CLI prompts', () => {
    const r = selectFromCandidates(mcpCatalog, {
      prompt: 'build a simple TypeScript CLI weather tool that fetches forecast data',
    });
    assert.notEqual(r.skill_id, 'mcp-builder');
    assert.notEqual(r.skill_id, 'typescript-mcp-server-generator');
    assert.equal(r.skill_id, 'typescript-cli');
  });

  it('caps MCP skills without mcp anchor in query', () => {
    const r = selectFromCandidates([mcpBuilder, typescriptCli], {
      prompt: 'typescript node tool script',
    });
    assert.equal(r.skill_id, 'typescript-cli');
  });

  it('still picks MCP builder when query mentions mcp explicitly', () => {
    const r = selectFromCandidates([mcpBuilder, typescriptCli], {
      prompt: 'build an mcp server in typescript with tools',
    });
    assert.equal(r.skill_id, 'mcp-builder');
    assert.ok(r.confidence >= 0.35);
  });

  it('picks frontend-design for weather card UI prompt', () => {
    const r = selectFromCandidates(mcpCatalog, {
      prompt: 'create a beautiful weather card UI with React and Tailwind',
    });
    assert.equal(r.skill_id, 'frontend-design');
  });
});

describe('planFromCandidates', () => {
  it('returns deprecated suggestions and skills_needed', () => {
    const p = planFromCandidates(candidates, {
      goal: 'review this PR and fix CI',
    });
    assert.equal(p.deprecated, true);
    assert.ok(Array.isArray(p.suggestions));
    assert.ok(Array.isArray(p.skills_needed));
    assert.ok(p.estimated_tokens >= 0);
  });

  it('omits weak matches from skills_needed but may list them in suggestions', () => {
    const p = planFromCandidates(mcpCatalog, {
      goal: 'deploy kubernetes with helm charts and RBAC policies',
    });
    assert.deepEqual(p.skills_needed, []);
    for (const s of p.suggestions) {
      assert.equal(s.included, false);
    }
  });

  it('marks included on suggestions at or above plan min', () => {
    const p = planFromCandidates(mcpCatalog, {
      goal: 'build a simple TypeScript CLI weather tool',
    });
    const cli = p.suggestions.find((s) => s.skill_id === 'typescript-cli');
    assert.ok(cli);
    assert.equal(cli.included, true);
    assert.ok(p.skills_needed.includes('typescript-cli'));
    assert.ok(!p.skills_needed.includes('mcp-builder'));
    assert.ok(!p.skills_needed.includes('typescript-mcp-server-generator'));
  });
});
