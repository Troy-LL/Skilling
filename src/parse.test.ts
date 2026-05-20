import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSkillMarkdown } from './parse.js';

const VALID = `---
id: test-skill
title: Test
summary: One line summary for tests.
tags:
  - demo
---

## Body

Do the thing.
`;

describe('parseSkillMarkdown', () => {
  it('parses valid front matter and body', () => {
    const { meta, body } = parseSkillMarkdown(VALID, 'test-skill');
    assert.equal(meta.id, 'test-skill');
    assert.equal(meta.title, 'Test');
    assert.equal(meta.summary, 'One line summary for tests.');
    assert.deepEqual(meta.tags, ['demo']);
    assert.match(body, /Do the thing/);
  });

  it('rejects folder name mismatch', () => {
    assert.throws(
      () => parseSkillMarkdown(VALID, 'wrong-folder'),
      /does not match folder name/,
    );
  });

  it('rejects missing front matter', () => {
    assert.throws(() => parseSkillMarkdown('# no yaml\n', 'test-skill'), /front matter/);
  });

  it('estimates token_estimate from body when omitted in front matter', () => {
    const longBody = 'word '.repeat(500);
    const eco = `---
name: test-skill
description: Short one-liner.
---
${longBody}`;
    const { meta } = parseSkillMarkdown(eco, 'test-skill');
    assert.ok((meta.token_estimate ?? 0) > 100);
  });

  it('derives triggers from quoted description phrases', () => {
    const eco = `---
name: find-skills
description: Use when users say "find a skill for X" or "npx skills find".
---
body
`;
    const { meta } = parseSkillMarkdown(eco, 'find-skills');
    assert.ok(meta.triggers?.some((t) => t.includes('find a skill')));
  });
});
