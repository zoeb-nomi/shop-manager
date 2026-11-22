// The agent-led conversation: 4 opening questions (PAINS.md), the product pick, then the coaching plan.
// One question per message, buttons over typing, resumable from db.json at every step.
import type { AdsBefore, Blocker, Flow, FlowStep, PickedProduct, SellsOn, ShopProfile, User } from './db.ts';
import { updateDb } from './db.ts';
import type { Button, Inbound, Reply } from './types.ts';
import { DEMO_SHOP, demoShopCity, loadProducts, parsePrice, productBySlug, shortTitle } from './products.ts';
import { judgePick, phrase, rankTitles, bestFit, type FestivalTiming } from './festivals.ts';
import { coachingPlan, DO_IT_BUTTON, PHOTO_LINE, STATUS_HINT, WHATSAPP_WARNING } from './coaching.ts';
import { makePack } from '../creative/pack.ts';

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
const PHOTO_Q = 'Send a photo of the piece, with one line: what it is and the price.';
const PHOTO_LINE_Q = 'Nice photo. Now one line: what is it, and the price?';

const HELP_BUTTON: Button = { id: 'do_it_for_me', label: 'Do it for me' };

// ---- prompts for each step (also used to resume) -----------------------------------------------

const buttons = (text: string, b: Button[], edit?: boolean): Reply => ({ kind: 'buttons', text, buttons: b, ...(edit ? { edit } : {}) });

function q2Reply(draft: SellsOn[], edit = false, note?: string): Reply {
  const b = Q2_OPTIONS.map((o) => ({ id: `q2:${o.code}`, label: `${draft.includes(o.code) ? '✅ ' : ''}${o.label}` }));
  b.push({ id: 'q2:done', label: 'Done' });
  return buttons(`${Q2}\n${note ?? Q2_HINT}`, b, edit);
}

const q3Reply = (lead = ''): Reply => buttons(lead + Q3, Q3_OPTIONS.map((o) => ({ id: `q3:${o.code}`, label: o.label })));
const q4Reply = (lead = ''): Reply => buttons(lead + Q4, Q4_OPTIONS.map((o) => ({ id: `q4:${o.code}`, label: o.label })));

function pickReply(p: ShopProfile, lead = ''): Reply {
  if (p.productSource === 'photos') return buttons(lead + PHOTO_Q, [{ id: 'pick:list', label: 'Use my Amazon products' }]);
  const b = loadProducts().map((x) => ({ id: `pick:${x.slug}`, label: shortTitle(x.title) }));
  b.push({ id: 'pick:photo', label: "I'll send a photo" });
  return buttons(lead + PICK_Q, b);
}

function suggestReply(flow: Flow): Reply[] {
  const s = flow.suggestion;
  const better = s && productBySlug(s.better);
  const picked = s && productBySlug(s.picked);
  if (!better || !picked) return [pickReply({})];
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
    case 'suggest': return suggestReply(flow);
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
          return { replies: [q2Reply([], false, `${got}, ${city}.\n\n${Q2_HINT}`)] };
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
      flow.step = 'q2';
      flow.q2Draft = [];
      return { replies: [q2Reply([], false, `Got it: ${sells}, ${city}.\n\n${Q2_HINT}`)] };
    }

    case 'q1_city': {
      if (!text) return { replies: promptFor(u) };
      p.city = text.trim().replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 60);
      p.answers = { ...p.answers, q1: p.answers?.q1 ? `${p.answers.q1}, ${p.city}` : p.city };
      flow.step = 'q2';
      flow.q2Draft = [];
      return { replies: [q2Reply([], false, `Got it: ${p.sells ?? 'your shop'}, ${p.city}.\n\n${Q2_HINT}`)] };
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
      flow.step = 'q3';
      return { replies: [q3Reply()] };
    }

    case 'q3': {
      const code = btn.startsWith('q3:') ? Q3_OPTIONS.find((o) => `q3:${o.code}` === btn)?.code : matchOption(text, Q3_OPTIONS);
      if (!code) return { replies: promptFor(u, 'Please tap one: ') };
      p.adsBefore = code;
      p.answers = { ...p.answers, q3: Q3_OPTIONS.find((o) => o.code === code)!.label };
      flow.step = 'q4';
      return { replies: [q4Reply()] };
    }

    case 'q4': {
      const code = btn.startsWith('q4:') ? Q4_OPTIONS.find((o) => `q4:${o.code}` === btn)?.code : matchOption(text, Q4_OPTIONS);
      if (!code) return { replies: promptFor(u, 'Please tap one: ') };
      p.postingBlocker = code;
      p.answers = { ...p.answers, q4: Q4_OPTIONS.find((o) => o.code === code)!.label };
      p.answeredAt = now();
      flow.step = 'pick';
      return { replies: [pickReply(p, 'Thanks, I know your shop now.\n\n')] };
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

function ownPhoto(photoPath: string, line: string): PickedProduct {
  const price = parsePrice(line);
  return { slug: `photo-${Date.now().toString(36)}`, title: line.trim().slice(0, 140), source: 'photo', photoPath, ...(price ? { price } : {}) };
}

// The owner picked a piece: agree (naming the festival and days left) or suggest a better one. Ranking is in code.
function choose(u: User, product: PickedProduct): Outcome {
  const flow = u.flow!;
  u.profile.product = product;
  const listings = loadProducts();
  const verdict = judgePick(product.title, listings.map((x) => x.title));
  const name = shortTitle(product.title);
  const picture: Reply[] = product.image ? [{ kind: 'image', path: product.image, caption: name }] : [];

  if (verdict.kind === 'suggest') {
    const better = listings[verdict.betterIndex];
    flow.step = 'suggest';
    flow.suggestion = { picked: product.slug, better: better.slug };
    const text =
      `${name} sells all year, so it can wait. ${phrase(verdict.timing)}, and ${verdict.timing.festival.why}. ` +
      `Your ${shortTitle(better.title)} is the better piece to push now.`;
    return { replies: [...picture, { kind: 'text', text }, ...suggestReply(flow)] };
  }
  const why = verdict.timing
    ? `Good pick. ${phrase(verdict.timing)}, and ${verdict.timing.festival.why}. Your ${name} fits that.`
    : `Good pick. ${name} sells all year.`;
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
  if (flow.step === 'q1' || flow.step === 'q1_city') {
    if (!p.sells) Object.assign(p, DEMO_SHOP, { productSource: 'amazon' });
    flow.step = 'q1_city';
    return { replies: [{ kind: 'text', text: `I need just one thing from you. ${Q1_CITY}` }] };
  }
  if (flow.step === 'q2' || flow.step === 'q3' || flow.step === 'q4') {
    p.sellsOn ??= flow.q2Draft?.length ? [...flow.q2Draft] : ['whatsapp'];
    p.adsBefore ??= 'never';
    p.postingBlocker ??= 'no_time';
    p.defaultsUsed = true;
    p.answeredAt = new Date().toISOString();
    delete flow.q2Draft;
    flow.step = 'pick';
    return { replies: [pickReply(p, 'Done: free channels first, no ads, I make the posts.\n\n')] };
  }
  if (!p.product || flow.step === 'pick' || flow.step === 'photo_line' || flow.step === 'suggest') {
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
      f.pack = { files: pack.files, copySource: pack.copySource, createdAt: new Date().toISOString() };
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
  const first = await updateDb((db) => {
    const u = db.users[msg.userId];
    const out = step({ u, msg, text });
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
