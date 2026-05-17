import * as vscode from 'vscode';
import { ActiveSkillManager } from './active-skill.js';
import { readSessionFile, resolveRepoRootForExtension, sessionFilePath } from './session-file.js';
import { SessionWatcher } from './session-watcher.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type LoadPayload = {
  skill_id?: string;
  correlation_id?: string;
  ttl_ms?: number;
};

function effectiveTtlMs(loadTtl: number): number {
  const override = vscode.workspace.getConfiguration('skillpilot').get<number>('ttlMsOverride', 0);
  return override > 0 ? override : loadTtl;
}

function parseLoadPayload(raw: string): LoadPayload {
  const data = JSON.parse(raw) as LoadPayload;
  if (!data.correlation_id || !UUID_RE.test(data.correlation_id)) {
    throw new Error('correlation_id must be a UUID');
  }
  if (!data.skill_id || typeof data.skill_id !== 'string') {
    throw new Error('skill_id is required');
  }
  const ttl = typeof data.ttl_ms === 'number' && data.ttl_ms > 0 ? data.ttl_ms : 300_000;
  return { skill_id: data.skill_id, correlation_id: data.correlation_id, ttl_ms: ttl };
}

export function activate(context: vscode.ExtensionContext): void {
  const manager = new ActiveSkillManager(context, context.extensionPath);
  context.subscriptions.push({ dispose: () => manager.dispose() });

  let sessionWatcher = new SessionWatcher(manager, effectiveTtlMs);
  sessionWatcher.start();
  context.subscriptions.push({
    dispose: () => sessionWatcher.dispose(),
  });

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('skillpilot.autoRegisterSession')) {
        sessionWatcher.dispose();
        sessionWatcher = new SessionWatcher(manager, effectiveTtlMs);
        sessionWatcher.start();
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skillpilot.registerActiveSkill', async () => {
      const correlationId = await vscode.window.showInputBox({
        title: 'SkillPilot correlation_id',
        prompt: 'Paste correlation_id from the load tool response',
        validateInput: (v) => (UUID_RE.test(v.trim()) ? null : 'Must be a UUID'),
      });
      if (!correlationId) return;

      const skillId = await vscode.window.showInputBox({
        title: 'SkillPilot skill_id',
        prompt: 'Paste skill_id from the load response',
      });
      if (!skillId?.trim()) return;

      const ttlInput = await vscode.window.showInputBox({
        title: 'TTL (ms)',
        prompt: 'Leave empty for default 300000 (5 min) or skillpilot.ttlMsOverride',
        value: '300000',
      });
      const ttlMs = ttlInput?.trim() ? Number(ttlInput) : 300_000;
      if (!Number.isFinite(ttlMs) || ttlMs < 1) {
        vscode.window.showErrorMessage('Invalid TTL');
        return;
      }

      manager.register(correlationId.trim(), skillId.trim(), effectiveTtlMs(ttlMs));
      vscode.window.showInformationMessage(`SkillPilot: tracking ${skillId.trim()} until TTL.`);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skillpilot.registerActiveSession', async () => {
      const repoRoot = resolveRepoRootForExtension();
      if (!repoRoot) {
        vscode.window.showErrorMessage('SkillPilot: open a workspace folder first.');
        return;
      }
      const session = readSessionFile(repoRoot);
      if (!session) {
        const looked = sessionFilePath(repoRoot);
        vscode.window.showErrorMessage(
          `SkillPilot: no session at ${looked}. Call MCP begin_task first, or set skillpilot.serverEntry / skillpilot.skillRoot to the SkillPilot repo.`,
        );
        return;
      }
      manager.registerFromSession(session, effectiveTtlMs(session.ttl_ms));
      const label = session.title ?? session.skill_id;
      vscode.window.showInformationMessage(`SkillPilot: tracking ${label} from session file.`);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skillpilot.registerFromClipboard', async () => {
      const text = await vscode.env.clipboard.readText();
      try {
        const payload = parseLoadPayload(text.trim());
        manager.register(
          payload.correlation_id!,
          payload.skill_id!,
          effectiveTtlMs(payload.ttl_ms!),
        );
        vscode.window.showInformationMessage(
          `SkillPilot: tracking ${payload.skill_id} (from clipboard JSON).`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(
          `Clipboard is not a load JSON payload: ${msg}. Copy the full load tool result.`,
        );
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skillpilot.dismissActiveSkill', () => manager.dismiss(true)),
  );
}

export function deactivate(): void {
  // Disposed via subscriptions.
}
