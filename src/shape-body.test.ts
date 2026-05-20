import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SkillPilotError } from './errors.js';
import {
  extractSectionsByHeading,
  resolveInjectMode,
  shapeSkillBody,
  stripInternalOnlySections,
} from './shape-body.js';

describe('shapeSkillBody', () => {
  it('strips internal-only blocks', () => {
    const raw = `# Skill\n\n<!-- internal-only -->\nsecret\n<!-- /internal-only -->\n\nVisible.`;
    assert.equal(stripInternalOnlySections(raw).includes('secret'), false);
    const shaped = shapeSkillBody(raw, 8192);
    assert.ok(shaped.body.includes('Visible.'));
    assert.ok(shaped.body.startsWith('> The following skill'));
    assert.equal(shaped.inject_mode, 'full');
  });

  it('throws BODY_TOO_LARGE when over limit in full mode', () => {
    const huge = 'x'.repeat(9000);
    assert.throws(() => shapeSkillBody(huge, 100), (e) => {
      return e instanceof SkillPilotError && e.code === 'BODY_TOO_LARGE';
    });
  });

  it('summary mode uses meta only', () => {
    const shaped = shapeSkillBody('# Long\n\n' + 'word '.repeat(2000), 8192, {
      mode: 'summary',
      meta: { title: 'T', summary: 'One-line guidance.' },
    });
    assert.ok(shaped.body.includes('One-line guidance'));
    assert.ok(shaped.token_estimate < 200);
    assert.equal(shaped.inject_mode, 'summary');
  });

  it('compact mode omits fenced code blocks', () => {
    const raw = '## Steps\n\nDo this.\n\n```ts\nconst x = 1;\n```\n\nDone.';
    const shaped = shapeSkillBody(raw, 8192, { mode: 'compact' });
    assert.ok(!shaped.body.includes('const x'));
    assert.ok(shaped.body.includes('code block omitted'));
  });

  it('sections mode extracts named headings', () => {
    const raw = `## Intro\nnoise\n\n## Procedure\n1. First\n\n## Appendix\nmore`;
    const extracted = extractSectionsByHeading(raw, ['Procedure']);
    assert.ok(extracted.includes('1. First'));
    assert.ok(!extracted.includes('Appendix'));
  });
});

describe('resolveInjectMode', () => {
  it('auto-selects summary when token_budget is very low', () => {
    assert.equal(resolveInjectMode(undefined, {}, 200), 'summary');
  });

  it('auto-selects compact for medium budgets', () => {
    assert.equal(resolveInjectMode(undefined, {}, 600), 'compact');
  });
});
