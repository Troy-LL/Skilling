import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';
import type { SkillPilotConfig } from './config.js';
import { MAX_SELECT_INPUT_CHARS } from './constants.js';
import { SkillPilotError, errorPayload, type SkillPilotErrorCode } from './errors.js';
import { importSkillFromAgents, resolveRepoRoot } from './import-skill.js';
import { logPromptSnippet, logToolError, logToolOk } from './observability.js';
import { PACKAGE_VERSION } from './package-version.js';
import { getSelector } from './selector/index.js';
import {
  beginTask,
  endTask,
  getSession,
  loadSkillEpisode,
  resolveRepoRootFromSkillRoot,
  runCleanup,
  validateSkillIdForLoad,
} from './task-lifecycle.js';
import { formatIndexError, getSkillIndex } from './store.js';
import { requireNonEmptyTrimmed } from './validate.js';

type ToolResult = ReturnType<typeof toolOk>;

function toolError(code: SkillPilotErrorCode, message: string) {
  const payload = errorPayload(code, message);
  return {
    isError: true as const,
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function toolOk(payload: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function handleError(tool: string, e: unknown) {
  if (e instanceof SkillPilotError) {
    logToolError(tool, e.code, { message: e.message });
    return toolError(e.code, e.message);
  }
  const message = e instanceof Error ? e.message : String(e);
  logToolError(tool, 'SELECTOR_ERROR', { message });
  return toolError('SELECTOR_ERROR', message);
}

const selectInputSchema = {
  prompt: z.string().describe('User message or task description to match against skill metadata'),
  goal: z.string().optional().describe('Optional higher-level goal'),
  context: z.string().optional().describe('Optional extra context merged into matching'),
  client: z.string().optional().describe('Optional host hint (e.g. cursor)'),
  workspace_path: z.string().optional().describe('Optional workspace path for keyword context'),
  token_budget: z.number().int().optional().describe('Max token_estimate for selected skill body'),
  top_k: z.number().int().optional().describe('Return up to N ranked candidates (default 1)'),
};

async function runSelect(
  rootDisplay: string,
  config: SkillPilotConfig,
  input: z.infer<z.ZodObject<typeof selectInputSchema>>,
): Promise<ToolResult> {
  const start = Date.now();
  const trimmedPrompt = input.prompt.trim();
  if (!trimmedPrompt && !(input.goal?.trim())) {
    return toolError('VALIDATION_ERROR', 'select requires a non-empty prompt or goal.');
  }
  logPromptSnippet('select', trimmedPrompt || input.goal!.trim());
  if (input.prompt.length > MAX_SELECT_INPUT_CHARS || (input.goal?.length ?? 0) > MAX_SELECT_INPUT_CHARS) {
    return toolError(
      'VALIDATION_ERROR',
      `prompt and goal must each be at most ${MAX_SELECT_INPUT_CHARS} characters.`,
    );
  }
  const index = getSkillIndex(rootDisplay, config.skillsMetaDir);
  if (!index.ok) return toolError('STORE_UNAVAILABLE', formatIndexError(index));
  const selector = getSelector(config);
  const result = selector.select([...index.metas.values()], {
    prompt: trimmedPrompt || input.goal!.trim(),
    goal: input.goal?.trim(),
    context: input.context?.trim(),
    client: input.client?.trim(),
    workspace_path: input.workspace_path?.trim(),
    token_budget: input.token_budget ?? config.defaultTokenBudget,
    top_k: input.top_k,
  });
  logToolOk('skill_select', { skill_id: result.skill_id ?? undefined, duration_ms: Date.now() - start });
  return toolOk(result as unknown as Record<string, unknown>);
}

async function runList(
  rootDisplay: string,
  config: SkillPilotConfig,
  tags?: string[],
): Promise<ToolResult> {
  const index = getSkillIndex(rootDisplay, config.skillsMetaDir);
  if (!index.ok) return toolError('STORE_UNAVAILABLE', formatIndexError(index));
  let skills = index.skills;
  if (tags?.length) {
    const tagSet = new Set(tags.map((t) => t.toLowerCase()));
    skills = skills.filter((s) => s.tags?.some((t) => tagSet.has(t.toLowerCase())));
  }
  logToolOk('skill_list', { count: skills.length });
  return toolOk({ skills });
}

async function runLoad(
  rootDisplay: string,
  config: SkillPilotConfig,
  skill_id: string,
  correlation_id?: string,
  inject_mode?: 'full' | 'summary' | 'compact' | 'sections',
  token_budget?: number,
): Promise<ToolResult> {
  const err = validateSkillIdForLoad(skill_id);
  if (err) return toolError('VALIDATION_ERROR', err);
  try {
    return toolOk(
      loadSkillEpisode(rootDisplay, skill_id, config, correlation_id, {
        inject_mode,
        token_budget,
      }) as unknown as Record<string, unknown>,
    );
  } catch (e) {
    return handleError('skill_inject', e);
  }
}

export function createSkillPilotServer(skillRoot: string, config: SkillPilotConfig): McpServer {
  const rootDisplay = path.resolve(skillRoot);
  const repoRoot = resolveRepoRootFromSkillRoot(rootDisplay);

  const mcp = new McpServer({
    name: 'skillpilot',
    version: PACKAGE_VERSION,
    title: 'SkillPilot',
  });

  const listHandler = async (input?: { tags?: string[] }) =>
    runList(rootDisplay, config, input?.tags);

  mcp.registerTool(
    'list',
    {
      description:
        'List valid skills under SKILL_ROOT (Tier 0+1: id, title, summary, tags). Fails if store invalid.',
      inputSchema: {
        tags: z
          .array(z.string())
          .optional()
          .describe('Optional tag filter — skills with any matching tag'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    listHandler,
  );

  mcp.registerTool(
    'skill_list',
    {
      description: 'Alias for list — enumerate skills (summaries only, no bodies).',
      inputSchema: {
        tags: z.array(z.string()).optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    listHandler,
  );

  const selectHandler = async (input: z.infer<z.ZodObject<typeof selectInputSchema>>) => {
    try {
      return await runSelect(rootDisplay, config, input);
    } catch (e) {
      return handleError('skill_select', e);
    }
  };

  mcp.registerTool(
    'select',
    {
      description:
        'Heuristically pick the best skill_id (Tier 1 only). Prefer begin_task for full lifecycle.',
      inputSchema: selectInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    selectHandler,
  );

  mcp.registerTool(
    'skill_select',
    {
      description: 'Alias for select — match prompt to skill using summaries only.',
      inputSchema: selectInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    selectHandler,
  );

  mcp.registerTool(
    'skill_plan',
    {
      description:
        'Plan which skills are needed for a goal (Tier 1 only). Does not inject bodies. Use before begin_task on complex work.',
      inputSchema: {
        goal: z.string().describe('High-level task or goal'),
        context: z.string().optional(),
        max_skills: z.number().int().optional().describe('Max skills in plan (default 5)'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ goal, context, max_skills }) => {
      try {
        const trimmedGoal = requireNonEmptyTrimmed(goal, 'skill_plan goal');
        const index = getSkillIndex(rootDisplay, config.skillsMetaDir);
        if (!index.ok) return toolError('STORE_UNAVAILABLE', formatIndexError(index));
        logPromptSnippet('skill_plan', trimmedGoal);
        const selector = getSelector(config);
        const plan = selector.plan([...index.metas.values()], {
          goal: trimmedGoal,
          context: context?.trim(),
          max_skills: max_skills ?? 5,
        });
        logToolOk('skill_plan', { steps: plan.plan.length });
        return toolOk(plan as unknown as Record<string, unknown>);
      } catch (e) {
        return handleError('skill_plan', e);
      }
    },
  );

  const injectModeSchema = z.enum(['full', 'summary', 'compact', 'sections']);

  const loadHandler = async ({
    skill_id,
    correlation_id,
    inject_mode,
    token_budget,
  }: {
    skill_id: string;
    correlation_id?: string;
    inject_mode?: z.infer<typeof injectModeSchema>;
    token_budget?: number;
  }) => runLoad(rootDisplay, config, skill_id, correlation_id, inject_mode, token_budget);

  mcp.registerTool(
    'load',
    {
      description:
        'Load shaped injectable skill body. Returns token_estimate, ttl_hint, merge_hint.',
      inputSchema: {
        skill_id: z.string(),
        correlation_id: z.string().optional(),
        inject_mode: injectModeSchema
          .optional()
          .describe('full | summary (~Tier1) | compact (no code blocks) | sections (headings only)'),
        token_budget: z
          .number()
          .int()
          .optional()
          .describe('Hints inject depth when inject_mode omitted (<350→summary, <900→compact)'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    loadHandler,
  );

  mcp.registerTool(
    'skill_inject',
    {
      description: 'Alias for load — inject skill body for current task.',
      inputSchema: {
        skill_id: z.string(),
        correlation_id: z.string().optional(),
        inject_mode: injectModeSchema.optional(),
        token_budget: z.number().int().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    loadHandler,
  );

  const cleanupHandler = async ({ correlation_id }: { correlation_id: string }) => {
    logToolOk('skill_cleanup', { correlation_id });
    return toolOk(runCleanup(correlation_id) as unknown as Record<string, unknown>);
  };

  mcp.registerTool(
    'cleanup',
    {
      description: 'Idempotent cleanup for a correlation_id.',
      inputSchema: {
        correlation_id: z.string().describe('UUID from load or begin_task'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    cleanupHandler,
  );

  mcp.registerTool(
    'skill_cleanup',
    {
      description: 'Alias for cleanup.',
      inputSchema: {
        correlation_id: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    cleanupHandler,
  );

  mcp.registerTool(
    'health',
    {
      description: 'Read-only health check: skill root readable and index builds.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const index = getSkillIndex(rootDisplay, config.skillsMetaDir);
      if (!index.ok) return toolError('STORE_UNAVAILABLE', formatIndexError(index));
      return toolOk({
        ok: true,
        skill_count: index.skills.length,
        skills_root: rootDisplay,
        skills_meta_dir: config.skillsMetaDir,
      });
    },
  );

  mcp.registerTool(
    'get_session',
    {
      description:
        'Read active task session from .skillpilot/session.json. Expired TTL returns { active: false, expired: true } and clears session + active-body.md. include_body returns active-body.md when present, else reshapes using session inject_mode (read-only, no new correlation_id).',
      inputSchema: {
        include_summary: z.boolean().optional(),
        include_body: z.boolean().optional(),
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
        getSession(rootDisplay, repoRoot, config, {
          include_summary: input.include_summary,
          include_body: input.include_body,
        }) as unknown as Record<string, unknown>,
      );
    },
  );

  mcp.registerTool(
    'begin_task',
    {
      description:
        'Preferred task start: select + shaped load + session file. SKILL_ROOT defaults to .agents/skills.',
      inputSchema: {
        prompt: z.string(),
        goal: z.string().optional(),
        context: z.string().optional(),
        client: z.string().optional(),
        workspace_path: z.string().optional(),
        skill_id: z.string().optional(),
        phase: z.string().optional(),
        token_budget: z.number().int().optional(),
        inject_mode: injectModeSchema.optional(),
        end_previous: z.boolean().optional(),
        response_detail: z.enum(['summary', 'full']).optional(),
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
        logPromptSnippet('begin_task', input.prompt.trim() || input.goal?.trim() || '');
        return toolOk(
          beginTask(rootDisplay, repoRoot, config, input) as unknown as Record<string, unknown>,
        );
      } catch (e) {
        return handleError('begin_task', e);
      }
    },
  );

  mcp.registerTool(
    'end_task',
    {
      description: 'Preferred task end: cleanup + clear session.',
      inputSchema: {
        correlation_id: z.string().uuid().optional(),
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
        return toolOk(endTask(repoRoot, correlation_id) as unknown as Record<string, unknown>);
      } catch (e) {
        return handleError('end_task', e);
      }
    },
  );

  mcp.registerTool(
    'ingest',
    {
      description:
        'Import from .agents/skills/<folder> into SKILL_ROOT (optional; canonical store is .agents/skills).',
      inputSchema: {
        agents_folder: z.string(),
        skill_id: z.string().optional(),
        repo_root: z.string().optional(),
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
        return handleError('ingest', e);
      }
    },
  );

  return mcp;
}

export async function runMcpServer(skillRoot: string, config: SkillPilotConfig): Promise<void> {
  const server = createSkillPilotServer(skillRoot, config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
