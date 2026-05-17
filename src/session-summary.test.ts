import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSessionSummary, promptFingerprint } from './session-summary.js';

describe('session-summary', () => {
  it('buildSessionSummary combines title and rationale', () => {
    const s = buildSessionSummary('Find Skills', 'matched tag:skills');
    assert.match(s, /Using Find Skills/);
    assert.match(s, /matched tag:skills/);
  });

  it('promptFingerprint is stable', () => {
    const a = promptFingerprint('fix CI', 'merge PR');
    const b = promptFingerprint('fix CI', 'merge PR');
    assert.equal(a, b);
    assert.equal(a.length, 16);
  });
});
