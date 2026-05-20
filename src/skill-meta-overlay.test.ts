import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeSkillMetaOverlay } from './skill-meta-overlay.js';
import type { SkillFrontMatter } from './parse.js';

const base: SkillFrontMatter = {
  id: 'mcp-builder',
  title: 'mcp-builder',
  summary: 'Build MCP servers.',
  token_estimate: 50,
};

describe('mergeSkillMetaOverlay', () => {
  it('replaces tags and triggers from overlay', () => {
    const merged = mergeSkillMetaOverlay(base, {
      tags: ['mcp', 'server'],
      triggers: ['build an mcp server'],
      token_estimate: 3500,
    });
    assert.deepEqual(merged.tags, ['mcp', 'server']);
    assert.deepEqual(merged.triggers, ['build an mcp server']);
    assert.equal(merged.token_estimate, 3500);
    assert.equal(merged.id, 'mcp-builder');
  });
});
