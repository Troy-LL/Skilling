/**
 * One-shot MCP suggest + begin_task for Skilling hooks / extension (opt-in auto-inject).
 * Usage: SKILLING_PROMPT="..." node scripts/extension-begin-task.mjs <dist/index.js> [skillRoot]
 */
import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const entry = process.argv[2];
const skillRootArg = process.argv[3];
const prompt = process.env.SKILLING_PROMPT?.trim();
const PLAN_MIN_CONFIDENCE = 0.35;

if (!entry || !prompt) {
  process.stderr.write(
    'Usage: SKILLING_PROMPT="..." node extension-begin-task.mjs <dist/index.js> [skillRoot]\n',
  );
  process.exit(2);
}

const args = [path.resolve(entry)];
if (skillRootArg) {
  args.push('--skill-root', path.resolve(skillRootArg));
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args,
  cwd: path.dirname(path.resolve(entry)),
  stderr: 'pipe',
});

const client = new Client({ name: 'Skilling-extension-begin-task', version: '0.0.0' });

try {
  await client.connect(transport);
  const suggestRes = await client.callTool({
    name: 'suggest_skills',
    arguments: {
      goal: prompt,
      client: 'cursor-hook',
      top_k: 3,
    },
  });
  if (suggestRes.isError) {
    process.stderr.write(JSON.stringify(suggestRes.content) + '\n');
    process.exit(1);
  }
  const suggested =
    suggestRes.structuredContent ?? JSON.parse(suggestRes.content?.[0]?.text ?? '{}');
  const skillId = suggested?.skill_id;
  const confidence = suggested?.confidence ?? 0;
  if (
    !skillId ||
    confidence < PLAN_MIN_CONFIDENCE ||
    suggested?.warnings?.includes('low_confidence')
  ) {
    process.stderr.write(
      JSON.stringify({
        message: 'No strong skill match for hook auto-inject',
        skill_id: skillId ?? null,
        confidence,
      }) + '\n',
    );
    process.exit(1);
  }

  const res = await client.callTool({
    name: 'begin_task',
    arguments: {
      prompt,
      skill_id: skillId,
      client: 'cursor-hook',
      response_detail: 'summary',
    },
  });
  if (res.isError) {
    process.stderr.write(JSON.stringify(res.content) + '\n');
    process.exit(1);
  }
  const payload = res.structuredContent ?? JSON.parse(res.content?.[0]?.text ?? '{}');
  process.stdout.write(JSON.stringify(payload) + '\n');
} finally {
  await client.close();
}
