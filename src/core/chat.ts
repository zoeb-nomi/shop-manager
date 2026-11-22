// Free chat after onboarding: typed text or a voice note that is not a button or a command goes to Claude
// Haiku with the shop profile and the last 10 messages. It answers in the owner's language in 1-2 sentences.
// Code decides which buttons exist; the model may pick one of them or none.
import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { User } from './db.ts';
import { shortTitle } from './products.ts';
import type { Button, Reply } from './types.ts';

const Schema = z.object({ reply: z.string(), button: z.string().nullable() });
export type ChatModel = (req: { model: string; system: string; user: string }) => Promise<unknown>;

const PROMPT_PATH = process.env.CHAT_PROMPT_PATH ?? 'prompts/chat_reply.md';

// The buttons that make sense right now, decided by code.
export function availableButtons(u: User): Button[] {
  const out: Button[] = [];
  if (u.profile.product) out.push({ id: 'do_it_for_me', label: 'Let me get it done for you' });
  if (u.flow?.pack?.feedPoster && !u.flow.pack.instagram?.postId && !u.flow.pack.instagram?.url) out.push({ id: 'post_instagram', label: 'Post to Instagram' });
  return out;
}

export function buildChatRequest(u: User, message: string) {
  const md = readFileSync(PROMPT_PATH, 'utf8');
  const model = md.match(/^#.*\((claude-[a-z0-9-]+)\)/m)?.[1] ?? 'claude-haiku-5-5';
  const system = md.split(/^System:\s*$/m)[1]?.split(/^User:\s*$/m)[0]?.trim() ?? '';
  const p = u.profile;
  const shop = JSON.stringify({ name: p.shopName ?? null, sells: p.sells ?? null, city: p.city ?? null, sells_on: p.answers?.q2 ?? [], ads_before: p.answers?.q3 ?? null, hardest: p.answers?.q4 ?? null });
  const state = JSON.stringify({
    piece: p.product ? shortTitle(p.product.title) : null,
    price_rs: p.product?.price ?? null,
    has_plan: Boolean(u.flow?.plan),
    posts_made: Boolean(u.flow?.pack),
    posted_on_instagram: Boolean(u.flow?.pack?.instagram?.postId || u.flow?.pack?.instagram?.url),
  });
  const history = (u.history ?? []).slice(-10).map((h) => `${h.role}: ${h.text}`).join('\n') || '(none)';
  const user = (md.split(/^User:\s*$/m)[1]?.trim() ?? '')
    .replace('{{shop}}', shop)
    .replace('{{state}}', state)
    .replace('{{buttons}}', availableButtons(u).map((b) => `${b.id} (${b.label})`).join(', ') || 'none')
    .replace('{{history}}', history)
    .replace('{{message}}', message.replace(/\s+/g, ' ').slice(0, 1000));
  return { model, system, user };
}

let client: Anthropic | undefined;
const callHaiku: ChatModel = async (req) => {
  client ??= new Anthropic({ timeout: 15_000, maxRetries: 1 });
  const res = await client.messages.parse({
    model: req.model,
    max_tokens: 1500,
    output_config: { format: zodOutputFormat(Schema) },
    system: req.system,
    messages: [{ role: 'user', content: req.user }],
  });
  return res.stop_reason === 'refusal' ? undefined : res.parsed_output;
};

let override: ChatModel | undefined;
export function useChatModel(fn: ChatModel | undefined): void {
  override = fn;
}
export function chatOn(): boolean {
  return Boolean(override) || (process.env.COACH_LLM !== 'off' && Boolean(process.env.ANTHROPIC_API_KEY));
}

// Returns undefined when the model is off or fails, so the caller falls back to the usual prompt.
export async function chatReply(u: User, message: string): Promise<Reply[] | undefined> {
  try {
    const parsed = Schema.safeParse(await (override ?? callHaiku)(buildChatRequest(u, message)));
    if (!parsed.success || !parsed.data.reply.trim()) return undefined;
    // Two sentences at most, whatever the model wrote.
    const text = parsed.data.reply.trim().split(/(?<=[.?!।])\s+/).slice(0, 2).join(' ').slice(0, 400);
    const button = availableButtons(u).find((b) => b.id === parsed.data.button);
    return [button ? { kind: 'buttons', text, buttons: [button] } : { kind: 'text', text }];
  } catch (err) {
    console.error('[chat] failed; using the usual prompt:', (err as Error).message);
    return undefined;
  }
}
