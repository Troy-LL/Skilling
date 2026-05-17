/**
 * One-shot MCP begin_task for SkillPilot hooks / extension.
 * Usage: SKILLPILOT_PROMPT="..." node scripts/extension-begin-task.mjs <dist/index.js> [skillRoot]
 */
import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const entry = process.argv[2];
const skillRootArg = process.argv[3];
const prompt = process.env.SKILLPILOT_PROMPT?.trim();

if (!entry || !prompt) {
  process.stderr.write(
    'Usage: SKILLPILOT_PROMPT="..." node extension-begin-task.mjs <dist/index.js> [skillRoot]\n',
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

const client = new Client({ name: 'skillpilot-extension-begin-task', version: '0.0.0' });

try {
  await client.connect(transport);
  const res = await client.callTool({
    name: 'begin_task',
    arguments: {
      prompt,
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
