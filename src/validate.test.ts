import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import path from 'node:path';
import { assertPathUnderRoot } from './store.js';
import { SkillPilotError } from './errors.js';
import { isValidSkillId, requireNonEmptyTrimmed } from './validate.js';

describe('isValidSkillId', () => {
  it('accepts valid ids', () => {
    assert.equal(isValidSkillId('com-skillpilot-ci-triage'), true);
    assert.equal(isValidSkillId('abc'), true);
  });

  it('rejects invalid ids', () => {
    assert.equal(isValidSkillId(''), false);
    assert.equal(isValidSkillId('Bad'), false);
    assert.equal(isValidSkillId('a_b'), false);
    assert.equal(isValidSkillId('-bad'), false);
    assert.equal(isValidSkillId('bad-'), false);
  });
});

describe('assertPathUnderRoot', () => {
  const root = path.resolve('/skills');

  it('allows paths under root', () => {
    assertPathUnderRoot(root, path.join(root, 'foo', 'SKILL.md'));
  });

  it('rejects escape via parent segments', () => {
    assert.throws(
      () => assertPathUnderRoot(root, path.resolve(root, '..', 'etc', 'passwd')),
      /outside skill root/,
    );
  });
});

describe('requireNonEmptyTrimmed', () => {
  it('returns trimmed value', () => {
    assert.equal(requireNonEmptyTrimmed('  hello  ', 'goal'), 'hello');
  });

  it('throws on empty', () => {
    assert.throws(
      () => requireNonEmptyTrimmed('   ', 'skill_plan goal'),
      (e: unknown) =>
        e instanceof SkillPilotError &&
        e.code === 'VALIDATION_ERROR' &&
        e.message.includes('skill_plan goal'),
    );
  });
});
