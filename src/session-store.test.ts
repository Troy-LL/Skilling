import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  clearSession,
  isSessionActive,
  readSession,
  resolveSessionPath,
  SESSION_SCHEMA_VERSION,
  type SkillSession,
  writeSession,
  writeActiveBody,
  readActiveBody,
  resolveActiveBodyPath,
} from './session-store.js';

describe('session-store', () => {
  it('writes, reads, and clears session v2', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'skillpilot-session-'));
    try {
      writeSession(repo, {
        skill_id: 'test-skill',
        title: 'Test Skill',
        summary: 'Using Test Skill — matched.',
        rationale: 'matched',
        confidence: 0.9,
        correlation_id: '00000000-0000-4000-8000-000000000001',
        ttl_ms: 300_000,
        started_at: '2026-05-14T00:00:00.000Z',
        phase: 'implement',
      });
      const file = resolveSessionPath(repo);
      assert.ok(fs.existsSync(file));
      const s = readSession(repo);
      assert.ok(s);
      assert.equal(s!.version, SESSION_SCHEMA_VERSION);
      assert.equal(s!.skill_id, 'test-skill');
      assert.equal(s!.title, 'Test Skill');
      assert.equal(s!.summary, 'Using Test Skill — matched.');
      assert.equal(s!.phase, 'implement');
      clearSession(repo);
      assert.equal(readSession(repo), null);
      assert.equal(fs.existsSync(resolveActiveBodyPath(repo)), false);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('reads legacy v1 session shape', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'skillpilot-session-v1-'));
    try {
      const dir = path.join(repo, '.skillpilot');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'session.json'),
        JSON.stringify({
          version: 1,
          skill_id: 'legacy-skill',
          correlation_id: '00000000-0000-4000-8000-000000000002',
          ttl_ms: 60_000,
          started_at: new Date().toISOString(),
        }),
      );
      const s = readSession(repo);
      assert.ok(s);
      assert.equal(s!.skill_id, 'legacy-skill');
      assert.equal(s!.title, 'legacy-skill');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('isSessionActive respects ttl', () => {
    const session: SkillSession = {
      version: SESSION_SCHEMA_VERSION,
      skill_id: 'x',
      title: 'X',
      summary: 's',
      rationale: 'r',
      confidence: 1,
      correlation_id: '00000000-0000-4000-8000-000000000003',
      ttl_ms: 60_000,
      started_at: new Date().toISOString(),
    };
    assert.equal(isSessionActive(session), true);
    assert.equal(
      isSessionActive(
        { ...session, started_at: new Date(Date.now() - 120_000).toISOString() },
      ),
      false,
    );
  });

  it('readActiveBody strips header and checks skill_id', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'skillpilot-read-body-'));
    try {
      writeActiveBody(repo, 'test-skill', '# Procedure\n\nDo work.');
      assert.equal(readActiveBody(repo, 'test-skill'), '# Procedure\n\nDo work.');
      assert.equal(readActiveBody(repo, 'other-skill'), null);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('writeActiveBody creates bridge file', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'skillpilot-body-'));
    try {
      writeActiveBody(repo, 'test-skill', '# Procedure\n\nDo work.');
      const p = resolveActiveBodyPath(repo);
      assert.ok(fs.existsSync(p));
      const text = fs.readFileSync(p, 'utf8');
      assert.match(text, /ephemeral bridge/);
      assert.match(text, /Do work/);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('readSession returns null for corrupt json', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'skillpilot-session-bad-'));
    try {
      const dir = path.join(repo, '.skillpilot');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'session.json'), '{not json', 'utf8');
      assert.equal(readSession(repo), null);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
