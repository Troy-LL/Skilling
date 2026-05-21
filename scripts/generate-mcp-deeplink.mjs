#!/usr/bin/env node
/**
 * Print a Cursor MCP install deeplink for the published npx config.
 * Usage: node scripts/generate-mcp-deeplink.mjs
 *
 * Omits SKILL_ROOT — the server discovers .agents/skills from cwd at runtime.
 */
const config = {
  command: 'npx',
  args: ['-y', 'skilling@latest'],
};

const encoded = Buffer.from(JSON.stringify(config), 'utf8').toString('base64');
const url = `cursor://anysphere.cursor-deeplink/mcp/install?name=skilling&config=${encoded}`;

const directoryUrl = 'https://cursor.directory/plugins/skilling';

console.log('Cursor Directory (full plugin — link in README, not MCP badge):\n');
console.log(directoryUrl);
console.log('\nCursor MCP install deeplink (README badge — MCP only):\n');
console.log(url);
console.log('\nConfig JSON:\n');
console.log(JSON.stringify({ mcpServers: { skilling: config } }, null, 2));
