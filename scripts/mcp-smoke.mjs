/**
 * Spawns the Skilling MCP server over stdio and exercises lifecycle tools.
 * Run from repo root after `npm run build`: `npm run smoke`
 *
 * Flow: list → suggest_skills → load(compact) → skill_plan → begin_task(skill_id) → get_session → end_task
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const entry = path.join(repoRoot, 'dist', 'index.js');
const skillRoot = path.join(repoRoot, '.agents', 'skills');
const sessionFile = path.join(repoRoot, '.skilling', 'session.json');
const compactSkillId = 'create-hook-templates';

function report(step, payload) {
  const parts = [`Step ${step}: ok`];
  if (payload?.skill_id) parts.push(`skill_id=${payload.skill_id}`);
  if (payload?.token_estimate != null) parts.push(`token_estimate=${payload.token_estimate}`);
  if (payload?.ttl_ms != null) parts.push(`ttl_ms=${payload.ttl_ms}`);
  if (payload?.inject_mode) parts.push(`inject_mode=${payload.inject_mode}`);
  if (payload?.count != null) parts.push(`count=${payload.count}`);
  console.log(parts.join(', '));
}

function fail(step, detail) {
  console.error(`Step ${step} failed:`, detail);
  process.exit(1);
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [entry, '--skill-root', skillRoot],
  cwd: repoRoot,
  stderr: 'pipe',
});

const client = new Client({ name: 'Skilling-smoke', version: '0.0.0' });

try {
  await client.connect(transport);

  const instructions = client.getInstructions();
  if (!instructions || !instructions.includes('begin_task')) {
    fail('server instructions', instructions ?? 'missing');
  }
  if (!instructions.includes('skill_id')) {
    fail('server instructions', 'missing skill_id requirement');
  }
  report('server instructions');

  const promptList = await client.listPrompts();
  const promptNames = promptList.prompts?.map((p) => p.name) ?? [];
  if (!promptNames.includes('skilling_workflow')) {
    fail('listPrompts', promptNames);
  }
  report('listPrompts', { count: promptNames.length });

  const promptRes = await client.getPrompt({ name: 'skilling_workflow', arguments: {} });
  const promptText = promptRes.messages?.[0]?.content;
  const promptBody =
    promptText && typeof promptText === 'object' && 'text' in promptText ? promptText.text : '';
  if (!promptBody.includes('begin_task') || !promptBody.includes('end_task')) {
    fail('getPrompt(skilling_workflow)', promptBody.slice(0, 120));
  }
  report('getPrompt(skilling_workflow)');

  const listRes = await client.callTool({ name: 'list', arguments: {} });
  if (listRes.isError) fail('list', listRes.content);
  const skills = listRes.structuredContent?.skills ?? [];
  if (!skills.some((s) => s.id === 'mcp-builder-implementation')) {
    fail('list', 'expected mcp-builder-implementation in .agents/skills');
  }
  report('list', { count: skills.length });

  const aliasList = await client.callTool({ name: 'skill_list', arguments: {} });
  if (aliasList.isError || aliasList.structuredContent?.skills?.length !== skills.length) {
    fail('skill_list alias', aliasList.content ?? aliasList.structuredContent);
  }
  report('skill_list alias', { count: skills.length });

  const suggestRes = await client.callTool({
    name: 'suggest_skills',
    arguments: { goal: 'build a distinctive frontend UI with React' },
  });
  if (suggestRes.isError) fail('suggest_skills', suggestRes.content);
  const suggested = suggestRes.structuredContent;
  if (!suggested?.candidates?.length) fail('suggest_skills', suggested);
  report('suggest_skills', {
    skill_id: suggested.skill_id,
    confidence: suggested.confidence,
    count: suggested.candidates.length,
  });

  const selectRes = await client.callTool({
    name: 'select',
    arguments: { prompt: 'build a distinctive frontend UI with React' },
  });
  if (selectRes.isError) fail('select alias', selectRes.content);
  report('select alias', { skill_id: selectRes.structuredContent?.skill_id });

  const loadRes = await client.callTool({
    name: 'load',
    arguments: { skill_id: compactSkillId, inject_mode: 'compact' },
  });
  if (loadRes.isError) fail('load(compact)', loadRes.content);
  const loaded = loadRes.structuredContent;
  if (loaded?.inject_mode !== 'compact' || !loaded?.body || !loaded?.token_estimate) {
    fail('load(compact)', loaded);
  }
  if (typeof loaded?.omitted_code_blocks !== 'number' || loaded.omitted_code_blocks < 1) {
    fail('load(compact)', 'expected omitted_code_blocks metadata');
  }
  report('load(compact)', loaded);

  const planRes = await client.callTool({
    name: 'skill_plan',
    arguments: {
      goal: 'Implement Skilling token compression and suggest_skills tool',
      max_skills: 3,
      token_budget: 900,
    },
  });
  if (planRes.isError || !planRes.structuredContent?.suggestions?.length) {
    fail('skill_plan', planRes.content ?? planRes.structuredContent);
  }
  if (!planRes.structuredContent?.deprecated) {
    fail('skill_plan', 'missing deprecated flag');
  }
  report('skill_plan', { count: planRes.structuredContent.suggestions.length });

  const beginRes = await client.callTool({
    name: 'begin_task',
    arguments: {
      prompt: 'find a skill for API testing',
      skill_id: 'find-skills',
      token_budget: 300,
    },
  });
  if (beginRes.isError) fail('begin_task (find-skills)', beginRes.content);
  const begin = beginRes.structuredContent;
  if (begin?.skill_id !== 'find-skills' || !begin?.correlation_id) {
    fail('begin_task (find-skills)', begin);
  }
  if (!begin.summary || begin.alternatives !== undefined) {
    fail('begin_task (summary mode)', begin);
  }
  if (!begin.token_estimate || begin.ttl_hint === undefined) {
    fail('begin_task (find-skills)', 'missing token_estimate or ttl_hint');
  }
  report('begin_task (find-skills)', begin);

  const missingId = await client.callTool({
    name: 'begin_task',
    arguments: { prompt: 'build without skill id' },
  });
  if (!missingId.isError) fail('begin_task (missing skill_id)', 'expected validation error');
  report('begin_task (missing skill_id rejected)');

  if (!fs.existsSync(sessionFile)) fail('session file', sessionFile);
  const onDisk = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
  if (!onDisk.summary || !onDisk.rationale || onDisk.version !== 2) {
    fail('session file (v2)', onDisk);
  }
  report('session file (v2)');

  const getRes = await client.callTool({
    name: 'get_session',
    arguments: { include_summary: true },
  });
  if (getRes.isError || !getRes.structuredContent?.active) {
    fail('get_session', getRes.structuredContent ?? getRes.content);
  }
  if (!getRes.structuredContent.summary) fail('get_session', 'missing summary');
  report('get_session');

  const healthRes = await client.callTool({ name: 'health', arguments: {} });
  if (healthRes.isError || !healthRes.structuredContent?.ok) {
    fail('health', healthRes.content);
  }
  if (!healthRes.structuredContent.setup_hint) {
    fail('health', 'missing setup_hint');
  }
  report('health', { count: healthRes.structuredContent.skill_count });

  const end1 = await client.callTool({ name: 'end_task', arguments: {} });
  if (end1.isError || !end1.structuredContent?.ok) fail('end_task', end1.content);
  report('end_task');
  if (fs.existsSync(sessionFile)) fail('end_task cleanup', 'session file still present');

  const beginCompact = await client.callTool({
    name: 'begin_task',
    arguments: {
      prompt: 'smoke test compact injection',
      skill_id: compactSkillId,
      inject_mode: 'compact',
    },
  });
  if (beginCompact.isError) fail('begin_task (explicit compact)', beginCompact.content);
  const compact = beginCompact.structuredContent;
  if (
    compact?.skill_id !== compactSkillId ||
    compact?.inject_mode !== 'compact' ||
    !compact?.token_estimate ||
    !compact?.ttl_ms
  ) {
    fail('begin_task (explicit compact)', compact);
  }
  report('begin_task (explicit compact)', compact);

  const getCompact = await client.callTool({
    name: 'get_session',
    arguments: { include_summary: true },
  });
  if (getCompact.isError || !getCompact.structuredContent?.active) {
    fail('get_session (compact)', getCompact.structuredContent ?? getCompact.content);
  }
  report('get_session (compact)');

  const end2 = await client.callTool({ name: 'end_task', arguments: {} });
  if (end2.isError || !end2.structuredContent?.ok) fail('end_task (compact)', end2.content);
  report('end_task (compact)');

  const end3 = await client.callTool({
    name: 'end_task',
    arguments: { correlation_id: begin.correlation_id },
  });
  if (end3.isError || !end3.structuredContent?.ok) {
    fail('end_task (idempotent)', end3.content);
  }
  report('end_task (idempotent)');

  console.log('MCP smoke: all steps passed.');
} finally {
  await client.close();
}
