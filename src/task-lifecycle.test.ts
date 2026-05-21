import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { SkillPilotError } from './errors.js';
import { loadConfig } from './config.js';
import {
  readSession,
  resolveActiveBodyPath,
  resolveSessionPath,
  writeSession,
} from './session-store.js';
import { beginTask, endTask, getSession, loadSkillEpisode } from './task-lifecycle.js';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const agentsSkills = path.join(repoRoot, '.agents', 'skills');
const config = loadConfig(repoRoot, agentsSkills);

describe('task-lifecycle', () => {
  it('beginTask selects find-skills for discovery prompt', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'skillpilot-task-'));
    try {
      const result = beginTask(agentsSkills, repo, config, {
        prompt: 'npx skills find install a skill from skills.sh for API testing',
      });
      assert.equal(result.skill_id, 'find-skills');
      assert.ok(result.correlation_id);
      assert.ok(result.body.length > 0);
      assert.ok(result.token_estimate > 0);
      assert.ok(result.ttl_hint >= 0);
      assert.ok(result.summary);
      assert.ok(result.title);
      assert.equal('alternatives' in result, false);
      const session = readSession(repo);
      assert.equal(session?.correlation_id, result.correlation_id);
      assert.equal(session?.summary, result.summary);
      endTask(repo);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('beginTask writes active-body bridge file', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'skillpilot-task-bridge-'));
    try {
      const result = beginTask(agentsSkills, repo, config, {
        prompt: 'find a skill for deployment',
        skill_id: 'find-skills',
      });
      const bridge = resolveActiveBodyPath(repo);
      assert.ok(fs.existsSync(bridge));
      const text = fs.readFileSync(bridge, 'utf8');
      assert.match(text, new RegExp(`skill_id: ${result.skill_id}`));
      assert.match(text, /find-skills|Find Skills/i);
      endTask(repo);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('response_detail full includes alternatives when present', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'skillpilot-task-full-'));
    try {
      const result = beginTask(agentsSkills, repo, config, {
        prompt: 'find a skill for API testing',
        response_detail: 'full',
      });
      assert.ok(result.skill_id);
      endTask(repo);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('getSession include_body loads skill text', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'skillpilot-task-body-'));
    try {
      beginTask(agentsSkills, repo, config, {
        prompt: 'find a skill for deployment',
        skill_id: 'find-skills',
      });
      const session = getSession(agentsSkills, repo, config, { include_body: true });
      assert.equal(session.active, true);
      if (session.active) {
        assert.ok(session.body && session.body.length > 0);
        assert.ok(session.summary);
      }
      endTask(repo);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('getSession returns inactive and clears expired session', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'skillpilot-task-expired-'));
    try {
      writeSession(repo, {
        skill_id: 'find-skills',
        title: 'Find Skills',
        summary: 'Using Find Skills',
        rationale: 'test',
        confidence: 1,
        correlation_id: '00000000-0000-4000-8000-000000000099',
        ttl_ms: 1_000,
        started_at: new Date(Date.now() - 60_000).toISOString(),
      });
      fs.writeFileSync(resolveActiveBodyPath(repo), 'stale body', 'utf8');
      const session = getSession(agentsSkills, repo, config);
      assert.equal(session.active, false);
      assert.equal(readSession(repo), null);
      assert.equal(fs.existsSync(resolveSessionPath(repo)), false);
      assert.equal(fs.existsSync(resolveActiveBodyPath(repo)), false);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('endTask rejects mismatched correlation_id', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'skillpilot-task-end-mismatch-'));
    try {
      writeSession(repo, {
        skill_id: 'find-skills',
        title: 'Find Skills',
        summary: 'Using Find Skills',
        rationale: 'test',
        confidence: 1,
        correlation_id: '00000000-0000-4000-8000-000000000010',
        ttl_ms: 300_000,
        started_at: new Date().toISOString(),
      });
      assert.throws(
        () => endTask(repo, '00000000-0000-4000-8000-000000000011'),
        (e: unknown) =>
          e instanceof SkillPilotError &&
          e.code === 'VALIDATION_ERROR' &&
          e.message.includes('correlation_id'),
      );
      assert.ok(readSession(repo));
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('end_previous cleans up prior active session', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'skillpilot-task-'));
    try {
      const first = loadSkillEpisode(agentsSkills, 'com-skillpilot-orchestrator', config);
      writeSession(repo, {
        skill_id: first.skill_id,
        title: first.title,
        summary: 'Using orchestrator',
        rationale: 'test',
        confidence: 1,
        correlation_id: first.correlation_id,
        ttl_ms: first.ttl_ms,
        started_at: new Date().toISOString(),
      });
      const second = beginTask(agentsSkills, repo, config, {
        prompt: 'find a skill for linting',
        end_previous: true,
      });
      assert.equal(second.previous_ended, true);
      assert.notEqual(second.correlation_id, first.correlation_id);
      endTask(repo);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('end_previous clears expired prior session without cleanup error', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'skillpilot-task-expired-prev-'));
    try {
      writeSession(repo, {
        skill_id: 'find-skills',
        title: 'Find Skills',
        summary: 'Using Find Skills',
        rationale: 'test',
        confidence: 1,
        correlation_id: '00000000-0000-4000-8000-000000000020',
        ttl_ms: 1_000,
        started_at: new Date(Date.now() - 120_000).toISOString(),
      });
      const result = beginTask(agentsSkills, repo, config, {
        prompt: 'find a skill for linting',
      });
      assert.equal(result.previous_ended, true);
      assert.ok(result.skill_id);
      endTask(repo);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
