import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';
import type { SkillingConfig } from './config.js';
import { MAX_SELECT_INPUT_CHARS } from './constants.js';
import { SkillingError, errorPayload, type SkillingErrorCode } from './errors.js';
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

const LOW_LEVEL_TOOL_NOTE = ' Low-level tool — use for debugging or custom flows, not routine work.';

const SERVER_INSTRUCTIONS = `Skilling is an MCP skill router for AI coding agents. It selects procedural skills from .agents/skills/, shapes their body to a token budget, and manages task sessions with TTL and cleanup.

Normal workflow: skill_plan (optional for multi-step goals) → begin_task → follow the returned body → end_task when the stage completes or topic changes.

Session source of truth: .skilling/session.json (active skill, summary, TTL) and .skilling/active-body.md (ephemeral bridge). Call get_session before begin_task to check if a session is already active.

Do NOT: invent skill_id values; use list/select/load for routine work (debugging only); use find-skills except when the user wants to discover or install ecosystem skills.

On errors: read the message. VALIDATION_ERROR usually means pass an explicit skill_id or call list for valid IDs. STORE_UNAVAILABLE means call health or run npx skilling setup --force.

Fetch the skilling_workflow prompt for the full lifecycle procedure.`;

const SKILLING_WORKFLOW_PROMPT = `# Skilling task lifecycle

## Procedure

1. For multi-step goals, call **skill_plan** with the goal; review \`skills_needed\`, \`confidence\`, and \`estimated_tokens\`.
2. **Low-confidence routing:** if \`skill_plan\` returns \`confidence < 0.35\` or \`skills_needed\` is empty, **do not** call **begin_task** with a guessed skill — proceed with native coding or call **find-skills** to discover a better match.
3. If **\`.skilling/active-body.md\`** exists (hook auto-routed), follow it for this turn; otherwise call **get_session** — if \`active: false\`, call **begin_task** with the user goal and optional \`phase\` (\`response_detail\` defaults to summary). Pass **token_budget** when context is tight.
4. Obey skill **body** (from tool result or bridge file) until the stage is done.
5. **end_task** before switching topic or phase; start a new **begin_task** for the next stage.

## User-facing presentation

- After routing: reply with **one sentence** using \`summary\` from the tool or session.
- **Never** show \`alternatives\`, skill menus, \`list\` output, or raw score tables to the user.
- Do not ask the user to pick a \`skill_id\`.

## End or switch tasks

- Before an unrelated topic or new dev stage: **end_task** (uses \`.skilling/session.json\` when \`correlation_id\` is omitted).
- Do not read \`.agents/skills/\` paths directly when MCP tools are available (except **\`.skilling/active-body.md\`** bridge).

## Do not

- Call **list** / **select** / **load** in normal work (debugging only).
- Skip **end_task** when moving to unrelated work.
- Use routing when the user only wants to **find or install** external skills — use **find-skills**.`;

function toolError(code: SkillingErrorCode, message: string) {
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
  if (e instanceof SkillingError) {
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
  config: SkillingConfig,
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
  config: SkillingConfig,
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
  config: SkillingConfig,
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

export function createSkillingServer(skillRoot: string, config: SkillingConfig): McpServer {
  const rootDisplay = path.resolve(skillRoot);
  const repoRoot = resolveRepoRootFromSkillRoot(rootDisplay);

  const mcp = new McpServer(
    {
      name: 'skilling',
      version: PACKAGE_VERSION,
      title: 'Skilling',
    },
    {
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  const listHandler = async (input?: { tags?: string[] }) =>
    runList(rootDisplay, config, input?.tags);

  mcp.registerTool(
    'list',
    {
      description:
        'List valid skills under SKILL_ROOT (Tier 0+1: id, title, summary, tags). Fails if store invalid.' +
        LOW_LEVEL_TOOL_NOTE,
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
      description:
        'Alias for list — enumerate skills (summaries only, no bodies).' + LOW_LEVEL_TOOL_NOTE,
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
        'Heuristically pick the best skill_id (Tier 1 only). Prefer begin_task for full lifecycle.' +
        LOW_LEVEL_TOOL_NOTE,
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
      description:
        'Alias for select — match prompt to skill using summaries only.' + LOW_LEVEL_TOOL_NOTE,
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
        'Call before begin_task on multi-step goals to discover which skills are needed and in what order. Returns plan steps, skills_needed (with confidence), estimated_tokens. If confidence < 0.35 or skills_needed is empty, proceed without skill injection or use find-skills to grow the catalog.',
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
        'Load shaped injectable skill body. Returns token_estimate, ttl_hint, merge_hint.' +
        LOW_LEVEL_TOOL_NOTE,
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
      description:
        'Alias for load — inject skill body for current task.' + LOW_LEVEL_TOOL_NOTE,
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
      description:
        'Idempotent cleanup for a correlation_id.' + LOW_LEVEL_TOOL_NOTE,
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
      description: 'Alias for cleanup.' + LOW_LEVEL_TOOL_NOTE,
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
      description:
        'Verify the skill store is reachable before starting work. Returns ok, skill_count, skills_root. Call this if STORE_UNAVAILABLE errors appear — the root path may need fixing with npx skilling setup --force.',
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
        'Check whether a task session is currently active before deciding to call begin_task. Returns active, skill_id, summary, inject_mode. Expired TTL returns active:false and auto-clears. Use include_body to re-read shaped skill content without opening a new correlation.',
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
        'Start of every focused dev task. Selects the best skill, injects a shaped body within token_budget, and opens a session. Returns skill_id, body (follow it), token_estimate, correlation_id. Call end_task when the stage is done or topic changes. On VALIDATION_ERROR: call list for valid skill_ids or pass skill_id explicitly.',
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
      description:
        'Call after every stage completes or before switching to an unrelated topic. Cleans up the correlation registry and clears .skilling/session.json + active-body.md. Idempotent — safe to call twice. Do NOT skip this.',
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

  mcp.registerPrompt(
    'skilling_workflow',
    {
      title: 'Skilling lifecycle workflow',
      description:
        'Full Skilling MCP lifecycle procedure — plan, begin_task, follow body, end_task. Fetch when you need the complete workflow guide.',
    },
    async () => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: SKILLING_WORKFLOW_PROMPT,
          },
        },
      ],
    }),
  );

  return mcp;
}

export async function runMcpServer(skillRoot: string, config: SkillingConfig): Promise<void> {
  const server = createSkillingServer(skillRoot, config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
