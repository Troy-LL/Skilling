import type { LogLevel, SkillPilotConfig } from './config.js';

type LogFields = Record<string, string | number | boolean | undefined>;

let activeConfig: SkillPilotConfig | null = null;

export function bindObservability(config: SkillPilotConfig): void {
  activeConfig = config;
}

function shouldLog(level: LogLevel): boolean {
  if (!activeConfig) return true;
  const order: LogLevel[] = ['debug', 'info', 'warn', 'error'];
  return order.indexOf(level) >= order.indexOf(activeConfig.logLevel);
}

export function logEvent(
  level: LogLevel,
  tool: string,
  fields: LogFields,
): void {
  if (!shouldLog(level)) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    tool,
    ...fields,
  });
  process.stderr.write(`${line}\n`);
}

export function logToolOk(
  tool: string,
  fields: LogFields & { duration_ms?: number },
): void {
  logEvent('info', tool, { ok: true, ...fields });
}

export function logToolError(
  tool: string,
  code: string,
  fields: LogFields,
): void {
  logEvent('error', tool, { ok: false, code, ...fields });
}

/** When SKILLPILOT_LOG_PROMPTS=true, log a truncated prompt/goal snippet at debug level. */
export function logPromptSnippet(tool: string, text: string): void {
  if (!activeConfig?.logPrompts || !text) return;
  const snippet = text.length > 200 ? `${text.slice(0, 200)}…` : text;
  logEvent('debug', tool, { prompt_snippet: snippet });
}
