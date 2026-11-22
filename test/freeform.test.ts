// M5: free-form onboarding. Any reply goes to the (here: fake) Haiku extractor; code saves the fields,
// skips answered questions and asks only for what is missing, in the owner's language.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'shop-free-')), 'db.json');
process.env.DEMO_DATE = '2026-11-22';
process.env.COACH_LLM = 'off';

const blank = { sells: null, city: null, sells_on: [], ads_before: null, posting_blocker: null, product: null, product_slug: null, price: null, language: 'hinglish', next_field: null, follow_up: null };
let answer: Record<string, unknown> = blank;
let seen: { user: string }[] = [];

const { handle } = await import('../src/core/handle.ts');
const { useExtractor } = await import('../src/core/understand.ts');
const { useRenderer } = await import('../src/creative/render.ts');
before(() => {
  useExtractor(async (req) => {
    seen.push(req);
    return { ...blank, ...answer };
  });
  useRenderer(async (_h, _s, file) => `data/creatives/${file}`);
});
after(() => useExtractor(undefined));

type Reply = import('../src/core/types.ts').Reply;
const textOf = (r: Reply) => (r.kind === 'image' ? r.caption ?? '' : r.text);
const ids = (r: Reply) => (r.kind === 'buttons' ? r.buttons.map((b) => b.id) : []);
const db = () => JSON.parse(readFileSync(process.env.DB_PATH!, 'utf8'));
let n = 0;

test('one Hinglish sentence fills 4 fields; the bot asks only the missing one, in Hinglish, with its buttons', async () => {
  const u = `free:${++n}`;
  await handle({ userId: u, surface: 'telegram', text: '/start' });
  answer = { sells: 'LED lights', city: 'pune', sells_on: ['whatsapp', 'marketplace'], ads_before: 'tried_no_orders', next_field: 'posting_blocker', follow_up: 'Zyada post karne se aapko kya rokta hai?' };
  const r = await handle({ userId: u, surface: 'telegram', text: 'Hum Pune mein LED lights bechte hain, WhatsApp aur Meesho pe. Ads try kiye par order nahi aaye' });
  assert.equal(r.length, 1);
  assert.equal(textOf(r[0]), 'Zyada post karne se aapko kya rokta hai?');
  assert.deepEqual(ids(r[0]), ['q4:what_to_post', 'q4:no_time', 'q4:photos_bad', 'q4:which_app'], 'buttons stay as shortcuts');
  const p = db().users[u].profile;
  assert.deepEqual([p.sells, p.city, p.sellsOn, p.adsBefore], ['LED lights', 'Pune', ['whatsapp', 'marketplace'], 'tried_no_orders']);
  assert.equal(db().users[u].flow.step, 'q4');
  assert.match(seen.at(-1)!.user, /ALREADY_KNOWN: \{"sells":null/);

  // Next reply names the blocker and a listing: straight to the pick verdict and the plan.
  answer = { posting_blocker: 'which_app', product: 'golden bird light', product_slug: 'golden-bird-sconce' };
  const r2 = await handle({ userId: u, surface: 'telegram', text: 'pata nahi kaunsa app, golden bird wali light bechni hai' });
  assert.ok(r2.some((x) => /Christmas is in 33 days/.test(textOf(x))));
  assert.deepEqual(ids(r2.at(-1)!), ['do_it_for_me']);
  // This shop typed its own stock, so the piece is its own, not one of the Amazon listings.
  assert.equal(db().users[u].profile.product.title, 'golden bird light');
  assert.equal(db().users[u].profile.product.source, 'photo');
});

test('a model follow-up for the wrong field is not used; the code question is', async () => {
  const u = `free:${++n}`;
  await handle({ userId: u, surface: 'web', text: '/start' });
  answer = { sells: 'sarees', next_field: 'ads_before', follow_up: 'Ads?' };
  const r = await handle({ userId: u, surface: 'web', text: 'sarees bechti hoon' });
  assert.equal(textOf(r[0]), 'And which city is your shop in?');
});

test('a price is kept only if the owner wrote that number', async () => {
  const { toFields } = await import('../src/core/understand.ts');
  assert.equal(toFields({ ...blank, price: 450 } as never, { text: 'brass diyas, Rs 450 each' }).price, 450);
  assert.equal(toFields({ ...blank, price: 999 } as never, { text: 'brass diyas' }).price, undefined);
  assert.equal(toFields({ ...blank, product_slug: 'made-up' } as never, { text: 'x' }).productSlug, undefined);
});

test('buttons skip questions a free-form reply already answered', async () => {
  const u = `free:${++n}`;
  await handle({ userId: u, surface: 'web', text: '/start' });
  answer = { sells: 'lamps', city: 'Nashik', ads_before: 'never' };
  const r = await handle({ userId: u, surface: 'web', text: 'lamps in Nashik, never did ads' });
  assert.match(textOf(r[0]), /^Where do you sell today\?/);
  await handle({ userId: u, surface: 'web', button: 'q2:whatsapp' });
  const r2 = await handle({ userId: u, surface: 'web', button: 'q2:done' });
  assert.equal(textOf(r2[0]), 'What stops you from posting more?', 'Q3 was skipped');
});

test('help words still get one step + "Do it for me" (no model call)', async () => {
  const u = `free:${++n}`;
  await handle({ userId: u, surface: 'web', text: '/start' });
  const calls = seen.length;
  const r = await handle({ userId: u, surface: 'web', text: 'samajh nahi aaya' });
  assert.deepEqual(ids(r[0]), ['do_it_for_me']);
  assert.equal(seen.length, calls);
});

test('fix: free text after onboarding goes to Haiku with the profile + last messages; a button only if code offers it', async () => {
  const { useChatModel } = await import('../src/core/chat.ts');
  const u = `free:${++n}`;
  await handle({ userId: u, surface: 'telegram', text: '/start' });
  answer = { sells: 'LED lights', city: 'Pune', sells_on: ['whatsapp'], ads_before: 'never', posting_blocker: 'photos_bad', product: 'golden bird', product_slug: 'golden-bird-sconce' };
  await handle({ userId: u, surface: 'telegram', text: 'LED lights Pune, whatsapp, no ads, photos kharab, golden bird' });
  assert.equal(db().users[u].flow.step, 'plan');

  let req: { user: string } | undefined;
  useChatModel(async (r) => { req = r; return { reply: 'Haan, aaj raat 7 se 10 baje Status daaliye. Main posts bana deta hoon. Teesri line. Chauthi line.', button: 'do_it_for_me' }; });
  const r = await handle({ userId: u, surface: 'telegram', text: 'kab post karu?' });
  assert.equal(r.length, 1);
  assert.equal(textOf(r[0]), 'Haan, aaj raat 7 se 10 baje Status daaliye. Main posts bana deta hoon.', 'two sentences at most');
  assert.deepEqual(ids(r[0]), ['do_it_for_me']);
  assert.match(req!.user, /SHOP: \{"name":null,"sells":"LED lights","city":"Pune"/);
  assert.match(req!.user, /owner: LED lights Pune, whatsapp/, 'last messages are in the prompt');
  assert.match(req!.user, /OWNER_NOW: kab post karu\?/);

  // A button the model invents, or one code does not offer now, is dropped.
  useChatModel(async () => ({ reply: 'Theek hai.', button: 'post_instagram' }));
  const r2 = await handle({ userId: u, surface: 'telegram', text: 'insta pe daal do' });
  assert.equal(r2[0].kind, 'text');
  assert.ok(db().users[u].history.length <= 10);
  useChatModel(undefined);
});


test('review: a greeting or a question is not taken as an answer; the bot asks again', async () => {
  const u = `free:${++n}`;
  await handle({ userId: u, surface: 'web', text: '/start' });
  answer = { language: 'en', next_field: 'sells', follow_up: 'What does your shop sell, and in which city?' };
  const r = await handle({ userId: u, surface: 'web', text: 'hello' });
  assert.equal(textOf(r[0]), 'What does your shop sell, and in which city?');
  assert.deepEqual(ids(r[0]), ['use_amazon', 'send_photos']);
  answer = { language: 'hinglish' };
  const r2 = await handle({ userId: u, surface: 'web', text: 'ye kya hai?' });
  assert.match(textOf(r2[0]), /type what you sell and your city/);
  const p = db().users[u].profile;
  assert.equal(p.sells, undefined);
  assert.equal(p.city, undefined);
  assert.equal(db().users[u].flow.step, 'q1');
});

test('review: a saree shop is not shown the Amazon lights and is never told to push one of them', async () => {
  const u = `free:${++n}`;
  await handle({ userId: u, surface: 'web', text: '/start' });
  answer = { sells: 'sarees', city: 'Surat', sells_on: ['shop'], ads_before: 'never', posting_blocker: 'photos_bad' };
  const r = await handle({ userId: u, surface: 'web', text: 'sarees in Surat, only my shop, no ads, photos are bad' });
  assert.match(textOf(r[0]), /Which piece could sell a lot right now\?/);
  assert.deepEqual(ids(r[0]), ['pick:list']);
  answer = { product: 'banarasi saree', price: 2500 };
  const r2 = await handle({ userId: u, surface: 'web', text: 'ek banarasi saree hai 2500 ki' });
  const all = r2.map(textOf).join('\n');
  assert.match(all, /Good pick\. Banarasi saree sells all year\./);
  assert.doesNotMatch(all, /Golden Bird|LED/);
  assert.deepEqual(ids(r2.at(-1)!), ['do_it_for_me']);
  assert.equal(db().users[u].profile.product.price, 2500);
});

test('review: the Amazon shop still gets its listings matched from free text', async () => {
  const u = `free:${++n}`;
  await handle({ userId: u, surface: 'web', text: '/start' });
  await handle({ userId: u, surface: 'web', button: 'use_amazon' });
  answer = { sells_on: ['whatsapp'], ads_before: 'never', posting_blocker: 'no_time', product: 'golden bird', product_slug: 'golden-bird-sconce' };
  const r = await handle({ userId: u, surface: 'web', text: 'whatsapp pe, ads nahi, time nahi, golden bird wali' });
  assert.equal(db().users[u].profile.product.slug, 'golden-bird-sconce');
  assert.ok(r.some((x) => /Christmas is in 33 days/.test(textOf(x))));
});

test('review: a typed question at the product pick is answered, with the pick buttons kept', async () => {
  const { useChatModel } = await import('../src/core/chat.ts');
  const u = `free:${++n}`;
  await handle({ userId: u, surface: 'web', text: '/start' });
  await handle({ userId: u, surface: 'web', button: 'use_amazon' });
  answer = { sells_on: ['whatsapp'], ads_before: 'never', posting_blocker: 'no_time' };
  await handle({ userId: u, surface: 'web', text: 'whatsapp, no ads, no time' });
  assert.equal(db().users[u].flow.step, 'pick');
  let state = '';
  useChatModel(async (req) => { state = req.user; return { reply: 'Golden Bird sabse accha rahega, Christmas 33 din mein hai.', button: null }; });
  answer = { language: 'hinglish' };
  const r = await handle({ userId: u, surface: 'web', text: 'kaunsa sabse accha bikega?' });
  useChatModel(undefined);
  assert.equal(r.length, 1);
  assert.equal(textOf(r[0]), 'Golden Bird sabse accha rahega, Christmas 33 din mein hai.');
  assert.equal(ids(r[0])[1], 'pick:golden-bird-sconce');
  assert.match(state, /"suggested_piece":"Golden Bird LED Wall Light","festival":"Christmas is in 33 days"/);
});

test('review: a chat reply never shows the prompt\'s labels or field names', async () => {
  const { useChatModel, chatReply } = await import('../src/core/chat.ts');
  const u = db().users[`free:${n}`];
  useChatModel(async () => ({ reply: 'STATE.piece abhi chuna nahi gaya hai. Mera sujhav Golden Bird hai. Teesri line.', button: null }));
  const r = await chatReply(u, 'kaunsa?');
  assert.equal(r && textOf(r[0]), 'Mera sujhav Golden Bird hai. Teesri line.');
  useChatModel(async () => ({ reply: 'The suggested_piece is null.', button: null }));
  assert.equal(await chatReply(u, 'x'), undefined, 'nothing safe to say: fall back to the usual prompt');
  useChatModel(undefined);
});
