import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { SkillingError } from './errors.js';
import { loadConfig } from './config.js';
import {
  readSession,
  resolveActiveBodyPath,
  resolveSessionPath,
  writeSession,
} from './session-store.js';
import { beginTask, endTask, getCorrelationRegistrySize, getSession, loadSkillEpisode } from './task-lifecycle.js';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const agentsSkills = path.join(repoRoot, '.agents', 'skills');
const config = loadConfig(repoRoot, agentsSkills);

describe('task-lifecycle', () => {
  it('beginTask injects find-skills with token_budget=300', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'Skilling-task-'));
    try {
      const result = beginTask(agentsSkills, repo, config, {
        prompt: 'discover ecosystem skills for API testing',
        skill_id: 'find-skills',
        token_budget: 300,
      });
      assert.equal(result.skill_id, 'find-skills');
      assert.equal(result.inject_mode, 'summary');
      assert.ok(result.correlation_id);
      assert.ok(result.body.length > 0);
      assert.ok(result.token_estimate > 0);
      assert.ok(result.summary);
      endTask(repo);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('beginTask writes active-body bridge file', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'Skilling-task-bridge-'));
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

  it('beginTask rejects missing skill_id', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'Skilling-task-no-id-'));
    try {
      assert.throws(
        () =>
          beginTask(agentsSkills, repo, config, {
            prompt: 'build something',
            skill_id: '',
          }),
        (e: unknown) =>
          e instanceof SkillingError &&
          e.code === 'VALIDATION_ERROR' &&
          e.message.includes('requires skill_id'),
      );
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('getSession include_body loads skill text', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'Skilling-task-body-'));
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

  it('getSession include_body does not grow correlation registry', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'Skilling-task-registry-'));
    try {
      beginTask(agentsSkills, repo, config, {
        prompt: 'find a skill for deployment',
        skill_id: 'find-skills',
      });
      const sizeAfterBegin = getCorrelationRegistrySize();
      assert.ok(sizeAfterBegin >= 1);

      for (let i = 0; i < 10; i++) {
        const session = getSession(agentsSkills, repo, config, { include_body: true });
        assert.equal(session.active, true);
        if (session.active) {
          assert.ok(session.body && session.body.length > 0);
        }
      }
      assert.equal(getCorrelationRegistrySize(), sizeAfterBegin);

      endTask(repo);
      assert.equal(getCorrelationRegistrySize(), sizeAfterBegin - 1);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('getSession returns inactive and clears expired session', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'Skilling-task-expired-'));
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
      assert.equal(session.expired, true);
      assert.equal(readSession(repo), null);
      assert.equal(fs.existsSync(resolveSessionPath(repo)), false);
      assert.equal(fs.existsSync(resolveActiveBodyPath(repo)), false);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('getSession marks stale when TTL mostly elapsed', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'Skilling-task-stale-'));
    try {
      writeSession(repo, {
        skill_id: 'find-skills',
        title: 'Find Skills',
        summary: 'Using Find Skills',
        rationale: 'test',
        confidence: 1,
        correlation_id: '00000000-0000-4000-8000-000000000088',
        ttl_ms: 10_000,
        started_at: new Date(Date.now() - 9_000).toISOString(),
      });
      const session = getSession(agentsSkills, repo, config);
      assert.equal(session.active, true);
      if (session.active) {
        assert.equal(session.stale, true);
      }
      endTask(repo, '00000000-0000-4000-8000-000000000088');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('endTask rejects mismatched correlation_id', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'Skilling-task-end-mismatch-'));
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
          e instanceof SkillingError &&
          e.code === 'VALIDATION_ERROR' &&
          e.message.includes('correlation_id'),
      );
      assert.ok(readSession(repo));
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('end_previous cleans up prior active session', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'Skilling-task-'));
    try {
      const first = loadSkillEpisode(agentsSkills, 'com-skilling-orchestrator', config);
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
        skill_id: 'find-skills',
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
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'Skilling-task-expired-prev-'));
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
        skill_id: 'find-skills',
      });
      assert.equal(result.previous_ended, false);
      assert.ok(result.skill_id);
      endTask(repo);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('getSession include_body matches begin_task inject_mode and active-body bridge', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'Skilling-task-inject-'));
    try {
      const begun = beginTask(agentsSkills, repo, config, {
        prompt: 'find a skill for deployment',
        skill_id: 'find-skills',
        inject_mode: 'summary',
      });
      assert.equal(begun.inject_mode, 'summary');
      const session = readSession(repo);
      assert.equal(session?.inject_mode, 'summary');

      const bridge = fs.readFileSync(resolveActiveBodyPath(repo), 'utf8');
      const viaGet = getSession(agentsSkills, repo, config, { include_body: true });
      assert.equal(viaGet.active, true);
      if (viaGet.active) {
        assert.equal(viaGet.body, begun.body);
        assert.ok(bridge.includes(begun.body.slice(0, 40)));
      }
      endTask(repo);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('phase discovery uses token_budget 300 by default', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'Skilling-task-phase-'));
    try {
      const result = beginTask(agentsSkills, repo, config, {
        prompt: 'scope the work',
        skill_id: 'find-skills',
        phase: 'discovery',
      });
      assert.equal(result.inject_mode, 'summary');
      const session = readSession(repo);
      assert.equal(session?.token_budget, 300);
      endTask(repo);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
