/**
 * Shared helpers for postinstall and `skilling setup`.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PKG_DIR = path.resolve(__dirname, '..');
export const SERVER_NAME = 'skilling';
export const FIND_SKILLS_ID = 'find-skills';

export function resolvePkgDir(override) {
  return override ? path.resolve(override) : PKG_DIR;
}

/** INIT_CWD → walk up for package.json or .git */
export function resolveProjectRoot(startDir = process.env.INIT_CWD?.trim() || process.cwd()) {
  if (!startDir?.trim()) return process.cwd();
  let dir = path.resolve(startDir);
  for (let depth = 0; depth < 25; depth++) {
    if (fs.existsSync(path.join(dir, 'package.json')) || fs.existsSync(path.join(dir, '.git'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(startDir);
}

export function shouldSkipAutoSetup(env = process.env) {
  return Boolean(env.SKILLING_SKIP_AUTO_SETUP?.trim());
}

export function shouldSkipPostinstall(env = process.env, pkgDir = PKG_DIR) {
  if (env.CI) return true;
  if (env.npm_config_global === 'true') return true;
  if (env.SKILLING_SKIP_POSTINSTALL) return true;
  const projectRoot = resolveProjectRoot(env.INIT_CWD?.trim() || env.cwd || process.cwd());
  const resolvedProject = path.resolve(projectRoot);
  const resolvedPkg = path.resolve(pkgDir);
  if (resolvedProject === resolvedPkg) return true;
  if (resolvedProject.startsWith(resolvedPkg + path.sep)) return true;
  return false;
}

async function copyDirRecursive(src, dest) {
  await fsp.mkdir(dest, { recursive: true });
  for (const name of await fsp.readdir(src, { withFileTypes: true })) {
    const from = path.join(src, name.name);
    const to = path.join(dest, name.name);
    if (name.isDirectory()) await copyDirRecursive(from, to);
    else if (name.isFile()) await fsp.copyFile(from, to);
  }
}

/** Idempotent: seeds find-skills from bundled package catalog. */
export async function seedFindSkills(projectRoot, pkgDir = PKG_DIR) {
  const src = path.join(pkgDir, '.agents', 'skills', FIND_SKILLS_ID);
  const destDir = path.join(projectRoot, '.agents', 'skills');
  const dest = path.join(destDir, FIND_SKILLS_ID);

  if (!fs.existsSync(src)) {
    throw new Error(
      `Skilling: bundled find-skills missing at ${src}. Reinstall the skilling package.`,
    );
  }

  await fsp.mkdir(destDir, { recursive: true });
  if (fs.existsSync(path.join(dest, 'SKILL.md'))) {
    return { seeded: false, dest };
  }

  await copyDirRecursive(src, dest);
  return { seeded: true, dest };
}

export async function countSkills(projectRoot) {
  const skillsDir = path.join(projectRoot, '.agents', 'skills');
  if (!fs.existsSync(skillsDir)) return 0;
  let count = 0;
  for (const d of await fsp.readdir(skillsDir, { withFileTypes: true })) {
    if (d.isDirectory() && fs.existsSync(path.join(skillsDir, d.name, 'SKILL.md'))) count++;
  }
  return count;
}

export function resolveLocalRunMcp(projectRoot) {
  return path.join(projectRoot, 'node_modules', SERVER_NAME, 'scripts', 'run-mcp.mjs');
}

export function buildMcpLaunchEntry(projectRoot, pkgDir = PKG_DIR, execPath = process.execPath) {
  const localScript = resolveLocalRunMcp(projectRoot);
  if (fs.existsSync(localScript)) {
    return {
      mode: 'local',
      command: execPath,
      args: [path.resolve(localScript)],
    };
  }
  return {
    mode: 'npx',
    command: 'npx',
    args: ['-y', `${SERVER_NAME}@latest`],
  };
}

export function buildServerConfigEntry(launch, skillRootAbs) {
  const base = { command: launch.command, args: launch.args };
  if (launch.type) base.type = launch.type;
  if (skillRootAbs) {
    return { ...base, env: { SKILL_ROOT: path.resolve(skillRootAbs) } };
  }
  return base;
}

export function claudeDesktopConfigPath(homeDir = os.homedir(), appData) {
  if (process.platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }
  if (process.platform === 'win32') {
    const base = appData || process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
    return path.join(base, 'Claude', 'claude_desktop_config.json');
  }
  return path.join(homeDir, '.config', 'claude-desktop', 'claude_desktop_config.json');
}

export function windsurfConfigPath(homeDir = os.homedir()) {
  return path.join(homeDir, '.codeium', 'windsurf', 'mcp_config.json');
}

export function zedConfigPath(homeDir = os.homedir()) {
  return path.join(homeDir, '.config', 'zed', 'settings.json');
}

/** @typedef {'project' | 'global' | 'snippet'} HostScope */
/** @typedef {'merge' | 'dropin' | 'snippet'} HostWriteMode */

/**
 * @typedef {object} HostDef
 * @property {string} id
 * @property {string} label
 * @property {HostScope} scope
 * @property {HostWriteMode} writeMode
 * @property {string} rootKey
 * @property {boolean} [stdioType]
 * @property {(ctx: SetupContext) => boolean} detect
 * @property {(ctx: SetupContext) => string} configPath
 */

/** @typedef {object} SetupContext
 * @property {string} projectRoot
 * @property {string} homeDir
 * @property {string} pkgDir
 * @property {string} [appData]
 */

/** @type {HostDef[]} */
export const HOST_REGISTRY = [
  {
    id: 'cursor',
    label: 'Cursor',
    scope: 'project',
    writeMode: 'merge',
    rootKey: 'mcpServers',
    stdioType: false,
    detect: (ctx) => fs.existsSync(path.join(ctx.projectRoot, '.cursor')),
    configPath: (ctx) => path.join(ctx.projectRoot, '.cursor', 'mcp.json'),
  },
  {
    id: 'vscode',
    label: 'VS Code',
    scope: 'project',
    writeMode: 'merge',
    rootKey: 'servers',
    stdioType: true,
    detect: (ctx) => fs.existsSync(path.join(ctx.projectRoot, '.vscode')),
    configPath: (ctx) => path.join(ctx.projectRoot, '.vscode', 'mcp.json'),
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    scope: 'project',
    writeMode: 'merge',
    rootKey: 'mcpServers',
    stdioType: true,
    detect: (ctx) =>
      fs.existsSync(path.join(ctx.projectRoot, '.mcp.json')) ||
      fs.existsSync(path.join(ctx.projectRoot, '.git')) ||
      fs.existsSync(path.join(ctx.projectRoot, 'package.json')),
    configPath: (ctx) => path.join(ctx.projectRoot, '.mcp.json'),
  },
  {
    id: 'continue',
    label: 'Continue',
    scope: 'project',
    writeMode: 'dropin',
    rootKey: 'mcpServers',
    stdioType: false,
    detect: (ctx) =>
      fs.existsSync(path.join(ctx.projectRoot, '.continue')) ||
      fs.existsSync(path.join(ctx.projectRoot, 'package.json')),
    configPath: (ctx) => path.join(ctx.projectRoot, '.continue', 'mcpServers', `${SERVER_NAME}.json`),
  },
  {
    id: 'amazon-q',
    label: 'Amazon Q',
    scope: 'project',
    writeMode: 'merge',
    rootKey: 'mcpServers',
    stdioType: false,
    detect: (ctx) =>
      fs.existsSync(path.join(ctx.projectRoot, '.amazonq')) ||
      fs.existsSync(path.join(ctx.projectRoot, 'package.json')),
    configPath: (ctx) => path.join(ctx.projectRoot, '.amazonq', 'default.json'),
  },
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    scope: 'global',
    writeMode: 'merge',
    rootKey: 'mcpServers',
    stdioType: false,
    detect: () => true,
    configPath: (ctx) => claudeDesktopConfigPath(ctx.homeDir, ctx.appData),
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    scope: 'global',
    writeMode: 'merge',
    rootKey: 'mcpServers',
    stdioType: false,
    detect: (ctx) => {
      const p = windsurfConfigPath(ctx.homeDir);
      return fs.existsSync(p) || fs.existsSync(path.dirname(p));
    },
    configPath: (ctx) => windsurfConfigPath(ctx.homeDir),
  },
  {
    id: 'zed',
    label: 'Zed',
    scope: 'global',
    writeMode: 'merge',
    rootKey: 'context_servers',
    stdioType: false,
    detect: (ctx) => {
      const p = zedConfigPath(ctx.homeDir);
      return fs.existsSync(p) || fs.existsSync(path.dirname(p));
    },
    configPath: (ctx) => zedConfigPath(ctx.homeDir),
  },
];

export function formatEntry(host, launchEntry) {
  const base = { command: launchEntry.command, args: [...launchEntry.args] };
  if (host.stdioType) base.type = 'stdio';
  return base;
}

export async function readJsonFile(filePath) {
  try {
    const text = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT') {
      return {};
    }
    throw new Error(`Skilling: cannot read ${filePath}: ${e instanceof Error ? e.message : e}`);
  }
}

export async function writeJsonFile(filePath, data) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function hasSkillingEntry(config, rootKey) {
  const bucket = config?.[rootKey];
  return bucket != null && typeof bucket === 'object' && SERVER_NAME in bucket;
}

/**
 * Merge skilling entry into host config file.
 * @returns {'written' | 'skipped' | 'would-write'}
 */
export async function mergeHostConfig(host, configPath, entry, { force = false, dryRun = false } = {}) {
  if (host.writeMode === 'dropin') {
    const payload = { [host.rootKey]: { [SERVER_NAME]: entry } };
    if (fs.existsSync(configPath) && !force) {
      const existing = await readJsonFile(configPath);
      if (hasSkillingEntry(existing, host.rootKey)) return 'skipped';
    }
    if (dryRun) return 'would-write';
    await writeJsonFile(configPath, payload);
    return 'written';
  }

  let config = {};
  if (fs.existsSync(configPath)) {
    config = await readJsonFile(configPath);
  }
  if (!config[host.rootKey] || typeof config[host.rootKey] !== 'object') {
    config[host.rootKey] = {};
  }
  if (hasSkillingEntry(config, host.rootKey) && !force) {
    return 'skipped';
  }
  config[host.rootKey][SERVER_NAME] = entry;
  if (dryRun) return 'would-write';
  await writeJsonFile(configPath, config);
  return 'written';
}

export function detectReason(host) {
  switch (host.id) {
    case 'cursor':
      return '.cursor/ absent';
    case 'vscode':
      return '.vscode/ absent';
    case 'claude-code':
      return 'no project markers';
    case 'continue':
      return 'not a project directory';
    case 'amazon-q':
      return 'not a project directory';
    case 'windsurf':
      return 'Windsurf config dir absent';
    case 'zed':
      return 'Zed config dir absent';
    default:
      return 'not detected';
  }
}

export function printHelp() {
  process.stdout.write(`Skilling setup — configure MCP for your IDE(s)

Usage:
  npx skilling setup [options]

Options:
  --force     Overwrite existing "${SERVER_NAME}" MCP entries
  --dry-run   Show what would be written without changing files
  --help      Print this help

After setup, restart your IDE so it loads the MCP server.
`);
}

export function parseSetupArgs(argv) {
  const flags = { force: false, dryRun: false, help: false };
  for (const arg of argv) {
    if (arg === '--force') flags.force = true;
    else if (arg === '--dry-run') flags.dryRun = true;
    else if (arg === '--help' || arg === '-h') flags.help = true;
    else {
      throw new Error(`Unknown option: ${arg}. Run "npx skilling setup --help" for usage.`);
    }
  }
  return flags;
}

/**
 * @param {string[]} argv
 * @param {{ projectRoot?: string, homeDir?: string, pkgDir?: string, execPath?: string, appData?: string, quiet?: boolean, fromPostinstall?: boolean }} [overrides]
 */
export async function runSetup(argv = [], overrides = {}) {
  const flags = parseSetupArgs(argv);
  if (flags.help) {
    printHelp();
    return { ok: true, help: true };
  }

  const quiet = overrides.quiet ?? false;
  const projectRoot = path.resolve(overrides.projectRoot ?? resolveProjectRoot());
  const homeDir = overrides.homeDir ?? os.homedir();
  const pkgDir = resolvePkgDir(overrides.pkgDir);
  const execPath = overrides.execPath ?? process.execPath;
  const appData = overrides.appData ?? process.env.APPDATA;
  const ctx = { projectRoot, homeDir, pkgDir, appData };

  await seedFindSkills(projectRoot, pkgDir);
  const skillCount = await countSkills(projectRoot);
  const skillsDir = path.join(projectRoot, '.agents', 'skills');
  const launch = buildMcpLaunchEntry(projectRoot, pkgDir, execPath);

  const lines = [];
  lines.push(`Skilling setup${flags.dryRun ? ' (dry-run)' : ''}  (${launch.mode} install)`);
  lines.push(`  Node:    ${launch.command}`);
  lines.push(`  Script:  ${launch.args.join(' ')}`);
  lines.push(`  Skills:  ${skillsDir}  (${skillCount} skill${skillCount === 1 ? '' : 's'})`);
  lines.push('');

  const results = [];

  for (const host of HOST_REGISTRY) {
    if (!host.detect(ctx)) {
      results.push({ host, status: 'not-detected', reason: detectReason(host) });
      continue;
    }

    const formatted = formatEntry(host, launch);
    const skillRoot =
      host.scope === 'global' ? path.join(projectRoot, '.agents', 'skills') : undefined;
    const entry = buildServerConfigEntry(formatted, skillRoot);
    const configPath = host.configPath(ctx);

    try {
      const outcome = await mergeHostConfig(host, configPath, entry, {
        force: flags.force,
        dryRun: flags.dryRun,
      });
      if (outcome === 'skipped') {
        results.push({ host, status: 'skipped', configPath, reason: 'already configured (use --force)' });
      } else {
        results.push({ host, status: outcome === 'would-write' ? 'would-write' : 'ok', configPath });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ host, status: 'error', configPath, reason: msg });
    }
  }

  for (const r of results) {
    if (r.status === 'ok' || r.status === 'would-write') {
      lines.push(`  [ok] ${r.host.label.padEnd(16)} → ${r.configPath}`);
    } else if (r.status === 'skipped') {
      lines.push(`  [skip] ${r.host.label.padEnd(14)} ${r.reason}`);
    } else if (r.status === 'not-detected') {
      lines.push(`  [-]  ${r.host.label.padEnd(16)} not detected (${r.reason})`);
    } else {
      lines.push(`  [!]  ${r.host.label.padEnd(16)} ${r.reason}`);
    }
  }

  lines.push('');
  lines.push('  JetBrains — add via Settings > Tools > AI Assistant > MCP:');
  lines.push(`    Command: ${launch.command}`);
  lines.push(`    Args:    ${launch.args.join(' ')}`);
  if (launch.mode === 'local') {
    lines.push(`    Env:     SKILL_ROOT=${skillsDir}`);
  }
  lines.push('');
  lines.push('  Restart your IDE to load the MCP server.');

  const wrote = results.some((r) => r.status === 'ok');
  const hadSkip = results.some((r) => r.status === 'skipped');
  const hadError = results.some((r) => r.status === 'error');

  if (quiet && !wrote && !hadError) {
    if (hadSkip) {
      process.stdout.write(
        'Skilling: find-skills ready; MCP configs already present. Run "npx skilling setup --force" to refresh.\n',
      );
    } else {
      process.stdout.write(
        'Skilling: find-skills ready in .agents/skills/. Run "npx skilling setup" after adding .cursor/ or .vscode/.\n',
      );
    }
  } else {
    process.stdout.write(`${lines.join('\n')}\n`);
  }

  return { ok: !hadError, results, launch, projectRoot, skillCount, wrote, hadSkip, hadError };
}

export async function runPostinstall(overrides = {}) {
  const env = overrides.env ?? process.env;
  const pkgDir = resolvePkgDir(overrides.pkgDir);

  if (shouldSkipPostinstall(env, pkgDir)) {
    return { skipped: true };
  }

  const projectRoot = path.resolve(
    overrides.projectRoot ?? resolveProjectRoot(env.INIT_CWD?.trim() || process.cwd()),
  );

  if (shouldSkipAutoSetup(env)) {
    const { seeded } = await seedFindSkills(projectRoot, pkgDir);
    process.stdout.write(
      `Skilling: ${seeded ? 'seeded' : 'found'} find-skills → .agents/skills/  run "npx skilling setup" to configure your IDE\n`,
    );
    return { skipped: false, seeded, projectRoot, setupSkipped: true };
  }

  return runSetup([], {
    ...overrides,
    projectRoot,
    pkgDir,
    quiet: overrides.quiet ?? true,
    fromPostinstall: true,
  });
}
