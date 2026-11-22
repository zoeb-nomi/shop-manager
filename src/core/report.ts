// Report back (SPEC Flow 7): code counts the clicks per channel and picks what worked best; the model
// (prompts/report_back.md) only writes the one advice sentence. Same message for /report and the automatic one.
import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { User } from './db.ts';
import { countClicksForUser, type Counts } from './links.ts';
import { shortTitle } from './products.ts';
import type { Reply } from './types.ts';

// The three channels the owner thinks in. Feed post and story are both "Insta".
export type Channel = 'status' | 'groups' | 'insta';
export const CHANNEL_LABEL: Record<Channel, string> = { status: 'Status', groups: 'groups', insta: 'Insta' };
// Free first when there is a tie.
const ORDER: Channel[] = ['status', 'groups', 'insta'];
export const NEXT_STEP: Record<Channel, string> = {
  status: 'post it again tonight, 7 to 10 PM',
  groups: 'forward it to 2 more groups today',
  insta: 'post one more story tonight at 8 PM',
};

export function byChannel(c: Counts): Record<Channel, number> {
  return { status: c.status, groups: c.group, insta: c.feed + c.story };
}

export function best(ch: Record<Channel, number>): Channel | undefined {
  let top: Channel | undefined;
  for (const k of ORDER) if (ch[k] > 0 && (!top || ch[k] > ch[top])) top = k;
  return top;
}

const n = (k: number, first: boolean) => (first ? `${k} click${k === 1 ? '' : 's'}` : String(k));

// "Status: 12 clicks, groups: 5, Insta: 2."
export function countsLine(ch: Record<Channel, number>): string {
  return ORDER.map((k, i) => `${i === 0 ? CHANNEL_LABEL[k] : CHANNEL_LABEL[k]}: ${n(ch[k], i === 0)}`).join(', ') + '.';
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const fallbackSentence = (b: Channel) => `${cap(CHANNEL_LABEL[b])} worked best, ${NEXT_STEP[b]}.`;

export function sentenceIsValid(s: string, b: Channel): boolean {
  if (!new RegExp(`\\b${CHANNEL_LABEL[b]}`, 'i').test(s)) return false;
  const allowed = new Set(NEXT_STEP[b].match(/\d+/g) ?? []);
  if ((s.match(/\d+/g) ?? []).some((d) => !allowed.has(d))) return false;
  const others = ORDER.filter((k) => k !== b).some((k) => new RegExp(`\\b${CHANNEL_LABEL[k]}\\b[^.]*\\b(best|sabse)`, 'i').test(s));
  return !others && s.trim().split(/\s+/).length <= 25;
}

// ---- model ----------------------------------------------------------------------------------

const PROMPT_PATH = process.env.REPORT_PROMPT_PATH ?? 'prompts/report_back.md';
const Schema = z.object({ sentence: z.string() });
let client: Anthropic | undefined;

async function modelSentence(title: string, b: Channel): Promise<string | undefined> {
  if (process.env.COACH_LLM === 'off' || !process.env.ANTHROPIC_API_KEY) return undefined;
  try {
    const md = readFileSync(PROMPT_PATH, 'utf8');
    const model = md.match(/^#.*\((claude-[a-z0-9-]+)\)/m)?.[1] ?? 'claude-sonnet-5-5';
    const system = md.split(/^System:\s*$/m)[1]?.split(/^User:\s*$/m)[0]?.trim() ?? '';
    const user = (md.split(/^User:\s*$/m)[1]?.trim() ?? '')
      .replace('{{title}}', title.replace(/\s+/g, ' '))
      .replace('{{best}}', CHANNEL_LABEL[b])
      .replace('{{next_step}}', NEXT_STEP[b]);
    client ??= new Anthropic({ timeout: 20_000, maxRetries: 1 });
    const res = await client.messages.parse({
      model,
      max_tokens: 2000,
      output_config: { effort: 'low', format: zodOutputFormat(Schema) },
      system,
      messages: [{ role: 'user', content: user }],
    });
    const s = res.parsed_output?.sentence.trim();
    if (res.stop_reason === 'refusal' || !s) return undefined;
    if (!sentenceIsValid(s, b)) {
      console.warn('[report] model sentence broke a rule; using code wording:', s);
      return undefined;
    }
    return s;
  } catch (err) {
    console.error('[report] model call failed; using code wording:', (err as Error).message);
    return undefined;
  }
}

export type Report = { replies: Reply[]; total: number; best?: Channel };

export async function buildReport(u: User): Promise<Report> {
  const pack = u.flow?.pack;
  const product = u.profile.product;
  // Clicks count across all of this owner's packs, not only the latest one.
  const mine = countClicksForUser(u.userId);
  if (!mine.links || !product) {
    const text = pack
      ? 'These posts have no tracking links (your own photo with no product page), so I cannot count clicks for them.'
      : 'No posts to report on yet. Tap "Let me get it done for you" first, then post them.';
    return { replies: [{ kind: 'text', text }], total: 0 };
  }
  const ch = byChannel(mine.counts);
  const total = ch.status + ch.groups + ch.insta;
  const name = mine.slugs.length > 1 ? 'All your posts' : shortTitle(product.title);
  if (!total) {
    return { replies: [{ kind: 'text', text: `${name}: no clicks yet. Post the Status tonight, 7 to 10 PM, and check again tomorrow.` }], total };
  }
  const b = best(ch)!;
  const sentence = (await modelSentence(product.title, b)) ?? fallbackSentence(b);
  return { replies: [{ kind: 'text', text: `${name} so far:\n${countsLine(ch)} ${sentence}` }], total, best: b };
}
