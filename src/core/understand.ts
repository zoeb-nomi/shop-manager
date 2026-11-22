// Free-form onboarding (M5): any typed reply, voice-note transcript or photo goes to Claude Haiku with the
// question list; it returns the fields it could fill. Code validates them, saves them, and decides which
// question is still open. The model only fills fields and words the one follow-up question.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { AdsBefore, Blocker, SellsOn, ShopProfile } from './db.ts';
import { loadProducts, shortTitle } from './products.ts';

export const Extract = z.object({
  sells: z.string().nullable(),
  city: z.string().nullable(),
  sells_on: z.array(z.enum(['shop', 'whatsapp', 'marketplace', 'social'])),
  ads_before: z.enum(['never', 'tried_no_orders', 'works']).nullable(),
  posting_blocker: z.enum(['what_to_post', 'no_time', 'photos_bad', 'which_app']).nullable(),
  product: z.string().nullable(),
  product_slug: z.string().nullable(),
  price: z.number().nullable(),
  language: z.string(),
  next_field: z.string().nullable(),
  follow_up: z.string().nullable(),
});
export type Extracted = z.infer<typeof Extract>;

export type Fields = {
  sells?: string;
  city?: string;
  sellsOn?: SellsOn[];
  adsBefore?: AdsBefore;
  postingBlocker?: Blocker;
  product?: string;
  productSlug?: string;
  price?: number;
  language?: string;
  followUp?: { field: string; text: string };
};

export type Message = { text?: string; photoPath?: string };
export type CallModel = (req: { model: string; system: string; user: string; image?: { data: string; mediaType: string } }) => Promise<unknown>;

const PROMPT_PATH = process.env.EXTRACT_PROMPT_PATH ?? 'prompts/onboarding_extract.md';

export function knownSummary(p: ShopProfile): string {
  return JSON.stringify({
    sells: p.sells ?? null,
    city: p.city ?? null,
    sells_on: p.sellsOn ?? [],
    ads_before: p.adsBefore ?? null,
    posting_blocker: p.postingBlocker ?? null,
    product: p.product ? shortTitle(p.product.title) : null,
  });
}

export function buildRequest(p: ShopProfile, msg: Message, questions: string[]) {
  const md = readFileSync(PROMPT_PATH, 'utf8');
  const model = md.match(/^#.*\((claude-[a-z0-9-]+)\)/m)?.[1] ?? 'claude-haiku-5-5';
  const system = md.split(/^System:\s*$/m)[1]?.split(/^User:\s*$/m)[0]?.trim() ?? '';
  const listings = loadProducts().map((x) => `${x.slug}: ${shortTitle(x.title)}`).join('; ');
  const user = (md.split(/^User:\s*$/m)[1]?.trim() ?? '')
    .replace('{{questions}}', questions.join(' | '))
    .replace('{{known}}', knownSummary(p))
    .replace('{{listings}}', listings)
    .replace('{{message}}', (msg.text ?? (msg.photoPath ? '(a photo, no caption)' : '')).replace(/\s+/g, ' ').slice(0, 1500));
  let image: { data: string; mediaType: string } | undefined;
  if (msg.photoPath) {
    const ext = path.extname(msg.photoPath).toLowerCase();
    const mediaType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    try {
      image = { data: readFileSync(msg.photoPath).toString('base64'), mediaType };
    } catch {
      image = undefined;
    }
  }
  return { model, system, user, image };
}

// Code's checks on what the model filled: a price must be a number the owner actually wrote, a listing must exist.
export function toFields(e: Extracted, msg: Message): Fields {
  const f: Fields = { language: e.language };
  const clean = (s: string | null) => (s && s.trim() ? s.trim().slice(0, 80) : undefined);
  f.sells = clean(e.sells);
  f.city = clean(e.city)?.replace(/\b\w/g, (c) => c.toUpperCase());
  if (e.sells_on.length) f.sellsOn = [...new Set(e.sells_on)];
  if (f.sellsOn && f.sellsOn.length > 1) f.sellsOn = f.sellsOn.filter((s) => s !== 'shop');
  f.adsBefore = e.ads_before ?? undefined;
  f.postingBlocker = e.posting_blocker ?? undefined;
  f.product = clean(e.product);
  if (e.product_slug && loadProducts().some((x) => x.slug === e.product_slug)) f.productSlug = e.product_slug;
  const digits: string[] = (msg.text ?? '').replace(/,/g, '').match(/\d+/g) ?? [];
  if (e.price && e.price > 0 && digits.includes(String(Math.round(e.price)))) f.price = Math.round(e.price);
  if (e.next_field && e.follow_up?.trim()) f.followUp = { field: e.next_field, text: e.follow_up.trim().slice(0, 200) };
  for (const k of Object.keys(f) as (keyof Fields)[]) if (f[k] === undefined) delete f[k];
  return f;
}

let client: Anthropic | undefined;
const callHaiku: CallModel = async (req) => {
  client ??= new Anthropic({ timeout: 15_000, maxRetries: 1 });
  const content: Array<Anthropic.ImageBlockParam | Anthropic.TextBlockParam> = [];
  if (req.image) content.push({ type: 'image', source: { type: 'base64', media_type: req.image.mediaType as 'image/jpeg', data: req.image.data } });
  content.push({ type: 'text', text: req.user });
  const res = await client.messages.parse({
    model: req.model,
    max_tokens: 2000,
    output_config: { format: zodOutputFormat(Extract) },
    system: req.system,
    messages: [{ role: 'user', content }],
  });
  return res.stop_reason === 'refusal' ? undefined : res.parsed_output;
};

let override: CallModel | undefined;
// Tests swap in a fake model.
export function useExtractor(fn: CallModel | undefined): void {
  override = fn;
}

export function understandingOn(): boolean {
  return Boolean(override) || (process.env.COACH_LLM !== 'off' && Boolean(process.env.ANTHROPIC_API_KEY));
}

export async function understand(p: ShopProfile, msg: Message, questions: string[], call: CallModel = override ?? callHaiku): Promise<Fields | undefined> {
  try {
    const parsed = Extract.safeParse(await call(buildRequest(p, msg, questions)));
    if (!parsed.success) return undefined;
    return toFields(parsed.data, msg);
  } catch (err) {
    console.error('[understand] failed; using the buttons flow:', (err as Error).message);
    return undefined;
  }
}
