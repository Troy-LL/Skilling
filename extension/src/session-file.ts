import fs from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';

export type SessionFilePayload = {
  version?: number;
  skill_id: string;
  correlation_id: string;
  ttl_ms: number;
  started_at: string;
  phase?: string;
  title?: string;
  summary?: string;
  rationale?: string;
  confidence?: number;
  warnings?: string[];
};

export function sessionFilePath(repoRoot: string): string {
  return path.join(path.resolve(repoRoot), '.skillpilot', 'session.json');
}

export function readSessionFile(repoRoot: string): SessionFilePayload | null {
  const file = sessionFilePath(repoRoot);
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as SessionFilePayload;
    if (!data.skill_id || !data.correlation_id) return null;
    return data;
  } catch {
    return null;
  }
}

export function isSessionFileActive(session: SessionFilePayload): boolean {
  const started = Date.parse(session.started_at);
  if (Number.isNaN(started)) return false;
  const ttl = session.ttl_ms > 0 ? session.ttl_ms : 300_000;
  return started + ttl > Date.now();
}

/** Align with MCP: repo root = parent of skills/, or dirname(serverEntry). */
export function resolveRepoRootForExtension(): string | undefined {
  const config = vscode.workspace.getConfiguration('skillpilot');
  const serverEntry = config.get<string>('serverEntry', '').trim();
  if (serverEntry) {
    const entryDir = path.dirname(path.resolve(serverEntry));
    if (path.basename(entryDir) === 'dist') {
      return path.dirname(entryDir);
    }
    return entryDir;
  }

  const skillRoot = config.get<string>('skillRoot', '').trim();
  if (skillRoot) {
    const root = path.resolve(skillRoot);
    return path.basename(root) === 'skills' ? path.dirname(root) : root;
  }

  const folders = vscode.workspace.workspaceFolders ?? [];
  for (const folder of folders) {
    const ws = folder.uri.fsPath;
    if (fs.existsSync(sessionFilePath(ws))) return ws;
    if (path.basename(ws) === 'skills' && fs.existsSync(sessionFilePath(path.dirname(ws)))) {
      return path.dirname(ws);
    }
    const parent = path.dirname(ws);
    if (fs.existsSync(sessionFilePath(parent))) return parent;
  }

  return folders[0]?.uri.fsPath;
}
