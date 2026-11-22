// The agent-led conversation: 4 opening questions (PAINS.md), the product pick, then the coaching plan.
// One question per message, buttons over typing, resumable from db.json at every step.
import type { AdsBefore, Blocker, Flow, FlowStep, PickedProduct, SellsOn, ShopProfile, User } from './db.ts';
import { readDb, updateDb } from './db.ts';
import { buildReport } from './report.ts';
import type { Button, Inbound, Reply } from './types.ts';
import { DEMO_SHOP, demoShopCity, loadProducts, parsePrice, productBySlug, shortTitle } from './products.ts';
import { judgePick, phrase, rankTitles, bestFit, headline, FESTIVAL_HI, type FestivalTiming } from './festivals.ts';
import { voiceNote } from './voiceNote.ts';
import { coachingPlan, DO_IT_BUTTON, PHOTO_LINE, STATUS_HINT, WHATSAPP_WARNING } from './coaching.ts';
import { makePack } from '../creative/pack.ts';
import { postFeedToInstagram } from './instagramPost.ts';
import { chatOn, chatReply } from './chat.ts';
import { understand, understandingOn, type Fields } from './understand.ts';

// ---- the questions, word for word from PAINS.md ------------------------------------------------

export const Q1 =
  "Namaste! I'm your marketing team. What do you sell, and in which city?\n\n" +
  "(I'll learn your shop, help you pick what can sell most, tell you where to post, and make the posts for you.)";
const Q1_BUTTONS: Button[] = [
  { id: 'use_amazon', label: 'Use my Amazon products' },
  { id: 'send_photos', label: "I'll send photos" },
];
const Q1_CITY = 'And which city is your shop in?';

export const Q2 = 'Where do you sell today?';
export const Q2_OPTIONS: { code: SellsOn; label: string }[] = [
  { code: 'shop', label: 'Only my shop' },
  { code: 'whatsapp', label: 'WhatsApp' },
  { code: 'marketplace', label: 'Amazon / Meesho / Flipkart' },
  { code: 'social', label: 'Instagram / Facebook' },
];
const Q2_HINT = 'Tap all that fit, then Done.';

export const Q3 = 'Have you paid for ads before?';
export const Q3_OPTIONS: { code: AdsBefore; label: string }[] = [
  { code: 'never', label: 'Never' },
  { code: 'tried_no_orders', label: 'Tried, got no orders' },
  { code: 'works', label: 'Yes, it works' },
];

export const Q4 = 'What stops you from posting more?';
export const Q4_OPTIONS: { code: Blocker; label: string }[] = [
  { code: 'what_to_post', label: "Don't know what to post" },
  { code: 'no_time', label: 'No time' },
  { code: 'photos_bad', label: 'My photos look bad' },
  { code: 'which_app', label: "Don't know which app to use" },
];

const PICK_Q = 'Which pieces do you have in stock, and which do you think could sell a lot? Tap one.';
const PICK_OWN_Q = 'Which piece could sell a lot right now? Send a photo of it, or type its name and price.';
const PHOTO_Q = 'Send a photo of the piece, with one line: what it is and the price.';
const PHOTO_LINE_Q = 'Nice photo. Now one line: what is it, and the price?';

const HELP_BUTTON: Button = { id: 'do_it_for_me', label: 'Do it for me' };

// ---- prompts for each step (also used to resume) -----------------------------------------------

const buttons = (text: string, b: Button[], edit?: boolean): Reply => ({ kind: 'buttons', text, buttons: b, ...(edit ? { edit } : {}) });

function q2Reply(draft: SellsOn[], edit = false, note?: string, lead = ''): Reply {
  const b = Q2_OPTIONS.map((o) => ({ id: `q2:${o.code}`, label: `${draft.includes(o.code) ? '✅ ' : ''}${o.label}` }));
  b.push({ id: 'q2:done', label: 'Done' });
  return buttons(`${lead}${Q2}\n${note ?? Q2_HINT}`, b, edit);
}

const q3Reply = (lead = ''): Reply => buttons(lead + Q3, Q3_OPTIONS.map((o) => ({ id: `q3:${o.code}`, label: o.label })));
const q4Reply = (lead = ''): Reply => buttons(lead + Q4, Q4_OPTIONS.map((o) => ({ id: `q4:${o.code}`, label: o.label })));

function pickReply(p: ShopProfile, lead = ''): Reply {
  // The listing buttons are the Amazon shop's own stock. Any other shop is asked for its own piece.
  if (p.productSource !== 'amazon') return buttons(lead + PICK_OWN_Q, [{ id: 'pick:list', label: 'Use my Amazon products' }]);
  const b = loadProducts().map((x) => ({ id: `pick:${x.slug}`, label: shortTitle(x.title) }));
  b.push({ id: 'pick:photo', label: "I'll send a photo" });
  return buttons(lead + PICK_Q, b);
}

function suggestReply(u: User): Reply[] {
  const s = u.flow?.suggestion;
  const better = s && productBySlug(s.better);
  const picked = u.profile.product; // a listing or the owner's own piece
  if (!better || !picked) return [pickReply(u.profile)];
  return [buttons('Push the better festival piece first?', [
    { id: `swap:${better.slug}`, label: `Yes, ${shortTitle(better.title)}` },
    { id: 'keep', label: `No, keep ${shortTitle(picked.title)}` },
  ])];
}

function promptFor(u: User, lead = ''): Reply[] {
  const flow = u.flow ?? { step: 'q1' };
  switch (flow.step) {
    case 'q1': return [buttons(Q1, Q1_BUTTONS)];
    case 'q1_city': return [{ kind: 'text', text: lead + Q1_CITY }];
    case 'q2': return [q2Reply(flow.q2Draft ?? [], false, lead ? `${lead.trim()} ${Q2_HINT}` : undefined)];
    case 'q3': return [q3Reply(lead)];
    case 'q4': return [q4Reply(lead)];
    case 'pick': return [pickReply(u.profile, lead)];
    case 'photo_line': return [{ kind: 'text', text: lead + PHOTO_LINE_Q }];
    case 'suggest': return suggestReply(u);
    case 'plan': return flow.plan ? [buttons(flow.plan.text, [DO_IT_BUTTON])] : [pickReply(u.profile, lead)];
    case 'pack': return [buttons(lead + 'Want me to make the posts again?', [DO_IT_BUTTON])];
  }
}

// ---- small helpers -----------------------------------------------------------------------------

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9ऀ-ॿ ]+/g, ' ').replace(/\s+/g, ' ').trim();

function matchOption<T>(text: string, options: { code: T; label: string }[]): T | undefined {
  const t = norm(text);
  if (!t) return undefined;
  return options.find((o) => norm(o.label) === t)?.code ?? options.find((o) => t.length >= 3 && norm(o.label).includes(t))?.code;
}

// Typed answer to Q2: pick out every channel mentioned.
function parseSellsOn(text: string): SellsOn[] {
  const t = norm(text);
  const out: SellsOn[] = [];
  if (/whats ?app|wa\b/.test(t)) out.push('whatsapp');
  if (/amazon|meesho|flipkart|marketplace/.test(t)) out.push('marketplace');
  if (/insta|facebook|\bfb\b|\big\b/.test(t)) out.push('social');
  if (!out.length && /shop|dukan|store|only/.test(t)) out.push('shop');
  return out;
}

// "LED lights, Jaipur" / "I sell lamps in Jaipur" → { sells, city }. City may be missing.
export function parseSellsCity(raw: string): { sells: string; city?: string } {
  const t = raw.trim().replace(/\s+/g, ' ').replace(/^(i|we|hum)\s+(sell|bechte\s+hain?)\s+/i, '');
  const titleCase = (c: string) => c.replace(/\b\w/g, (ch) => ch.toUpperCase());
  const parts = t.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2 && parts.at(-1)!.split(' ').length <= 3) {
    return { sells: parts.slice(0, -1).join(', '), city: titleCase(parts.at(-1)!) };
  }
  const m = t.match(/^(.*\S)\s+(?:in|from|at|se|mein)\s+([a-z][a-z .]{1,40})$/i);
  if (m && m[2].split(' ').length <= 3) return { sells: m[1], city: titleCase(m[2].trim()) };
  return { sells: t };
}

const HELP_RE = /\b(help|stuck|kaise|samajh?\s*nahi|samjh[ai]?\s*nahi|samajh\s*nahi\s*aaya|kya\s*kar(u|un|na)|confused)\b/i;
const HINGLISH_RE = /\b(kaise|samajh?|samjh[ai]?|nahi|kya|aaya|karu|karna)\b/i;

const NEXT_STEP: Record<FlowStep, [en: string, hi: string]> = {
  q1: ['Just type what you sell and your city, like: LED lights, Jaipur.', 'Bas likhiye aap kya bechte hain aur kis shehar mein, jaise: LED lights, Jaipur.'],
  q1_city: ['Just type your city name, like: Jaipur.', 'Bas apne shehar ka naam likhiye, jaise: Jaipur.'],
  q2: ['Tap the buttons for where you sell, then Done.', 'Jahan aap bechte hain un buttons par tap kariye, phir Done.'],
  q3: ['Tap the button that fits you best.', 'Jo button sahi lage, us par tap kariye.'],
  q4: ['Tap the button that fits you best.', 'Jo button sahi lage, us par tap kariye.'],
  pick: ['Tap the piece you want to sell first.', 'Jo piece pehle bechna hai, us par tap kariye.'],
  photo_line: ['Type one line about the piece: name and price.', 'Piece ke baare mein ek line likhiye: naam aur daam.'],
  suggest: ['Tap Yes or No.', 'Haan ya Nahi par tap kariye.'],
  plan: ["Tap the button and I'll make the posts for you.", 'Button dabaiye, posts main bana dunga.'],
  pack: ["Tap the button and I'll make the posts again.", 'Button dabaiye, posts main phir se bana dunga.'],
};

// Pain 2: one next step, in the owner's language, plus "Do it for me". Never a ticket or a docs link.
function helpReply(step: FlowStep, text: string): Reply[] {
  const [en, hi] = NEXT_STEP[step];
  return [buttons(HINGLISH_RE.test(text) ? hi : en, [HELP_BUTTON])];
}

function productFromListing(slug: string): PickedProduct | undefined {
  const p = productBySlug(slug);
  return p && { slug: p.slug, title: p.title, source: 'amazon', asin: p.asin, image: p.image, ...(p.price ? { price: p.price } : {}) };
}

// Where the owner is in the journey, for surfaces that show progress (the web chat's step strip).
export function journeyOf(u?: User): { stage: 1 | 2 | 3 | 4; question?: number } {
  const s = u?.flow?.step ?? 'q1';
  if (s === 'q1' || s === 'q1_city') return { stage: 1, question: 1 };
  if (s === 'q2' || s === 'q3' || s === 'q4') return { stage: 1, question: Number(s[1]) };
  if (s === 'pick' || s === 'photo_line' || s === 'suggest') return { stage: 2 };
  return { stage: s === 'plan' ? 3 : 4 };
}

// ---- skipping what is already known (M5) -------------------------------------------------------

type NextStep = 'q1' | 'q1_city' | 'q2' | 'q3' | 'q4' | 'pick' | 'done';

export function nextMissing(p: ShopProfile): NextStep {
  if (!p.sells) return 'q1';
  if (!p.city) return 'q1_city';
  if (!p.sellsOn?.length) return 'q2';
  if (!p.adsBefore) return 'q3';
  if (!p.postingBlocker) return 'q4';
  if (!p.product) return 'pick';
  return 'done';
}

// Moves to the first question still open; when everything is known, straight to the pick verdict and plan.
function goNext(u: User, lead = ''): Outcome {
  const flow = u.flow!;
  const next = nextMissing(u.profile);
  if (next === 'done') return choose(u, u.profile.product!);
  if (next === 'pick' || next === 'q4') u.profile.answeredAt ??= next === 'pick' ? new Date().toISOString() : undefined;
  if (next === 'q2') flow.q2Draft = [];
  flow.step = next;
  return { replies: promptFor(u, lead) };
}

const FIELD_STEP: Record<string, NextStep> = {
  sells: 'q1', city: 'q1_city', sells_on: 'q2', ads_before: 'q3', posting_blocker: 'q4', product: 'pick', price: 'pick',
};
const label = <T,>(opts: { code: T; label: string }[], code: T) => opts.find((o) => o.code === code)?.label;

// Saves what the model understood and asks only for what is still missing, in the owner's language.
function applyFields(u: User, f: Fields, msg: Inbound, text: string): Outcome {
  const p = u.profile;
  const flow = (u.flow ??= { step: 'q1' });
  const a = (p.answers ??= {});
  if (f.sells) [p.sells, a.q1] = [f.sells, a.q1 ?? text];
  if (f.city) p.city = f.city;
  if (f.sellsOn) {
    p.sellsOn = [...new Set([...(p.sellsOn ?? []).filter((s) => s !== 'shop'), ...f.sellsOn])];
    if (f.sellsOn.length === 1 && f.sellsOn[0] === 'shop') p.sellsOn = ['shop'];
    a.q2 = Q2_OPTIONS.filter((o) => p.sellsOn!.includes(o.code)).map((o) => o.label);
  }
  if (f.adsBefore) [p.adsBefore, a.q3] = [f.adsBefore, label(Q3_OPTIONS, f.adsBefore)];
  if (f.postingBlocker) [p.postingBlocker, a.q4] = [f.postingBlocker, label(Q4_OPTIONS, f.postingBlocker)];
  if (f.productSlug && p.productSource === 'amazon') {
    p.product = productFromListing(f.productSlug);
  } else if (msg.photoPath && (f.product || text)) {
    p.product = { ...ownPhoto(msg.photoPath, f.product ?? text), ...(f.price ? { price: f.price } : {}) };
  } else if (msg.photoPath) {
    flow.pendingPhoto = msg.photoPath;
  } else if (f.product) {
    p.product = { slug: `own-${Date.now().toString(36)}`, title: f.product, source: 'photo', ...(f.price ? { price: f.price } : {}) };
  }
  if (p.product && f.price && !p.product.price) p.product.price = f.price;
  p.understood = [...(p.understood ?? []), new Date().toISOString()].slice(-20);

  const next = nextMissing(p);
  if (next === 'pick' && flow.pendingPhoto) {
    flow.step = 'photo_line';
    return { replies: [{ kind: 'text', text: f.followUp?.text ?? PHOTO_LINE_Q }] };
  }
  const out = goNext(u);
  // The model's follow-up, in the owner's language, replaces the English question text when it asks for the same thing.
  const ask = f.followUp && FIELD_STEP[f.followUp.field] === next ? f.followUp.text : undefined;
  const firstReply = out.replies[0];
  if (ask && firstReply && (firstReply.kind === 'text' || firstReply.kind === 'buttons')) out.replies[0] = { ...firstReply, text: ask };
  return out;
}

// ---- the turn ----------------------------------------------------------------------------------

type Turn = { u: User; msg: Inbound; text: string };

// Runs one inbound message against the stored user. Mutates u (saved by the caller) and returns replies.
// The coaching plan needs a model call, so it is returned as a follow-up to run outside the db lock.
type Outcome = { replies: Reply[]; then?: 'plan' | 'pack' };

export function isCommand(text: string, cmd: string): boolean {
  return new RegExp(`^/${cmd}(@\\w+)?(\\s|$)`, 'i').test(text);
}

function step(t: Turn): Outcome {
  const { u, msg, text } = t;
  const isNew = !u.flow;
  const flow = (u.flow ??= { step: 'q1' });
  const p = u.profile;
  const btn = msg.button ?? '';
  const now = () => new Date().toISOString();

  // Commands work at any step.
  if (isCommand(text, 'reset')) {
    u.profile = {};
    u.flow = { step: 'q1' };
    return { replies: [buttons(Q1, Q1_BUTTONS)] };
  }
  if (isCommand(text, 'profile')) return { replies: [{ kind: 'text', text: profileText(u) }] };
  if (isCommand(text, 'start')) {
    // An onboarded shop at the pick: the agent opens with the festival nudge (SPEC Flow 8), then the pick.
    if (flow.step === 'pick' && p.answeredAt && p.productSource !== 'photos') return { replies: nudge(u) };
    const fresh = flow.step === 'q1' && !p.answers?.q1;
    return { replies: fresh ? promptFor(u) : [{ kind: 'text', text: 'Welcome back! We were here:' }, ...promptFor(u)] };
  }

  // Someone who never saw the first question gets it first, whatever they typed.
  if (isNew && !btn) return { replies: promptFor(u) };

  if (text && !btn && HELP_RE.test(text)) return { replies: helpReply(flow.step, text) };
  if (btn === 'do_it_for_me') return doItForMe(u);

  switch (flow.step) {
    case 'q1': {
      if (btn === 'use_amazon') {
        Object.assign(p, DEMO_SHOP, { productSource: 'amazon' });
        p.answers = { ...p.answers, q1: `${DEMO_SHOP.sells} (my Amazon products)` };
        const got = `Got your ${loadProducts().length} Amazon listings (${DEMO_SHOP.sells})`;
        const city = demoShopCity();
        if (city) {
          p.city = city;
          p.answers.q1 += `, ${city}`;
          flow.step = 'q2';
          flow.q2Draft = [];
          return { replies: [q2Reply([], false, undefined, `${got}, ${city}.\n\n`)] };
        }
        flow.step = 'q1_city';
        return { replies: [{ kind: 'text', text: `${got}. ${Q1_CITY}` }] };
      }
      if (btn === 'send_photos') {
        p.productSource = 'photos';
        return { replies: [{ kind: 'text', text: 'Great, you can send photos in a moment. First: what do you sell, and in which city?' }] };
      }
      if (!text) return { replies: promptFor(u) };
      const { sells, city } = parseSellsCity(text);
      p.sells = sells;
      p.answers = { ...p.answers, q1: text };
      if (!city) {
        flow.step = 'q1_city';
        return { replies: [{ kind: 'text', text: Q1_CITY }] };
      }
      p.city = city;
      if (nextMissing(p) !== 'q2') return goNext(u, `Got it: ${sells}, ${city}. `);
      flow.step = 'q2';
      flow.q2Draft = [];
      return { replies: [q2Reply([], false, undefined, `Got it: ${sells}, ${city}.\n\n`)] };
    }

    case 'q1_city': {
      if (!text) return { replies: promptFor(u) };
      p.city = text.trim().replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 60);
      p.answers = { ...p.answers, q1: p.answers?.q1 ? `${p.answers.q1}, ${p.city}` : p.city };
      if (nextMissing(p) !== 'q2') return goNext(u, `Got it: ${p.sells ?? 'your shop'}, ${p.city}. `);
      flow.step = 'q2';
      flow.q2Draft = [];
      return { replies: [q2Reply([], false, undefined, `Got it: ${p.sells ?? 'your shop'}, ${p.city}.\n\n`)] };
    }

    case 'q2': {
      const draft = (flow.q2Draft ??= []);
      if (btn.startsWith('q2:') && btn !== 'q2:done') {
        const code = btn.slice(3) as SellsOn;
        if (!Q2_OPTIONS.some((o) => o.code === code)) return { replies: promptFor(u) };
        const i = draft.indexOf(code);
        if (i >= 0) draft.splice(i, 1);
        else if (code === 'shop') draft.splice(0, draft.length, 'shop'); // "Only my shop" excludes the rest
        else {
          if (draft.includes('shop')) draft.splice(draft.indexOf('shop'), 1);
          draft.push(code);
        }
        return { replies: [q2Reply(draft, true)] };
      }
      let chosen: SellsOn[] = [];
      if (btn === 'q2:done') chosen = [...draft];
      else if (text) chosen = parseSellsOn(text);
      if (!chosen.length) {
        if (btn === 'q2:done') return { replies: [q2Reply(draft, true, 'Tap at least one, then Done.')] };
        return { replies: promptFor(u, 'Please tap the buttons.') };
      }
      p.sellsOn = chosen;
      p.answers = { ...p.answers, q2: Q2_OPTIONS.filter((o) => chosen.includes(o.code)).map((o) => o.label) };
      delete flow.q2Draft;
      return goNext(u);
    }

    case 'q3': {
      const code = btn.startsWith('q3:') ? Q3_OPTIONS.find((o) => `q3:${o.code}` === btn)?.code : matchOption(text, Q3_OPTIONS);
      if (!code) return { replies: promptFor(u, 'Please tap one: ') };
      p.adsBefore = code;
      p.answers = { ...p.answers, q3: Q3_OPTIONS.find((o) => o.code === code)!.label };
      return goNext(u);
    }

    case 'q4': {
      const code = btn.startsWith('q4:') ? Q4_OPTIONS.find((o) => `q4:${o.code}` === btn)?.code : matchOption(text, Q4_OPTIONS);
      if (!code) return { replies: promptFor(u, 'Please tap one: ') };
      p.postingBlocker = code;
      p.answers = { ...p.answers, q4: Q4_OPTIONS.find((o) => o.code === code)!.label };
      p.answeredAt = now();
      return goNext(u, 'Thanks, I know your shop now.\n\n');
    }

    case 'pick':
    case 'photo_line': {
      if (btn === 'pick:list') {
        p.productSource = 'amazon';
        flow.step = 'pick';
        return { replies: [pickReply(p)] };
      }
      if (btn === 'pick:photo') {
        p.productSource = 'photos';
        const lead = p.postingBlocker === 'photos_bad' ? `${PHOTO_LINE} ` : '';
        return { replies: [{ kind: 'text', text: lead + PHOTO_Q }] };
      }
      if (btn.startsWith('pick:')) {
        const product = productFromListing(btn.slice(5));
        if (!product) return { replies: promptFor(u) };
        p.productSource = 'amazon'; // they tapped one of the listings
        return choose(u, product);
      }
      if (msg.photoPath) {
        if (!text) {
          flow.pendingPhoto = msg.photoPath;
          flow.step = 'photo_line';
          const lead = p.postingBlocker === 'photos_bad' ? `${PHOTO_LINE}\n\n` : '';
          return { replies: [{ kind: 'text', text: lead + PHOTO_LINE_Q }] };
        }
        return choose(u, ownPhoto(msg.photoPath, text));
      }
      if (flow.step === 'photo_line' && text && flow.pendingPhoto) {
        const product = ownPhoto(flow.pendingPhoto, text);
        delete flow.pendingPhoto;
        return choose(u, product);
      }
      return { replies: promptFor(u, 'Tap a piece below. ') };
    }

    case 'suggest': {
      const s = flow.suggestion;
      if (btn.startsWith('swap:')) {
        const product = productFromListing(btn.slice(5));
        if (product) {
          p.product = product;
          delete flow.suggestion;
          return planOrPack(u, [{ kind: 'text', text: `Great, ${shortTitle(product.title)} it is.` }]);
        }
      }
      if (btn === 'keep' && s) {
        delete flow.suggestion;
        return planOrPack(u, [{ kind: 'text', text: 'Fine, we go with your pick. It sells all year.' }]);
      }
      return { replies: promptFor(u) };
    }

    case 'plan':
    case 'pack': {
      if (msg.photoPath) {
        // A new photo after the plan: start a new pick with it.
        flow.step = 'pick';
        return step({ u, msg, text });
      }
      return { replies: promptFor(u) };
    }
  }
}

// "Christmas is in 33 days. Your Golden Bird LED Wall Light makes a good gift." Facts and ranking from code.
function nudge(u: User): Reply[] {
  const head = headline();
  const listings = loadProducts();
  const top = listings[rankTitles(listings.map((x) => x.title))[0]];
  const lead = head
    ? `Namaste ${u.profile.shopName ?? ''}! ${phrase(head)}. Your ${shortTitle(top.title)} makes a good gift; I can make its posts now.\n\n`.replace(' !', '!')
    : 'Namaste! ';
  return [pickReply(u.profile, lead)];
}

// /nudge: the agent opens the conversation with the festival nudge as text AND as a short Hindi voice note
// saying the same thing, then the product buttons. Festival, days and the piece come from code.
export function nudgeLines(u: User): { text: string; hindi: string } | undefined {
  const head = headline();
  if (!head) return undefined;
  const listings = loadProducts();
  const top = shortTitle(listings[rankTitles(listings.map((x) => x.title))[0]].title);
  const shop = u.profile.shopName ? ` ${u.profile.shopName}` : '';
  const fest = FESTIVAL_HI[head.festival.id] ?? head.festival.name;
  const when = head.active ? `${fest} चल रहा है` : head.days === 0 ? `आज ${fest} है` : `${fest} में ${head.days} दिन बाकी हैं`;
  return {
    text: `Namaste${shop}! ${phrase(head)}. Your ${top} makes a good gift; I can make its posts now.`,
    hindi: `नमस्ते${shop}! ${when}। आपकी ${top} एक अच्छा गिफ़्ट है। मैं अभी इसकी पोस्ट बना सकता हूँ।`,
  };
}

async function nudgeReplies(userId: string): Promise<Reply[]> {
  const before = readDb().users[userId];
  const lines = nudgeLines(before);
  const voice = lines ? await voiceNote(lines.hindi) : undefined;
  console.log(`[nudge] ${userId}: voice ${voice ? (voice.ogg ? 'note (ogg)' : 'file (wav)') : 'none, text only'}`);
  return updateDb((db) => {
    const u = db.users[userId];
    const flow = (u.flow ??= { step: 'q1' });
    // An onboarded shop goes (back) to the product pick; anyone else continues where they were.
    if (u.profile.answeredAt) flow.step = 'pick';
    const out: Reply[] = [];
    if (lines) out.push({ kind: 'text', text: lines.text });
    if (voice) out.push({ kind: 'voice', path: voice.ogg ?? voice.wav, webPath: voice.wav });
    return [...out, ...(u.profile.answeredAt ? [pickReply({ ...u.profile, productSource: 'amazon' })] : promptFor(u))];
  });
}

function ownPhoto(photoPath: string, line: string): PickedProduct {
  const price = parsePrice(line);
  return { slug: `photo-${Date.now().toString(36)}`, title: line.trim().slice(0, 140), source: 'photo', photoPath, ...(price ? { price } : {}) };
}

// The owner picked a piece: agree (naming the festival and days left) or suggest a better one. Ranking is in code.
function choose(u: User, product: PickedProduct): Outcome {
  const flow = u.flow!;
  u.profile.product = product;
  const listings = u.profile.productSource === 'amazon' ? loadProducts() : [];
  const verdict = judgePick(product.title, listings.map((x) => x.title));
  const name = shortTitle(product.title);
  const Name = name.charAt(0).toUpperCase() + name.slice(1);
  const picture: Reply[] = product.image ? [{ kind: 'image', path: product.image, caption: name }] : [];

  if (verdict.kind === 'suggest') {
    const better = listings[verdict.betterIndex];
    flow.step = 'suggest';
    flow.suggestion = { picked: product.slug, better: better.slug };
    const text =
      `${Name} sells all year, so it can wait. ${phrase(verdict.timing)}, and ${verdict.timing.festival.why}. ` +
      `Your ${shortTitle(better.title)} is the better piece to push now.`;
    return { replies: [...picture, { kind: 'text', text }, ...suggestReply(u)] };
  }
  const why = verdict.timing
    ? `Good pick. ${phrase(verdict.timing)}, and ${verdict.timing.festival.why}. Your ${name} fits that.`
    : `Good pick. ${Name} sells all year.`;
  return planOrPack(u, [...picture, { kind: 'text', text: why }]);
}

// After the pick. PAINS Q4 rules: "Don't know what to post" skips the coaching and goes straight to the pack;
// "No time" gets the one-tap pack with a single schedule hint; everyone else gets the step-by-step plan.
function planOrPack(u: User, lead: Reply[]): Outcome {
  const blocker = u.profile.postingBlocker;
  if (blocker === 'what_to_post') return { replies: lead, then: 'pack' };
  if (blocker === 'no_time') {
    u.flow!.step = 'plan';
    const text = ["No time? Fine. I'll make every post; you only share them.", STATUS_HINT, WHATSAPP_WARNING].join('\n');
    u.flow!.plan = { text, steps: [], source: 'code', createdAt: new Date().toISOString() };
    return { replies: [...lead, buttons(text, [DO_IT_BUTTON])] };
  }
  return { replies: lead, then: 'plan' };
}

// "Do it for me" / "Let me get it done for you": at any step, code fills what is missing with safe,
// free-first choices and moves on.
function doItForMe(u: User): Outcome {
  const p = u.profile;
  const flow = u.flow!;
  let demoShop = false;
  if (flow.step === 'q1' || flow.step === 'q1_city') {
    // Skipping before saying what they sell: use the demo shop (it has a home city). A shop that did say what it
    // sells is still asked for its city, the one thing code cannot fill in.
    if (!p.sells) {
      Object.assign(p, DEMO_SHOP, { productSource: 'amazon' });
      p.city ??= demoShopCity();
      demoShop = true;
    }
    if (!p.city) {
      flow.step = 'q1_city';
      return { replies: [{ kind: 'text', text: `I need just one thing from you. ${Q1_CITY}` }] };
    }
    p.answers = { ...p.answers, q1: p.answers?.q1 ?? `${p.sells}, ${p.city}` };
    flow.step = 'q2';
  }
  if (flow.step === 'q2' || flow.step === 'q3' || flow.step === 'q4') {
    p.sellsOn ??= flow.q2Draft?.length ? [...flow.q2Draft] : ['whatsapp'];
    p.adsBefore ??= 'never';
    p.postingBlocker ??= 'no_time';
    p.defaultsUsed = true;
    p.answeredAt = new Date().toISOString();
    delete flow.q2Draft;
    flow.step = 'pick';
    const who = demoShop ? `I set up a demo shop for you: ${p.shopName}, ${p.sells}, ${p.city}. ` : 'Done: ';
    return { replies: [pickReply(p, `${who}${demoShop ? 'Free' : 'free'} channels first, no ads, I make the posts.\n\n`)] };
  }
  if (!p.product && p.productSource !== 'amazon') {
    flow.step = 'pick';
    return { replies: [pickReply(p, 'I need just one thing from you. ')] };
  }
  if (!p.product || (p.productSource === 'amazon' && (flow.step === 'pick' || flow.step === 'photo_line' || flow.step === 'suggest'))) {
    const listings = loadProducts();
    const best = listings[rankTitles(listings.map((x) => x.title))[0]];
    p.product = productFromListing(best.slug);
    delete flow.suggestion;
    const fit = bestFit(best.title);
    const why = fit ? `I picked ${shortTitle(best.title)}: ${phrase(fit)}.` : `I picked ${shortTitle(best.title)}.`;
    return { replies: [{ kind: 'text', text: why }], then: 'pack' };
  }
  return { replies: [], then: 'pack' };
}

// The creative pack (M3): copy + three posters + the group message. If rendering fails, say so plainly
// and keep the button, so the owner can try again; never a dead end.
async function packReplies(u: User): Promise<Reply[]> {
  const product = u.profile.product;
  if (!product) return [buttons('Pick a piece first, then I make the posts.', [DO_IT_BUTTON])];
  try {
    const pack = await makePack({ key: u.userId, profile: u.profile, product, hadPlan: Boolean(u.flow?.plan) });
    console.log(`[pack] ${u.userId} ${product.slug}: ${pack.files.length} posters, copy=${pack.copySource}, ${pack.ms} ms`);
    await updateDb((db) => {
      const f = db.users[u.userId].flow!;
      f.pack = {
        files: pack.files,
        copySource: pack.copySource,
        createdAt: new Date().toISOString(),
        slug: product.slug,
        codes: pack.codes,
        feedPoster: pack.feedPoster,
        igCaption: pack.igCaption,
      };
    });
    return pack.replies;
  } catch (err) {
    console.error('[pack] failed:', err);
    return [buttons(`Sorry, I could not make the posts for ${shortTitle(product.title)} just now. Tap to try again.`, [DO_IT_BUTTON])];
  }
}

export function profileText(u: User): string {
  const p = u.profile;
  if (!p.answers) return 'No shop profile yet. Type /start.';
  const a = p.answers;
  return [
    'Your shop profile:',
    `Sells: ${p.sells ?? '-'}${p.shopName ? ` (${p.shopName})` : ''}`,
    `City: ${p.city ?? '-'}`,
    `Sells on: ${a.q2?.join(', ') ?? '-'}`,
    `Ads before: ${a.q3 ?? '-'}`,
    `Stops posting: ${a.q4 ?? '-'}`,
    `Piece: ${p.product ? shortTitle(p.product.title) : '-'}`,
    ...(p.defaultsUsed ? ['(Some answers were filled by "Do it for me".)'] : []),
  ].join('\n');
}

// ---- entry point -------------------------------------------------------------------------------

export async function runFlow(msg: Inbound): Promise<Reply[]> {
  const text = msg.text?.trim() ?? '';
  // "Post to Instagram" after the pack: the feed poster + its caption through Zernio (postToInstagramAction.js).
  if (msg.button === 'post_instagram') {
    return postFeedToInstagram(msg.userId);
  }
  if (isCommand(text, 'nudge')) return nudgeReplies(msg.userId);
  if (isCommand(text, 'report')) {
    const u = readDb().users[msg.userId];
    const report = await buildReport(u);
    console.log(`[report] /report for ${msg.userId}: ${report.total} click${report.total === 1 ? '' : 's'}`);
    return report.replies;
  }
  // M5: typed text (any language), a voice-note transcript or a photo during onboarding goes to Claude Haiku first.
  let fields: Fields | undefined;
  let pickChat: Promise<Reply[] | undefined> | undefined;
  const before = readDb().users[msg.userId];
  const onboarding = before?.flow && ['q1', 'q1_city', 'q2', 'q3', 'q4', 'pick', 'photo_line'].includes(before.flow.step);
  const freeForm = !msg.button && ((text && !text.startsWith('/') && !HELP_RE.test(text)) || msg.photoPath);
  if (onboarding && freeForm && understandingOn() && !(before.flow!.step === 'photo_line' && !msg.photoPath)) {
    // A typed question at the pick ("which one will sell best?") deserves an answer, not "tap a button": ask both at once.
    if (before.flow!.step === 'pick' && !msg.photoPath && chatOn()) pickChat = chatReply(before, text);
    fields = await understand(before.profile, { text, photoPath: msg.photoPath }, [Q1, Q2, Q3, Q4, PICK_Q].map((q) => q.split('\n').at(-1)!));
    if (fields) console.log(`[understand] ${msg.userId}: ${Object.keys(fields).filter((k) => k !== 'followUp' && k !== 'language').join(', ') || 'nothing new'} (${fields.language ?? '?'})`);
  }
  const useFields = fields && Object.keys(fields).some((k) => k !== 'followUp' && k !== 'language');

  // The model read the message and found no answer in it (a greeting, a question).
  if (fields && !useFields) {
    const at = before.flow!.step;
    if (at === 'q1' || at === 'q1_city') {
      // Ask again; never guess that "hello" is what they sell.
      const ask = fields.followUp && FIELD_STEP[fields.followUp.field] === at ? fields.followUp.text : NEXT_STEP[at][0];
      return at === 'q1' ? [buttons(ask, Q1_BUTTONS)] : [{ kind: 'text', text: ask }];
    }
    const said = at === 'pick' ? (await pickChat)?.[0] : undefined;
    const pick = pickReply(before.profile);
    if (said && (said.kind === 'text' || said.kind === 'buttons') && pick.kind === 'buttons') return [buttons(said.text, pick.buttons)];
  }

  // After onboarding (plan or posts made): free text or a voice note is a chat, answered by Haiku.
  const afterOnboarding = before?.flow && ['plan', 'pack'].includes(before.flow.step);
  if (afterOnboarding && freeForm && !msg.photoPath && chatOn()) {
    const reply = await chatReply(before, text);
    if (reply) return reply;
  }

  const first = await updateDb((db) => {
    const u = db.users[msg.userId];
    const out = useFields ? applyFields(u, fields!, msg, text) : step({ u, msg, text });
    return { ...out, user: structuredClone(u) };
  });
  if (!first.then) return first.replies;

  if (first.then === 'pack') {
    await updateDb((db) => {
      const f = db.users[msg.userId].flow!;
      f.step = 'pack';
      f.packRequestedAt = new Date().toISOString();
    });
    return [...first.replies, ...(await packReplies(first.user))];
  }

  // Coaching plan: the model call happens outside the db queue so other chats are not held up.
  const u = first.user;
  const product = u.profile.product!;
  const timing: FestivalTiming | undefined = bestFit(product.title);
  const showNoAds = !u.flow?.noAdsNoticeShown;
  const plan = await coachingPlan({ profile: u.profile, title: product.title, price: product.price, timing }, showNoAds);
  await updateDb((db) => {
    const f = db.users[msg.userId].flow!;
    f.step = 'plan';
    f.plan = { text: plan.text, steps: plan.steps, source: plan.source, createdAt: new Date().toISOString() };
    if (u.profile.adsBefore === 'tried_no_orders') f.noAdsNoticeShown = true;
  });
  return [...first.replies, buttons(plan.text, [DO_IT_BUTTON])];
}
