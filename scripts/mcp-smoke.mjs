/**
 * Spawns the SkillPilot MCP server over stdio and exercises lifecycle tools.
 * Run from repo root after `npm run build`: `node scripts/mcp-smoke.mjs`
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const entry = path.join(repoRoot, 'dist', 'index.js');
const skillRoot = path.join(repoRoot, 'skills');
const sessionFile = path.join(repoRoot, '.skillpilot', 'session.json');

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [entry, '--skill-root', skillRoot],
  cwd: repoRoot,
  stderr: 'pipe',
});

const client = new Client({ name: 'skillpilot-smoke', version: '0.0.0' });

try {
  await client.connect(transport);

  const listRes = await client.callTool({ name: 'list', arguments: {} });
  if (listRes.isError) {
    console.error('list failed:', listRes.content);
    process.exit(1);
  }
  console.log('Step list: ok,', listRes.structuredContent?.skills?.length, 'skill(s)');

  const beginRes = await client.callTool({
    name: 'begin_task',
    arguments: { prompt: 'find a skill for API testing', phase: 'plan' },
  });
  if (beginRes.isError) {
    console.error('begin_task failed:', beginRes.content);
    process.exit(1);
  }
  const begin = beginRes.structuredContent;
  if (begin?.skill_id !== 'find-skills' || !begin?.correlation_id) {
    console.error('begin_task: unexpected payload', begin);
    process.exit(1);
  }
  if (!begin.summary || begin.alternatives !== undefined) {
    console.error('begin_task: expected summary mode without alternatives', begin);
    process.exit(1);
  }
  console.log('Step begin_task (summary): ok, skill_id:', begin.skill_id);

  if (!fs.existsSync(sessionFile)) {
    console.error('begin_task: session file missing at', sessionFile);
    process.exit(1);
  }
  const onDisk = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
  if (!onDisk.summary || !onDisk.rationale || onDisk.version !== 2) {
    console.error('session file: expected v2 summary/rationale', onDisk);
    process.exit(1);
  }
  console.log('Step session file (v2): ok');

  const getRes = await client.callTool({
    name: 'get_session',
    arguments: { include_summary: true },
  });
  if (getRes.isError || !getRes.structuredContent?.active) {
    console.error('get_session failed:', getRes.structuredContent);
    process.exit(1);
  }
  if (!getRes.structuredContent.summary) {
    console.error('get_session: missing summary');
    process.exit(1);
  }
  console.log('Step get_session: ok');

  const end1 = await client.callTool({ name: 'end_task', arguments: {} });
  if (end1.isError || !end1.structuredContent?.ok) {
    console.error('end_task failed:', end1.content);
    process.exit(1);
  }
  console.log('Step end_task: ok');

  if (fs.existsSync(sessionFile)) {
    console.error('end_task: session file should be removed');
    process.exit(1);
  }

  const end2 = await client.callTool({
    name: 'end_task',
    arguments: { correlation_id: begin.correlation_id },
  });
  if (end2.isError || !end2.structuredContent?.ok) {
    console.error('end_task idempotent failed:', end2.content);
    process.exit(1);
  }
  console.log('Step end_task (idempotent): ok');
  console.log('MCP smoke: all steps passed.');
} finally {
  await client.close();
}
