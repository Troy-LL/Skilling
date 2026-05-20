#!/usr/bin/env node
/**
 * Print a Cursor MCP install deeplink for the published npx config.
 * Usage: node scripts/generate-mcp-deeplink.mjs
 */
const config = {
  command: 'npx',
  args: ['-y', 'skillpilot-mcp@latest'],
  env: {
    SKILL_ROOT: '${workspaceFolder}/.agents/skills',
  },
};

const encoded = Buffer.from(JSON.stringify(config), 'utf8').toString('base64');
const url = `cursor://anysphere.cursor-deeplink/mcp/install?name=skillpilot&config=${encoded}`;

console.log('Cursor MCP install deeplink (npx skillpilot-mcp):\n');
console.log(url);
console.log('\nConfig JSON:\n');
console.log(JSON.stringify({ mcpServers: { skillpilot: config } }, null, 2));
