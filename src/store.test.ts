import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildIndex, getSkillIndex, invalidateIndexCache, loadSkillBody, skillRootSetupHint } from './store.js';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const agentsSkills = path.join(repoRoot, '.agents', 'skills');
const agentsMeta = path.join(repoRoot, '.agents', 'skills-meta');

describe('skillRootSetupHint', () => {
  it('steers toward absolute SKILL_ROOT and setup --force, not workspaceFolder templates', () => {
    const hint = skillRootSetupHint('/bad/path');
    assert.match(hint, /SKILL_ROOT=\/your\/project\/\.agents\/skills/);
    assert.match(hint, /npx skilling setup --force/);
    assert.doesNotMatch(hint, /"\$\{workspaceFolder\}\/\.agents\/skills"/);
  });
});

describe('buildIndex', () => {
  it('indexes catalog skills in repo', () => {
    const index = buildIndex(agentsSkills, agentsMeta);
    assert.equal(index.ok, true);
    if (!index.ok) return;
    assert.ok(index.skills.length >= 2);
    assert.ok(index.skills.some((s) => s.id === 'find-skills'));
    assert.ok(index.skills.some((s) => s.id === 'com-skilling-orchestrator'));
  });

  it('fails on folder vs id mismatch', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'Skilling-test-'));
    try {
      const dir = path.join(tmp, 'folder-a');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'SKILL.md'),
        `---
id: folder-b
title: T
summary: S
---
body
`,
        'utf8',
      );
      const index = buildIndex(tmp);
      assert.equal(index.ok, false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('loadSkillBody', () => {
  it('loads a known skill', () => {
    const { meta, body } = loadSkillBody(agentsSkills, 'com-skilling-orchestrator', agentsMeta);
    assert.equal(meta.id, 'com-skilling-orchestrator');
    assert.match(body, /begin_task/);
  });

  it('throws actionable error for unknown id', () => {
    assert.throws(
      () => loadSkillBody(agentsSkills, 'no-such-skill-id'),
      (e: Error) => e.message.includes('Unknown skill_id') && e.message.includes('list tool'),
    );
  });
});

describe('getSkillIndex cache', () => {
  it('reflects in-place SKILL.md edits without restart', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'Skilling-cache-'));
    try {
      const skillDir = path.join(tmp, 'alpha-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      const skillFile = path.join(skillDir, 'SKILL.md');
      fs.writeFileSync(
        skillFile,
        `---
id: alpha-skill
title: Alpha
summary: First summary
---
body
`,
        'utf8',
      );
      invalidateIndexCache();
      const first = getSkillIndex(tmp);
      assert.equal(first.ok, true);
      if (!first.ok) return;
      assert.equal(first.skills[0]!.summary, 'First summary');

      fs.writeFileSync(
        skillFile,
        `---
id: alpha-skill
title: Alpha
summary: Updated summary
---
body
`,
        'utf8',
      );
      const second = getSkillIndex(tmp);
      assert.equal(second.ok, true);
      if (!second.ok) return;
      assert.equal(second.skills[0]!.summary, 'Updated summary');
    } finally {
      invalidateIndexCache();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
