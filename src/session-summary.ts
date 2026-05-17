import { createHash } from 'node:crypto';

/** One-line user/agent summary from title and rationale. */
export function buildSessionSummary(title: string, rationale: string): string {
  const short =
    rationale.length > 120 ? `${rationale.slice(0, 117).trimEnd()}…` : rationale;
  return `Using ${title} — ${short}`;
}

/** Stable short fingerprint for the routed prompt (SOT). */
export function promptFingerprint(prompt: string, goal?: string): string {
  const combined = [prompt.trim(), goal?.trim()].filter(Boolean).join('\n');
  return createHash('sha256').update(combined).digest('hex').slice(0, 16);
}
