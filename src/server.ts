import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';
import { MAX_SELECT_INPUT_CHARS } from './constants.js';
import { importSkillFromAgents, resolveRepoRoot } from './import-skill.js';
import { selectSkill } from './select.js';
import {
  beginTask,
  endTask,
  getSession,
  loadSkillEpisode,
  resolveRepoRootFromSkillRoot,
  runCleanup,
  validateSkillIdForLoad,
} from './task-lifecycle.js';
import { buildIndex, formatIndexError } from './store.js';

function toolError(text: string) {
  return { isError: true as const, content: [{ type: 'text' as const, text }] };
}

function toolOk(payload: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

export function createSkillPilotServer(skillRoot: string): McpServer {
  const rootDisplay = path.resolve(skillRoot);
  const repoRoot = resolveRepoRootFromSkillRoot(rootDisplay);

  const mcp = new McpServer({
    name: 'skillpilot',
    version: '1.3.0',
    title: 'SkillPilot',
  });

  mcp.registerTool(
    'list',
    {
      description:
        'List valid skills under SKILL_ROOT: id, title, summary, optional tags and version. Errors if the store has invalid or duplicate skills.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const index = buildIndex(rootDisplay);
      if (!index.ok) return toolError(formatIndexError(index));
      return toolOk({ skills: index.skills });
    },
  );

  mcp.registerTool(
    'get_session',
    {
      description:
        'Read the active SkillPilot task session from .skillpilot/session.json. Use before begin_task to avoid duplicate episodes.',
      inputSchema: {
        include_summary: z
          .boolean()
          .optional()
          .describe('When active, include title/summary/rationale (default true)'),
        include_body: z
          .boolean()
          .optional()
          .describe('When active, include full skill body (default false)'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      return toolOk(
        getSession(rootDisplay, repoRoot, {
          include_summary: input.include_summary,
          include_body: input.include_body,
        }),
      );
    },
  );

  mcp.registerTool(
    'begin_task',
    {
      description:
        'Preferred task start: select (unless skill_id given) + load skill body + write session file. Returns body, correlation_id, ttl_ms. Call end_task when done. Do not read skills/ directly.',
      inputSchema: {
        prompt: z.string().describe('User message or task description'),
        goal: z.string().optional(),
        client: z.string().optional(),
        workspace_path: z.string().optional(),
        skill_id: z.string().optional().describe('Skip select when skill_id is known'),
        phase: z
          .string()
          .optional()
          .describe('Dev stage hint: plan, implement, review, ci'),
        end_previous: z
          .boolean()
          .optional()
          .describe('If true (default), cleanup prior session before starting'),
        response_detail: z
          .enum(['summary', 'full'])
          .optional()
          .describe('summary (default) omits alternatives; full returns debug fields'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        return toolOk(
          beginTask(rootDisplay, repoRoot, {
            prompt: input.prompt,
            goal: input.goal,
            client: input.client,
            workspace_path: input.workspace_path,
            skill_id: input.skill_id,
            phase: input.phase,
            end_previous: input.end_previous,
            response_detail: input.response_detail,
          }),
        );
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    },
  );

  mcp.registerTool(
    'end_task',
    {
      description:
        'Preferred task end: idempotent cleanup for active session (or pass correlation_id). Clears .skillpilot/session.json.',
      inputSchema: {
        correlation_id: z
          .string()
          .uuid()
          .optional()
          .describe('Defaults to session file correlation_id'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ correlation_id }) => {
      try {
        return toolOk(endTask(repoRoot, correlation_id));
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    },
  );

  mcp.registerTool(
    'select',
    {
      description:
        'Heuristically pick the best skill_id for a user prompt/goal. Prefer begin_task for full lifecycle. No LLM.',
      inputSchema: {
        prompt: z.string().describe('User message or task description to match against skill metadata'),
        goal: z.string().optional().describe('Optional higher-level goal (merged with prompt for matching)'),
        client: z
          .string()
          .optional()
          .describe('Optional host hint (e.g. cursor, vscode); soft boost only in v1'),
        workspace_path: z
          .string()
          .optional()
          .describe('Optional workspace path; tokenized for extra keyword context'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ prompt, goal, client, workspace_path }) => {
      const trimmedPrompt = prompt.trim();
      if (!trimmedPrompt && !(goal?.trim())) {
        return toolError('select requires a non-empty prompt or goal.');
      }
      if (prompt.length > MAX_SELECT_INPUT_CHARS || (goal?.length ?? 0) > MAX_SELECT_INPUT_CHARS) {
        return toolError(`prompt and goal must each be at most ${MAX_SELECT_INPUT_CHARS} characters.`);
      }
      const index = buildIndex(rootDisplay);
      if (!index.ok) return toolError(formatIndexError(index));
      const result = selectSkill([...index.metas.values()], {
        prompt: trimmedPrompt || goal!.trim(),
        goal: goal?.trim(),
        client: client?.trim() || undefined,
        workspace_path: workspace_path?.trim() || undefined,
      });
      return toolOk(result);
    },
  );

  mcp.registerTool(
    'ingest',
    {
      description:
        'Import a skill from this repo’s .agents/skills/<folder> into SKILL_ROOT (project-local catalog). Use after `npx skills add` without -g.',
      inputSchema: {
        agents_folder: z
          .string()
          .describe('Folder name under .agents/skills (e.g. find-skills)'),
        skill_id: z.string().optional().describe('Optional override for canonical id'),
        repo_root: z
          .string()
          .optional()
          .describe('Repo root containing .agents/skills; default: parent of SKILL_ROOT'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ agents_folder, skill_id, repo_root }) => {
      try {
        const repo = resolveRepoRoot(rootDisplay, repo_root);
        const result = importSkillFromAgents(repo, agents_folder, rootDisplay, {
          id: skill_id,
        });
        return toolOk({
          skill_id: result.skill_id,
          dest_path: result.dest_path,
          warnings: result.warnings,
        });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    },
  );

  mcp.registerTool(
    'load',
    {
      description:
        'Load injectable skill body by skill_id. Prefer begin_task at task start. Returns body, correlation_id, ttl_ms.',
      inputSchema: {
        skill_id: z.string().describe('Canonical skill id (skill-rules §2); call list for available ids'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ skill_id }) => {
      const err = validateSkillIdForLoad(skill_id);
      if (err) return toolError(err);
      try {
        return toolOk(loadSkillEpisode(rootDisplay, skill_id));
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    },
  );

  mcp.registerTool(
    'cleanup',
    {
      description:
        'Idempotent cleanup for a correlation_id. Prefer end_task for session-aware cleanup.',
      inputSchema: {
        correlation_id: z.string().uuid().describe('UUID from load or begin_task'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ correlation_id }) => {
      return toolOk(runCleanup(correlation_id));
    },
  );

  return mcp;
}

export async function runMcpServer(skillRoot: string): Promise<void> {
  const server = createSkillPilotServer(skillRoot);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
