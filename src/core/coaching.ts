// Step-by-step coaching plan (SPEC Flow 4, PAINS pain-to-fix rules).
// Code picks the channels, order, timings and rupees from the shop profile; the model (prompts/coaching_plan.md)
// only writes the words. If the model is off, slow, or breaks a rule, code writes the words instead.
import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { ShopProfile } from './db.ts';
import { shortTitle } from './products.ts';
import type { FestivalTiming } from './festivals.ts';

export type CodeStep =
  | { channel: 'whatsapp_status'; when: string }
  | { channel: 'community_groups'; groups: string[] }
  | { channel: 'instagram_story'; when: string }
  | { channel: 'instagram_boost' | 'amazon_sponsored'; rs: number; condition: string };

export const BOOST_RS = 300; // PAINS: paid boost capped at Rs 300
const BOOST_AFTER = '20+ clicks';
const LATER = 'later, only if it proves itself';

export const DO_IT_BUTTON = { id: 'do_it_for_me', label: 'Let me get it done for you' };
export const WHATSAPP_WARNING = "Don't send the same offer to 100s of numbers; WhatsApp may block it.";
export const NO_ADS_LINE = 'No ads until free posts prove this piece sells.';
export const PHOTO_LINE = "Your photo is fine, I'll make it look good.";
export const STATUS_HINT = 'Post Status tonight 7 to 10 PM.';

// Channel order and budget come from here, never from the model.
export function planSteps(p: ShopProfile): CodeStep[] {
  const on = new Set(p.sellsOn ?? []);
  const social = on.has('social');
  const status: CodeStep = { channel: 'whatsapp_status', when: '7-10 PM' };
  const groups: CodeStep = { channel: 'community_groups', groups: ['society', 'market association'] };
  const story: CodeStep = { channel: 'instagram_story', when: '8 PM' };

  let free: CodeStep[];
  if (p.postingBlocker === 'which_app') {
    // Only the channels they already use, plus at most one new free one (WhatsApp Status), ranked by code.
    free = on.has('whatsapp') ? [status, groups] : [status];
    if (social) free.push(story);
  } else {
    free = social ? [status, groups, story] : [status, groups];
  }

  // Pain 1: "Tried, got no orders" hides paid entirely; "Never" shows it only as "later".
  const paid: CodeStep[] = [];
  const paidChannel = social ? 'instagram_boost' : on.has('marketplace') ? 'amazon_sponsored' : undefined;
  if (paidChannel && p.adsBefore === 'works') paid.push({ channel: paidChannel, rs: BOOST_RS, condition: BOOST_AFTER });
  if (paidChannel && (p.adsBefore === 'never' || p.adsBefore === undefined)) {
    paid.push({ channel: paidChannel, rs: BOOST_RS, condition: `${LATER} (${BOOST_AFTER})` });
  }

  const steps = [...free, ...paid];
  return p.postingBlocker === 'which_app' ? steps.slice(0, 3) : steps.slice(0, 5);
}

// The lines code adds under the steps, each from a PAINS rule.
export function planNotes(p: ShopProfile, steps: CodeStep[], showNoAds: boolean): string[] {
  const notes: string[] = [];
  if (steps.some((s) => s.channel === 'whatsapp_status' || s.channel === 'community_groups')) notes.push(WHATSAPP_WARNING);
  if (showNoAds && p.adsBefore === 'tried_no_orders') notes.push(NO_ADS_LINE);
  if (!p.sellsOn?.includes('social') && p.postingBlocker !== 'which_app') {
    notes.push('No Instagram page yet? Skip it for now; WhatsApp comes first.');
  }
  return notes;
}

// Code's own wording, used when the model is off or its answer breaks a rule.
function fallbackStep(s: CodeStep): string {
  switch (s.channel) {
    case 'whatsapp_status': return 'Put it on your WhatsApp Status tonight, 7 to 10 PM.';
    case 'community_groups': return `Forward it to your 2 local groups: ${s.groups.join(' and ')}.`;
    case 'instagram_story': return 'Post it as an Instagram story at 8 PM.';
    default: {
      const where = s.channel === 'instagram_boost' ? 'on Instagram' : 'as an Amazon Sponsored ad';
      return s.condition.startsWith(LATER)
        ? `Later, only if it proves itself (${BOOST_AFTER}): boost ${where} for Rs ${s.rs}.`
        : `If it gets ${BOOST_AFTER}, boost it ${where} for Rs ${s.rs}.`;
    }
  }
}

export type CoachInput = { profile: ShopProfile; title: string; price?: number; timing?: FestivalTiming };
export type PlanWords = { intro: string; steps: string[]; offer: string };

const DEFAULT_OFFER = 'I can make every post for you. Let me get it done for you?';

function fallbackWords(input: CoachInput, steps: CodeStep[]): PlanWords {
  const when = input.timing ? ` before ${input.timing.festival.name}` : ' this week';
  return {
    intro: `Here is how to sell your ${shortTitle(input.title)}${when}, step by step.`,
    steps: steps.map(fallbackStep),
    offer: DEFAULT_OFFER,
  };
}

// ---- model call ----------------------------------------------------------------------------------

const PROMPT_PATH = process.env.COACHING_PROMPT_PATH ?? 'prompts/coaching_plan.md';
const PlanSchema = z.object({ intro: z.string(), steps: z.array(z.string()), offer: z.string() });

function loadPrompt(): { model: string; system: string; user: string } {
  const md = readFileSync(PROMPT_PATH, 'utf8');
  const model = md.match(/^#.*\((claude-[a-z0-9-]+)\)/m)?.[1] ?? 'claude-sonnet-5-5';
  const system = md.split(/^System:\s*$/m)[1]?.split(/^User:\s*$/m)[0]?.trim();
  const user = md.split(/^User:\s*$/m)[1]?.trim();
  if (!system || !user) throw new Error(`${PROMPT_PATH}: expected "System:" and "User:" sections`);
  return { model, system, user };
}

export function fillPrompt(template: string, input: CoachInput, steps: CodeStep[]): string {
  const p = input.profile;
  const t = input.timing;
  const vars: Record<string, string> = {
    name: p.shopName ?? 'their shop',
    city: p.city ?? 'their city',
    category: p.sells ?? 'their products',
    title: input.title,
    festival: t?.festival.name ?? 'no festival soon',
    days: t ? String(t.days) : '-',
  };
  return template
    .replace(/\{\{(\w+)\}\}/g, (m, k: string) => vars[k] ?? m)
    .replace(/^STEPS_FROM_CODE:.*$/m, `STEPS_FROM_CODE: ${JSON.stringify(steps)}`);
}

// Rules the model must not break: one step per code step, no rupee amounts other than the ones code set
// and the seller's own price, and the offer ends with the button's question.
export function wordsAreValid(w: PlanWords, steps: CodeStep[], sellerPrice?: number): boolean {
  if (w.steps.length !== steps.length) return false;
  const allowed = new Set(steps.flatMap((s) => ('rs' in s ? [s.rs] : [])));
  if (sellerPrice) allowed.add(sellerPrice);
  const all = [w.intro, ...w.steps, w.offer].join(' ');
  for (const m of all.matchAll(/(?:\brs\.?|₹|\brupees?)\s*(\d[\d,]*)|(\d[\d,]*)\s*(?:rs|rupees?)\b/gi)) {
    if (!allowed.has(Number((m[1] ?? m[2]).replace(/,/g, '')))) return false;
  }
  return /let me get it done for you\?\s*$/i.test(w.offer.trim());
}

const clip = (s: string, words: number) => s.trim().split(/\s+/).slice(0, words).join(' ');

let client: Anthropic | undefined;

async function modelWords(input: CoachInput, steps: CodeStep[]): Promise<PlanWords | undefined> {
  if (process.env.COACH_LLM === 'off' || !process.env.ANTHROPIC_API_KEY) return undefined;
  try {
    const prompt = loadPrompt();
    client ??= new Anthropic({ timeout: 25_000, maxRetries: 1 });
    const res = await client.messages.parse({
      model: prompt.model,
      max_tokens: 4000,
      output_config: { effort: 'low', format: zodOutputFormat(PlanSchema) },
      system: prompt.system,
      messages: [{ role: 'user', content: fillPrompt(prompt.user, input, steps) }],
    });
    if (res.stop_reason === 'refusal' || !res.parsed_output) return undefined;
    const w = res.parsed_output;
    const words = { intro: clip(w.intro, 25), steps: w.steps.map((s) => clip(s, 20)), offer: w.offer.trim() };
    if (!wordsAreValid(words, steps, input.price)) {
      console.warn('[coach] model answer broke a rule; using code wording', JSON.stringify(w));
      return undefined;
    }
    return words;
  } catch (err) {
    console.error('[coach] model call failed; using code wording:', (err as Error).message);
    return undefined;
  }
}

export type Plan = { text: string; steps: CodeStep[]; source: 'model' | 'fallback' };

export async function coachingPlan(input: CoachInput, showNoAds: boolean): Promise<Plan> {
  const steps = planSteps(input.profile);
  const fromModel = await modelWords(input, steps);
  const w = fromModel ?? fallbackWords(input, steps);
  const notes = planNotes(input.profile, steps, showNoAds);
  const text = [
    w.intro,
    w.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
    ...(notes.length ? [notes.join('\n')] : []),
    w.offer,
  ].join('\n\n');
  return { text, steps, source: fromModel ? 'model' : 'fallback' };
}
