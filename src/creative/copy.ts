// Ad copy for the creative pack (prompts/creative_copy.md). The model writes words only: price, festival and link
// come from code, and an answer that states a price, discount, offer or certification code did not give is thrown
// away. One retry, then code's own plain wording.
import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { FestivalTiming } from '../core/festivals.ts';
import { shortTitle } from '../core/products.ts';

export const CopySchema = z.object({
  headline_en: z.string(),
  benefit_en: z.string(),
  headline_hi: z.string(),
  festival_badge: z.string(),
  status_line: z.string(),
  story_cta: z.string(),
  forward_text_hi_en: z.string(),
  hashtags: z.array(z.string()),
});
export type Copy = z.infer<typeof CopySchema>;

export type CopyInput = { title: string; price?: number; timing?: FestivalTiming };
export type CopyResult = { copy: Copy; source: 'model' | 'fallback'; attempts: number };

// Placeholder the model leaves at the end of the forward text; code puts the real link (or "reply to order") there.
export const LINK_TOKEN = '{{link}}';

const PROMPT_PATH = process.env.CREATIVE_PROMPT_PATH ?? 'prompts/creative_copy.md';

export function buildPrompt(input: CopyInput): { model: string; system: string; user: string } {
  const md = readFileSync(PROMPT_PATH, 'utf8');
  const model = md.match(/^#.*\((claude-[a-z0-9-]+)\)/m)?.[1] ?? 'claude-sonnet-5-5';
  const system = md.split(/^System:\s*$/m)[1]?.split(/^User:\s*$/m)[0]?.trim();
  const userTpl = md.split(/^User:\s*$/m)[1]?.trim();
  if (!system || !userTpl) throw new Error(`${PROMPT_PATH}: expected "System:" and "User:" sections`);
  const t = input.timing;
  const user = userTpl
    .replace(/^PRODUCT_TITLE:.*$/m, `PRODUCT_TITLE: ${input.title.replace(/\s+/g, ' ')}`)
    .replace(/^PRICE:.*$/m, `PRICE: ${input.price ? `Rs ${input.price}` : 'none'}`)
    .replace(/^FESTIVAL:.*$/m, `FESTIVAL: ${t ? `${t.festival.name} in ${t.days} days` : 'none'}`);
  return { model, system, user };
}

// ---- checks ---------------------------------------------------------------------------------

// Cut to n words; if cut, drop a dangling "or / and / for ..." and trailing commas so it still reads as a phrase.
const words = (s: string, n: number) => {
  const all = s.trim().split(/\s+/).filter(Boolean);
  if (all.length <= n) return all.join(' ');
  const cut = all.slice(0, n);
  while (cut.length > 1 && /^(or|and|for|to|with|the|a|an|of|in|on|your|ke|ka|ki|aur)$/i.test(cut.at(-1)!.replace(/[,;:]$/, ''))) cut.pop();
  return cut.join(' ').replace(/[,;:\s]+$/, '');
};
const DEVANAGARI = /[ऀ-ॿ]/;
const OFFER_WORDS = /\b(free|discount\w*|offer\w*|cashback|deal|bogo|sale)\b|%|\boff\b|मुफ़?्त|फ्री|छूट|ऑफ़?र/i;
const CERT_WORDS = /\b(ISI|BIS|certified|certificate|warranty|guarantee\w*|ISO|CE)\b/gi;
// Material and quality claims: allowed only when the title says so (key = what the title must contain).
const CLAIMS: [RegExp, string][] = [
  ...['solid', 'pure', 'genuine', 'original', 'authentic', 'premium', 'luxury', 'luxurious', 'handmade', 'handcrafted', 'hand-made',
    'brass', 'copper', 'bronze', 'silver', 'steel', 'iron', 'aluminium', 'aluminum', 'wood', 'wooden', 'teak', 'glass', 'crystal',
    'marble', 'ceramic', 'porcelain', 'leather', 'durable', 'sturdy', 'rust-proof', 'rustproof', 'waterproof', 'water-resistant',
    'shatterproof', 'unbreakable', 'eco-friendly', 'energy-saving', 'long-lasting', 'lifetime', 'best', 'finest', 'top-quality',
    'high-quality', 'quality'].map((w): [RegExp, string] => [new RegExp(`\\b${w}\\b`, 'i'), w.replace(/-/g, '')]),
  [/\bgold(?:en)?\b/i, 'gold'],
  [/पीतल/, 'brass'], [/तांब/, 'copper'], [/चांदी|चाँदी/, 'silver'], [/लकड़ी/, 'wood'], [/शुद्ध/, 'pure'], [/असली/, 'genuine'],
  [/प्रीमियम/, 'premium'], [/सुनहर|सोने/, 'gold'], [/हाथ से बन/, 'handmade'],
];

function unsupportedClaim(text: string, title: string): string | undefined {
  const t = title.toLowerCase().replace(/-/g, '');
  for (const [re, key] of CLAIMS) {
    const m = text.match(re);
    if (m && !t.includes(key)) return m[0];
  }
  return undefined;
}

const RUPEES = /(?:\brs\.?|₹|\binr)\s*(\d[\d,]*)|(\d[\d,]*)\s*(?:rs\b|rupees?\b|\/-)/gi;

// Returns the reason the copy is unusable, or undefined if it passes.
export function problem(c: Copy, input: CopyInput): string | undefined {
  const all = [c.headline_en, c.benefit_en, c.headline_hi, c.festival_badge, c.status_line, c.story_cta, c.forward_text_hi_en].join(' \n ');
  // A festival badge may name the real festival (e.g. "Republic Day sale"); everything else is checked.
  const checked = input.timing ? all.replaceAll(input.timing.festival.name, '') : all;
  if (OFFER_WORDS.test(checked)) return 'states an offer, discount or free item';
  for (const m of all.matchAll(RUPEES)) {
    const n = Number((m[1] ?? m[2]).replace(/,/g, ''));
    if (n !== input.price) return `states a price code did not give (${n})`;
  }
  const title = input.title.toLowerCase();
  for (const m of all.matchAll(CERT_WORDS)) if (!title.includes(m[0].toLowerCase())) return `claims "${m[0]}"`;
  const claim = unsupportedClaim(all, input.title);
  if (claim) return `says "${claim}", which the title does not`;
  if (!input.timing && c.festival_badge.trim()) return 'festival badge without a festival';
  if (!c.forward_text_hi_en.includes(LINK_TOKEN)) return `forward text lacks ${LINK_TOKEN}`;
  return undefined;
}

// Lengths from the prompt, enforced in code.
export function clipCopy(c: Copy): Copy {
  const fwd = c.forward_text_hi_en.replaceAll(LINK_TOKEN, ' ').trim();
  return {
    headline_en: words(c.headline_en, 6),
    benefit_en: words(c.benefit_en, 12),
    headline_hi: DEVANAGARI.test(c.headline_hi) ? words(c.headline_hi, 6) : '',
    festival_badge: words(c.festival_badge, 3),
    status_line: words(c.status_line, 8),
    story_cta: words(c.story_cta, 5),
    forward_text_hi_en: `${words(fwd, 58)} ${LINK_TOKEN}`,
    hashtags: c.hashtags.map((h) => `#${h.replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '')}`).filter((h) => h.length > 1).slice(0, 5),
  };
}

const INSTRUCTION_WORDS = /\b(ignore|instruction\w*|rules?|prompt|system|pretend|say|write|make it)\b/i;

// Seller text is data: keep only the plain parts of it (no offers, no prices, nothing that reads like an order to us).
export function cleanSellerText(title: string): string[] {
  return title
    .split(/[,.;!\n]+/)
    .map((s) => s.trim())
    .filter((s) => s && !OFFER_WORDS.test(s) && !INSTRUCTION_WORDS.test(s) && !/\d[\d,]*\s*(?:rs\b|rupees?\b|\/-)|(?:\brs\.?|₹|\binr)\s*\d/i.test(s));
}

export function fallbackCopy(input: CopyInput): Copy {
  const parts = cleanSellerText(input.title);
  const name = shortTitle(parts[0] ?? 'New piece');
  const detail = parts.slice(1).join(', ');
  const fest = input.timing?.festival.name;
  return {
    headline_en: words(name, 6),
    benefit_en: words(detail || name, 12),
    headline_hi: '',
    festival_badge: fest ? words(fest.replace(/^\w/, (c) => c.toUpperCase()), 3) : '',
    status_line: fest ? words(`Ready for ${fest}: ${name}`, 8) : words(`New in my shop: ${name}`, 8),
    story_cta: 'Tap the link to order',
    forward_text_hi_en: `Namaste! ${name} ab hamare paas available hai. ${words(detail, 14)}${detail ? '.' : ''} Order ke liye: ${LINK_TOKEN}`,
    hashtags: [],
  };
}

// ---- model ----------------------------------------------------------------------------------

export type CallModel = (prompt: { model: string; system: string; user: string }) => Promise<unknown>;

let client: Anthropic | undefined;

const callSonnet: CallModel = async (prompt) => {
  client ??= new Anthropic({ timeout: 25_000, maxRetries: 1 });
  const res = await client.messages.parse({
    model: prompt.model,
    max_tokens: 4000,
    output_config: { effort: 'low', format: zodOutputFormat(CopySchema) },
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
  });
  return res.stop_reason === 'refusal' ? undefined : res.parsed_output;
};

export async function creativeCopy(input: CopyInput, callModel: CallModel = callSonnet): Promise<CopyResult> {
  const off = callModel === callSonnet && (process.env.COACH_LLM === 'off' || !process.env.ANTHROPIC_API_KEY);
  if (off) return { copy: fallbackCopy(input), source: 'fallback', attempts: 0 };
  const prompt = buildPrompt(input);
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const parsed = CopySchema.safeParse(await callModel(prompt));
      if (!parsed.success) {
        console.warn(`[copy] attempt ${attempt}: not valid JSON for the schema`);
        continue;
      }
      const why = problem(parsed.data, input);
      if (why) {
        console.warn(`[copy] attempt ${attempt}: ${why}`);
        continue;
      }
      return { copy: clipCopy(parsed.data), source: 'model', attempts: attempt };
    } catch (err) {
      console.error(`[copy] attempt ${attempt} failed:`, (err as Error).message);
    }
  }
  return { copy: fallbackCopy(input), source: 'fallback', attempts: 2 };
}
