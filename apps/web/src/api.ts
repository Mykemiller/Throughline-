/** Thin client for the server's First Thread routes (all under /api). */
import type { ExchangeRole, SessionStateSnapshot } from '@throughline/shared';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function fetchHumeToken(): Promise<{ accessToken: string; configId: string }> {
  return json(await fetch('/api/hume/token'));
}

export async function createSession(): Promise<{ sessionId: string; snapshot: SessionStateSnapshot }> {
  return json(await fetch('/api/sessions', { method: 'POST' }));
}

export async function setSessionStatus(sessionId: string, status: 'in_progress' | 'complete' | 'abandoned'): Promise<void> {
  await json(
    await fetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    }),
  );
}

/**
 * Persist an uttered exchange. Send ONLY what was actually said. `interrupted`
 * is true when a companion turn was cut off by the subscriber barging in.
 */
export async function appendExchange(args: {
  sessionId: string;
  role: ExchangeRole;
  content: string;
  interrupted?: boolean;
}): Promise<void> {
  await json(
    await fetch('/api/exchanges', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(args),
    }),
  );
}
