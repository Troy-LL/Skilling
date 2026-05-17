import fs from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';
import type { ActiveSkillManager } from './active-skill.js';
import {
  isSessionFileActive,
  readSessionFile,
  resolveRepoRootForExtension,
  sessionFilePath,
} from './session-file.js';

export class SessionWatcher implements vscode.Disposable {
  private watcher: fs.FSWatcher | undefined;
  private debounce: NodeJS.Timeout | undefined;
  private repoRoot: string | undefined;

  constructor(
    private readonly manager: ActiveSkillManager,
    private readonly effectiveTtlMs: (sessionTtl: number) => number,
  ) {}

  start(): void {
    this.repoRoot = resolveRepoRootForExtension();
    if (!this.repoRoot) return;

    const config = vscode.workspace.getConfiguration('skillpilot');
    if (!config.get<boolean>('autoRegisterSession', true)) return;

    const file = sessionFilePath(this.repoRoot);
    const dir = path.dirname(file);
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      /* ignore */
    }

    this.syncFromDisk();
    try {
      this.watcher = fs.watch(dir, (_event, name) => {
        if (name && name !== 'session.json') return;
        this.scheduleSync();
      });
    } catch {
      /* watch unavailable */
    }
  }

  dispose(): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.watcher?.close();
  }

  private scheduleSync(): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.syncFromDisk(), 300);
  }

  private syncFromDisk(): void {
    const root = this.repoRoot ?? resolveRepoRootForExtension();
    if (!root) return;
    const session = readSessionFile(root);
    if (!session || !isSessionFileActive(session)) return;

    const config = vscode.workspace.getConfiguration('skillpilot');
    if (!config.get<boolean>('autoRegisterSession', true)) return;

    this.manager.registerFromSession(session, this.effectiveTtlMs(session.ttl_ms));
  }
}
