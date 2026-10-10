import { writeFileSync, mkdirSync } from 'node:fs';
import { request, type FullConfig } from '@playwright/test';

/** Demo logins from the seed (README "Demo logins"). One login each per run: the API allows 30 per 15 minutes. */
export const ACCOUNTS = { member: ['member@skyline.edu', 'Member@123'], admin: ['admin@skyline.edu', 'Admin@123'] } as const;
export const TOKENS_FILE = 'tests/.tokens.json';

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  const api = await request.newContext({ baseURL });
  const tokens: Record<string, string> = {};
  for (const [who, [email, password]] of Object.entries(ACCOUNTS)) {
    const r = await api.post('/api/auth/login', { data: { email, password } });
    if (!r.ok()) throw new Error(`Login failed for ${email} (${r.status()}): is the demo seed loaded at ${baseURL}?`);
    tokens[who] = (await r.json()).token;
  }
  // An upcoming, published event for /events/:id.
  const events: { id: number; status: string; starts_at: string }[] = await (await api.get('/api/events')).json();
  const ev = events.find((e) => e.status === 'published' && +new Date(e.starts_at) > Date.now()) ?? events[0];
  mkdirSync('tests/screenshots', { recursive: true });
  writeFileSync(TOKENS_FILE, JSON.stringify({ ...tokens, eventId: ev.id }));
  await api.dispose();
}
