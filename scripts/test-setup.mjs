/**
 * Tests for postinstall seeding and setup config writes (temp dirs only).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HOST_REGISTRY,
  PKG_DIR,
  SKILLING_RULES_HEADER,
  buildMcpLaunchEntry,
  buildServerConfigEntry,
  claudeDesktopConfigPath,
  formatEntry,
  hasSkillingEntry,
  mergeHostConfig,
  runPostinstall,
  runSetup,
  seedFindSkills,
  shouldSkipPostinstall,
  writeHostRules,
} from './setup-lib.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function mkTemp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function rmTemp(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function hostById(id) {
  const h = HOST_REGISTRY.find((x) => x.id === id);
  assert.ok(h, `missing host ${id}`);
  return h;
}

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (e) {
    failed++;
    console.error(`fail - ${name}`);
    console.error(e);
  }
}

await test('postinstall seeds find-skills into a fresh temp project root', async () => {
  const project = await mkTemp('skilling-setup-seed-');
  const home = await mkTemp('skilling-setup-seed-home-');
  try {
    const result = await runPostinstall({
      projectRoot: project,
      pkgDir: PKG_DIR,
      homeDir: home,
      appData: path.join(home, 'AppData', 'Roaming'),
      env: { INIT_CWD: project },
    });
    assert.notEqual(result.skipped, true);
    assert.ok(fs.existsSync(path.join(project, '.agents', 'skills', 'find-skills', 'SKILL.md')));
  } finally {
    await rmTemp(project);
    await rmTemp(home);
  }
});

await test('postinstall auto-runs setup when .cursor exists', async () => {
  const project = await mkTemp('skilling-postinstall-setup-');
  const home = await mkTemp('skilling-postinstall-home-');
  try {
    await fsp.mkdir(path.join(project, '.cursor'), { recursive: true });
    await fsp.mkdir(path.join(project, 'node_modules', 'skilling', 'scripts'), { recursive: true });
    await fsp.writeFile(
      path.join(project, 'node_modules', 'skilling', 'scripts', 'run-mcp.mjs'),
      '// stub\n',
      'utf8',
    );
    const result = await runPostinstall({
      projectRoot: project,
      pkgDir: PKG_DIR,
      homeDir: home,
      appData: path.join(home, 'AppData', 'Roaming'),
      env: { INIT_CWD: project },
    });
    assert.notEqual(result.skipped, true);
    assert.ok(fs.existsSync(path.join(project, '.cursor', 'mcp.json')));
    assert.ok(result.wrote || result.results?.some((r) => r.status === 'ok'));
  } finally {
    await rmTemp(project);
    await rmTemp(home);
  }
});

await test('postinstall respects SKILLING_SKIP_AUTO_SETUP', async () => {
  const project = await mkTemp('skilling-postinstall-skip-setup-');
  try {
    await fsp.mkdir(path.join(project, '.cursor'), { recursive: true });
    const result = await runPostinstall({
      projectRoot: project,
      pkgDir: PKG_DIR,
      env: { INIT_CWD: project, SKILLING_SKIP_AUTO_SETUP: '1' },
    });
    assert.equal(result.setupSkipped, true);
    assert.equal(fs.existsSync(path.join(project, '.cursor', 'mcp.json')), false);
  } finally {
    await rmTemp(project);
  }
});

await test('postinstall is non-destructive on second run', async () => {
  const project = await mkTemp('skilling-setup-seed2-');
  try {
    await seedFindSkills(project, PKG_DIR);
    const skillPath = path.join(project, '.agents', 'skills', 'find-skills', 'SKILL.md');
    const before = await fsp.readFile(skillPath, 'utf8');
    await fsp.writeFile(skillPath, `${before}\n<!-- marker -->\n`, 'utf8');
    const second = await seedFindSkills(project, PKG_DIR);
    assert.equal(second.seeded, false);
    const after = await fsp.readFile(skillPath, 'utf8');
    assert.match(after, /<!-- marker -->/);
  } finally {
    await rmTemp(project);
  }
});

await test('postinstall skips when CI=true', async () => {
  const project = await mkTemp('skilling-setup-ci-');
  try {
    assert.equal(shouldSkipPostinstall({ CI: 'true', INIT_CWD: project }, PKG_DIR), true);
    const result = await runPostinstall({
      projectRoot: project,
      pkgDir: PKG_DIR,
      env: { CI: 'true', INIT_CWD: project },
    });
    assert.equal(result.skipped, true);
    assert.equal(fs.existsSync(path.join(project, '.agents', 'skills', 'find-skills', 'SKILL.md')), false);
  } finally {
    await rmTemp(project);
  }
});

await test('setup writes Cursor config with absolute command and args', async () => {
  const project = await mkTemp('skilling-setup-cursor-');
  const home = await mkTemp('skilling-setup-home-cursor-');
  try {
    await fsp.mkdir(path.join(project, '.cursor'), { recursive: true });
    await fsp.mkdir(path.join(project, 'node_modules', 'skilling', 'scripts'), { recursive: true });
    const fakeRunMcp = path.join(project, 'node_modules', 'skilling', 'scripts', 'run-mcp.mjs');
    await fsp.writeFile(fakeRunMcp, '// stub\n', 'utf8');
    await seedFindSkills(project, PKG_DIR);

    const fakeNode = path.join(project, 'fake-node.exe');
    await fsp.writeFile(fakeNode, '', 'utf8');

    await runSetup(['--force'], {
      projectRoot: project,
      homeDir: home,
      appData: path.join(home, 'AppData', 'Roaming'),
      pkgDir: PKG_DIR,
      execPath: fakeNode,
    });

    const cfg = JSON.parse(
      await fsp.readFile(path.join(project, '.cursor', 'mcp.json'), 'utf8'),
    );
    assert.equal(cfg.mcpServers.skilling.command, fakeNode);
    assert.deepEqual(cfg.mcpServers.skilling.args, [path.resolve(fakeRunMcp)]);
    assert.equal(cfg.mcpServers.skilling.env, undefined);
  } finally {
    await rmTemp(project);
    await rmTemp(home);
  }
});

await test('setup writes VS Code config with type stdio and servers root key', async () => {
  const project = await mkTemp('skilling-setup-vscode-');
  const home = await mkTemp('skilling-setup-home-vscode-');
  try {
    await fsp.mkdir(path.join(project, '.vscode'), { recursive: true });
    await fsp.mkdir(path.join(project, 'node_modules', 'skilling', 'scripts'), { recursive: true });
    await fsp.writeFile(
      path.join(project, 'node_modules', 'skilling', 'scripts', 'run-mcp.mjs'),
      '// stub\n',
      'utf8',
    );

    await runSetup(['--force'], {
      projectRoot: project,
      homeDir: home,
      appData: path.join(home, 'AppData', 'Roaming'),
      pkgDir: PKG_DIR,
    });

    const cfg = JSON.parse(
      await fsp.readFile(path.join(project, '.vscode', 'mcp.json'), 'utf8'),
    );
    assert.ok(cfg.servers.skilling);
    assert.equal(cfg.servers.skilling.type, 'stdio');
    assert.ok(Array.isArray(cfg.servers.skilling.args));
  } finally {
    await rmTemp(project);
    await rmTemp(home);
  }
});

await test('setup writes global-host config with env.SKILL_ROOT baked in', async () => {
  const project = await mkTemp('skilling-setup-global-');
  const home = await mkTemp('skilling-setup-home-global-');
  try {
    await fsp.writeFile(path.join(project, 'package.json'), '{}\n', 'utf8');
    await fsp.mkdir(path.join(project, 'node_modules', 'skilling', 'scripts'), { recursive: true });
    await fsp.writeFile(
      path.join(project, 'node_modules', 'skilling', 'scripts', 'run-mcp.mjs'),
      '// stub\n',
      'utf8',
    );
    await seedFindSkills(project, PKG_DIR);

    const claudePath = path.join(home, 'Claude', 'claude_desktop_config.json');
    await fsp.mkdir(path.dirname(claudePath), { recursive: true });

    const host = hostById('claude-desktop');
    const launch = buildMcpLaunchEntry(project, PKG_DIR, path.join(project, 'node.exe'));
    const entry = buildServerConfigEntry(
      formatEntry(host, launch),
      path.join(project, '.agents', 'skills'),
    );

    const outcome = await mergeHostConfig(
      host,
      claudePath,
      entry,
      { force: true },
    );
    assert.equal(outcome, 'written');

    const cfg = JSON.parse(await fsp.readFile(claudePath, 'utf8'));
    assert.equal(cfg.mcpServers.skilling.env.SKILL_ROOT, path.join(project, '.agents', 'skills'));
  } finally {
    await rmTemp(project);
    await rmTemp(home);
  }
});

await test('setup merge preserves other mcpServers entries', async () => {
  const project = await mkTemp('skilling-setup-merge-');
  try {
    await fsp.mkdir(path.join(project, '.cursor'), { recursive: true });
    const configPath = path.join(project, '.cursor', 'mcp.json');
    await fsp.writeFile(
      configPath,
      JSON.stringify({ mcpServers: { other: { command: 'echo', args: [] } } }, null, 2),
      'utf8',
    );

    const host = hostById('cursor');
    const launch = { command: 'node', args: ['/tmp/run-mcp.mjs'] };
    const entry = formatEntry(host, launch);
    await mergeHostConfig(host, configPath, entry, { force: true });

    const cfg = JSON.parse(await fsp.readFile(configPath, 'utf8'));
    assert.ok(cfg.mcpServers.other);
    assert.ok(cfg.mcpServers.skilling);
  } finally {
    await rmTemp(project);
  }
});

await test('setup --force overwrites stale skilling entry', async () => {
  const project = await mkTemp('skilling-setup-force-');
  try {
    await fsp.mkdir(path.join(project, '.cursor'), { recursive: true });
    const configPath = path.join(project, '.cursor', 'mcp.json');
    await fsp.writeFile(
      configPath,
      JSON.stringify(
        { mcpServers: { skilling: { command: 'old-node', args: ['stale'] } } },
        null,
        2,
      ),
      'utf8',
    );

    const host = hostById('cursor');
    const launch = { command: 'new-node', args: ['/new/run-mcp.mjs'] };
    await mergeHostConfig(host, configPath, formatEntry(host, launch), { force: true });

    const cfg = JSON.parse(await fsp.readFile(configPath, 'utf8'));
    assert.equal(cfg.mcpServers.skilling.command, 'new-node');
  } finally {
    await rmTemp(project);
  }
});

await test('setup --dry-run writes nothing', async () => {
  const project = await mkTemp('skilling-setup-dry-');
  const home = await mkTemp('skilling-setup-home-dry-');
  try {
    await fsp.mkdir(path.join(project, '.cursor'), { recursive: true });
    await fsp.writeFile(path.join(project, 'package.json'), '{}\n', 'utf8');
    await fsp.mkdir(path.join(project, 'node_modules', 'skilling', 'scripts'), { recursive: true });
    await fsp.writeFile(
      path.join(project, 'node_modules', 'skilling', 'scripts', 'run-mcp.mjs'),
      '// stub\n',
      'utf8',
    );

    await runSetup(['--dry-run', '--force'], {
      projectRoot: project,
      homeDir: home,
      appData: path.join(home, 'AppData', 'Roaming'),
      pkgDir: PKG_DIR,
    });

    assert.equal(fs.existsSync(path.join(project, '.cursor', 'mcp.json')), false);
    assert.equal(hasSkillingEntry({}, 'mcpServers'), false);
  } finally {
    await rmTemp(project);
    await rmTemp(home);
  }
});

await test('setup without --write-rules does not modify existing rules files', async () => {
  const project = await mkTemp('skilling-setup-no-rules-');
  const home = await mkTemp('skilling-setup-home-no-rules-');
  try {
    await fsp.mkdir(path.join(project, '.vscode'), { recursive: true });
    await fsp.mkdir(path.join(project, '.github'), { recursive: true });
    const rulesPath = path.join(project, '.github', 'copilot-instructions.md');
    await fsp.writeFile(rulesPath, '# Team instructions\nKeep this line.\n', 'utf8');
    await fsp.mkdir(path.join(project, 'node_modules', 'skilling', 'scripts'), { recursive: true });
    await fsp.writeFile(
      path.join(project, 'node_modules', 'skilling', 'scripts', 'run-mcp.mjs'),
      '// stub\n',
      'utf8',
    );

    await runSetup(['--force'], {
      projectRoot: project,
      homeDir: home,
      appData: path.join(home, 'AppData', 'Roaming'),
      pkgDir: PKG_DIR,
    });

    const after = await fsp.readFile(rulesPath, 'utf8');
    assert.equal(after, '# Team instructions\nKeep this line.\n');
    assert.doesNotMatch(after, /Skilling MCP/);
  } finally {
    await rmTemp(project);
    await rmTemp(home);
  }
});

await test('setup --write-rules appends to existing copilot-instructions.md', async () => {
  const project = await mkTemp('skilling-setup-write-rules-');
  const home = await mkTemp('skilling-setup-home-write-rules-');
  try {
    await fsp.mkdir(path.join(project, '.vscode'), { recursive: true });
    await fsp.mkdir(path.join(project, '.github'), { recursive: true });
    const rulesPath = path.join(project, '.github', 'copilot-instructions.md');
    await fsp.writeFile(rulesPath, '# Team instructions\n', 'utf8');
    await fsp.mkdir(path.join(project, 'node_modules', 'skilling', 'scripts'), { recursive: true });
    await fsp.writeFile(
      path.join(project, 'node_modules', 'skilling', 'scripts', 'run-mcp.mjs'),
      '// stub\n',
      'utf8',
    );

    const host = hostById('vscode');
    const ctx = { projectRoot: project, homeDir: home, appData: path.join(home, 'AppData', 'Roaming') };
    const outcome = await writeHostRules(host, ctx, { writeRules: true });
    assert.equal(outcome, 'written');

    const after = await fsp.readFile(rulesPath, 'utf8');
    assert.match(after, /# Team instructions/);
    assert.match(after, new RegExp(SKILLING_RULES_HEADER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally {
    await rmTemp(project);
    await rmTemp(home);
  }
});

await test('setup --write-rules appends to existing Claude rules instead of overwriting', async () => {
  const project = await mkTemp('skilling-setup-claude-rules-');
  try {
    await fsp.mkdir(path.join(project, '.claude', 'rules'), { recursive: true });
    const rulesPath = path.join(project, '.claude', 'rules', 'skilling-lifecycle.md');
    await fsp.writeFile(rulesPath, '# Custom team rules\nDo not remove.\n', 'utf8');

    const host = hostById('claude-code');
    const ctx = { projectRoot: project, homeDir: project, appData: project };
    const outcome = await writeHostRules(host, ctx, { writeRules: true });
    assert.equal(outcome, 'written');

    const after = await fsp.readFile(rulesPath, 'utf8');
    assert.match(after, /Custom team rules/);
    assert.match(after, /Do not remove/);
    assert.match(after, /Skilling MCP/);
  } finally {
    await rmTemp(project);
  }
});

await test('setup --write-rules skips VS Code when copilot-instructions.md absent', async () => {
  const project = await mkTemp('skilling-vscode-no-copilot-');
  try {
    await fsp.mkdir(path.join(project, '.vscode'), { recursive: true });
    const host = hostById('vscode');
    const ctx = { projectRoot: project, homeDir: project, appData: project };
    const outcome = await writeHostRules(host, ctx, { writeRules: true });
    assert.equal(outcome, 'skipped-no-target');
    assert.equal(fs.existsSync(path.join(project, '.github', 'copilot-instructions.md')), false);
  } finally {
    await rmTemp(project);
  }
});

await test('setup --write-rules skips Claude when .claude/ absent', async () => {
  const project = await mkTemp('skilling-claude-no-dir-');
  try {
    await fsp.writeFile(path.join(project, 'package.json'), '{}\n', 'utf8');
    const host = hostById('claude-code');
    const ctx = { projectRoot: project, homeDir: project, appData: project };
    const outcome = await writeHostRules(host, ctx, { writeRules: true });
    assert.equal(outcome, 'skipped-no-target');
  } finally {
    await rmTemp(project);
  }
});

await test('setup --write-rules creates Claude rules when .claude/ exists', async () => {
  const project = await mkTemp('skilling-claude-create-');
  try {
    await fsp.mkdir(path.join(project, '.claude'), { recursive: true });
    const host = hostById('claude-code');
    const ctx = { projectRoot: project, homeDir: project, appData: project };
    const outcome = await writeHostRules(host, ctx, { writeRules: true });
    assert.equal(outcome, 'written');
    const rulesPath = path.join(project, '.claude', 'rules', 'skilling-lifecycle.md');
    assert.ok(fs.existsSync(rulesPath));
    const content = await fsp.readFile(rulesPath, 'utf8');
    assert.match(content, /Skilling MCP/);
  } finally {
    await rmTemp(project);
  }
});

await test('writeHostRules requires --write-rules flag', async () => {
  const project = await mkTemp('skilling-write-rules-flag-');
  try {
    await fsp.mkdir(path.join(project, '.vscode'), { recursive: true });
    await fsp.mkdir(path.join(project, '.github'), { recursive: true });
    const rulesPath = path.join(project, '.github', 'copilot-instructions.md');
    await fsp.writeFile(rulesPath, '# Team instructions\n', 'utf8');

    const host = hostById('vscode');
    const ctx = { projectRoot: project, homeDir: project, appData: project };
    assert.equal(await writeHostRules(host, ctx, { writeRules: false }), 'skipped');

    const before = await fsp.readFile(rulesPath, 'utf8');
    assert.equal(await writeHostRules(host, ctx, { writeRules: true }), 'written');
    const after = await fsp.readFile(rulesPath, 'utf8');
    assert.notEqual(before, after);
  } finally {
    await rmTemp(project);
  }
});

await test('claude-code MCP not configured for plain package.json project', async () => {
  const project = await mkTemp('skilling-claude-no-detect-');
  try {
    await fsp.writeFile(path.join(project, 'package.json'), '{}\n', 'utf8');
    const host = hostById('claude-code');
    const ctx = { projectRoot: project, homeDir: project, appData: project };
    assert.equal(host.detect(ctx), false);
    assert.equal(fs.existsSync(path.join(project, '.mcp.json')), false);
  } finally {
    await rmTemp(project);
  }
});

await test('claude-code MCP configured when .claude/ exists', async () => {
  const project = await mkTemp('skilling-claude-detect-');
  const home = await mkTemp('skilling-claude-detect-home-');
  try {
    await fsp.mkdir(path.join(project, '.claude'), { recursive: true });
    await fsp.mkdir(path.join(project, 'node_modules', 'skilling', 'scripts'), { recursive: true });
    await fsp.writeFile(
      path.join(project, 'node_modules', 'skilling', 'scripts', 'run-mcp.mjs'),
      '// stub\n',
      'utf8',
    );
    await runSetup(['--force'], {
      projectRoot: project,
      homeDir: home,
      appData: path.join(home, 'AppData', 'Roaming'),
      pkgDir: PKG_DIR,
    });
    assert.ok(fs.existsSync(path.join(project, '.mcp.json')));
  } finally {
    await rmTemp(project);
    await rmTemp(home);
  }
});

await test('setup skips global host with repoint hint when already configured', async () => {
  const project = await mkTemp('skilling-global-skip-');
  const home = await mkTemp('skilling-global-skip-home-');
  try {
    await fsp.writeFile(path.join(project, 'package.json'), '{}\n', 'utf8');
    await fsp.mkdir(path.join(project, 'node_modules', 'skilling', 'scripts'), { recursive: true });
    await fsp.writeFile(
      path.join(project, 'node_modules', 'skilling', 'scripts', 'run-mcp.mjs'),
      '// stub\n',
      'utf8',
    );

    const appData = path.join(home, 'AppData', 'Roaming');
    const claudePath = claudeDesktopConfigPath(home, appData);
    await fsp.mkdir(path.dirname(claudePath), { recursive: true });
    await fsp.writeFile(
      claudePath,
      JSON.stringify(
        {
          mcpServers: {
            skilling: {
              command: 'old-node',
              args: ['stale'],
              env: { SKILL_ROOT: '/old/path/.agents/skills' },
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    let output = '';
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk) => {
      output += String(chunk);
      return true;
    };
    try {
      const result = await runSetup([], {
        projectRoot: project,
        homeDir: home,
        appData,
        pkgDir: PKG_DIR,
      });
      const claude = result.results.find((r) => r.host.id === 'claude-desktop');
      assert.equal(claude?.status, 'skipped');
    } finally {
      process.stdout.write = origWrite;
    }

    assert.match(output, /existing global entry unchanged \(use --force to repoint SKILL_ROOT\)/);
    const cfg = JSON.parse(await fsp.readFile(claudePath, 'utf8'));
    assert.equal(cfg.mcpServers.skilling.env.SKILL_ROOT, '/old/path/.agents/skills');
  } finally {
    await rmTemp(project);
    await rmTemp(home);
  }
});

await test('windsurf rules only run for project with .windsurf marker', async () => {
  const project = await mkTemp('skilling-windsurf-rules-');
  try {
    const host = hostById('windsurf-rules');
    const ctx = { projectRoot: project, homeDir: project, appData: project };
    assert.equal(host.detect(ctx), false);

    await fsp.mkdir(path.join(project, '.windsurf'), { recursive: true });
    assert.equal(host.detect(ctx), true);

    const outcome = await writeHostRules(host, ctx, { writeRules: true });
    assert.equal(outcome, 'written');
    assert.ok(fs.existsSync(path.join(project, '.windsurfrules')));
  } finally {
    await rmTemp(project);
  }
});

console.log(`\ntest-setup: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
