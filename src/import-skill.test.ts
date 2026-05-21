import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { SkillPilotError } from './errors.js';
import { importSkillFromAgents, validateAgentsFolder } from './import-skill.js';

describe('validateAgentsFolder', () => {
  it('rejects path traversal', () => {
    assert.throws(
      () => validateAgentsFolder('../../outside'),
      (e: unknown) => e instanceof SkillPilotError && e.code === 'VALIDATION_ERROR',
    );
    assert.throws(
      () => validateAgentsFolder('foo/bar'),
      (e: unknown) => e instanceof SkillPilotError && e.code === 'VALIDATION_ERROR',
    );
  });

  it('rejects invalid slug', () => {
    assert.throws(
      () => validateAgentsFolder('Bad_Folder'),
      (e: unknown) => e instanceof SkillPilotError && e.code === 'VALIDATION_ERROR',
    );
  });
});

describe('importSkillFromAgents', () => {
  it('imports find-skills from .agents into a temp skill root', () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skillpilot-import-'));
    try {
      const result = importSkillFromAgents(repoRoot, 'find-skills', tmpRoot);
      assert.equal(result.skill_id, 'find-skills');
      assert.ok(fs.existsSync(path.join(tmpRoot, 'find-skills', 'SKILL.md')));
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('rejects malicious agents_folder', () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skillpilot-import-bad-'));
    try {
      assert.throws(
        () => importSkillFromAgents(repoRoot, '../../outside', tmpRoot),
        (e: unknown) => e instanceof SkillPilotError && e.code === 'VALIDATION_ERROR',
      );
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
