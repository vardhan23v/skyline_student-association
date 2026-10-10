import type { Knex } from 'knex';
import { env } from '../../config/env';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { randomToken } from '../../lib/hash';
import { hasRole, type AuthUser, type Role } from '../../middleware/auth';
import { buildTools, type Tool } from './tools';

/**
 * AI Secretary (§10): no text-to-SQL. Tools are filtered by role and executed server-side with the caller's identity.
 * Without an LLM key we run a deterministic keyword router over the same tools so the feature is demoable offline.
 */
export async function ask(db: Knex, user: AuthUser, prompt: string) {
  const tools = buildTools(db, user).filter((t) => hasRole(user, ...t.roles));
  const toolCalls: { name: string; args: any; result: any }[] = [];
  let answer: string;
  let proposal: { id: string; action: string; payload: any; required_role: Role } | null = null;

  const run = async (t: Tool, args: any) => { const result = await t.run(args); toolCalls.push({ name: t.name, args, result }); return result; };

  if (env.LLM_API_KEY) {
    answer = await askClaude(prompt, tools, run);
  } else {
    answer = await keywordRouter(prompt, tools, run);
  }

  const proposalCall = toolCalls.find((c) => c.result?.__proposal);
  if (proposalCall) {
    const p = proposalCall.result.__proposal;
    const token = randomToken(24);
    await db('ai_proposals').insert({ token, user_id: user.id, required_role: p.required_role, action: p.action, payload: JSON.stringify(p.payload) });
    proposal = { id: token, ...p };
  }
  const numbersOk = verifyNumbers(answer, toolCalls);
  await db('ai_audit').insert({ user_id: user.id, prompt, tool_calls: JSON.stringify(toolCalls.map(({ name, args }) => ({ name, args }))), response: answer, proposal_id: proposal?.id ?? null });
  return { answer, tool_calls: toolCalls.map(({ name, args }) => ({ name, args })), proposal, numbers_verified: numbersOk };
}

/** Guardrail: every number in the reply must appear in some tool output. */
function verifyNumbers(answer: string, calls: { result: any }[]) {
  const nums = answer.match(/\d+(?:\.\d+)?/g) ?? [];
  const haystack = JSON.stringify(calls.map((c) => c.result));
  return nums.every((n) => haystack.includes(n) || haystack.includes(String(Number(n))));
}

async function keywordRouter(prompt: string, tools: Tool[], run: (t: Tool, a: any) => Promise<any>) {
  const p = prompt.toLowerCase();
  const pick = (n: string) => tools.find((t) => t.name === n);
  const days = Number(/(\d+)\s*day/.exec(p)?.[1] ?? 14);
  if (/balance|finance|money|income|spent|summary/.test(p) && pick('getFinanceSummary')) {
    const r = await run(pick('getFinanceSummary')!, { period: 'all' });
    return `Current balance is ₹${r.balance} (in ₹${r.total_in}, out ₹${r.total_out}).`;
  }
  if (/flag|suspicious|anomal/.test(p) && pick('getFlaggedExpenses')) {
    const r = await run(pick('getFlaggedExpenses')!, {});
    return r.length ? `${r.length} flagged expenses: ` + r.map((x: any) => `#${x.id} ₹${x.amount} (${x.flags.map((f: any) => f.code).join(', ')})`).join('; ') : 'No flagged expenses.';
  }
  if (/expir|renew/.test(p) && pick('getExpiringMembers')) {
    const r = await run(pick('getExpiringMembers')!, { days });
    return `${r.length} memberships expire within ${days} days.` + (r.length ? ' ' + r.map((m: any) => `${m.name} (${m.expiry_date})`).join(', ') : '');
  }
  if (/overdue|task/.test(p) && pick('getOverdueTasks')) {
    const r = await run(pick('getOverdueTasks')!, {});
    return r.length ? `${r.length} overdue tasks: ` + r.map((t: any) => `"${t.title}" due ${t.due_on}`).join('; ') : 'No overdue tasks.';
  }
  const ev = /event\s*#?(\d+)|report.*?(\d+)/.exec(p);
  if (ev && pick('getEventReport')) {
    const r = await run(pick('getEventReport')!, { eventId: Number(ev[1] ?? ev[2]) });
    return `${r.event.title}: ${r.sold} sold, ${r.checked_in} checked in, ${r.no_show} no-shows, revenue ₹${r.revenue}.`;
  }
  if (/announce|draft/.test(p) && pick('draftAnnouncement')) {
    await run(pick('draftAnnouncement')!, { topic: prompt });
    return 'I drafted an announcement. Review the proposal and confirm to publish it.';
  }
  return `I can help with: finance summary, flagged expenses, expiring memberships, overdue tasks, event reports, and drafting announcements. Available to your role: ${tools.map((t) => t.name).join(', ')}.`;
}

async function askClaude(prompt: string, tools: Tool[], run: (t: Tool, a: any) => Promise<any>): Promise<string> {
  const messages: any[] = [{ role: 'user', content: prompt }];
  const system = 'You are the SSA club secretary. Answer ONLY from tool results. Every number you state must come from a tool result. Be brief.';
  for (let i = 0; i < 5; i++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.LLM_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 800, system, messages, tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })) }),
    });
    if (!res.ok) throw new Error(`LLM error ${res.status}`);
    const data = (await res.json()) as any;
    messages.push({ role: 'assistant', content: data.content });
    const uses = data.content.filter((c: any) => c.type === 'tool_use');
    if (data.stop_reason !== 'tool_use' || uses.length === 0) return data.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
    const results = [];
    for (const u of uses) {
      const t = tools.find((x) => x.name === u.name);
      const out = t ? await run(t, u.input) : { error: 'tool not available for your role' };
      results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out) });
    }
    messages.push({ role: 'user', content: results });
  }
  return 'I could not complete that request.';
}

export async function confirmProposal(db: Knex, user: AuthUser, token: string) {
  const p = await db('ai_proposals').where({ token }).first();
  if (!p) throw notFound('Proposal not found');
  if (p.executed_at) throw badRequest('Proposal already executed');
  if (!hasRole(user, p.required_role)) throw forbidden(`Requires role ${p.required_role}`);
  const payload = typeof p.payload === 'string' ? JSON.parse(p.payload) : p.payload;
  const tools = buildTools(db, user);
  const t = tools.find((x) => x.name === p.action);
  if (!t?.execute) throw badRequest('Unknown action');
  const result = await t.execute(payload);
  await db('ai_proposals').where({ id: p.id }).update({ executed_at: new Date() });
  await db('ai_audit').where({ proposal_id: token }).update({ confirmed_at: new Date() });
  return { ok: true, result };
}
