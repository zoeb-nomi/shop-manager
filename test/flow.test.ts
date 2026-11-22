// Golden tests for the opening questions, product pick and coaching plan (PAINS.md, TASKS #3-5).
// Runs offline: the model is off, so the plan uses code wording. Run: npm test
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'shop-flow-'));
process.env.DB_PATH = path.join(dir, 'db.json');
process.env.VOICE_DIR = dir; // voice files made in tests stay out of data/
process.env.DEMO_DATE = '2026-11-22';
process.env.COACH_LLM = 'off';
process.env.PUBLIC_BASE_URL = 'http://test.local:8787';
process.env.REPORT_AFTER_MS = '30';
process.env.REPORT_GAP_MS = '0';

type Reply = import('../src/core/types.ts').Reply;
let handle: typeof import('../src/core/handle.ts').handle;
const rendered: { html: string; file: string; size: { width: number; height: number } }[] = [];
before(async () => {
  ({ handle } = await import('../src/core/handle.ts'));
  const { useRenderer } = await import('../src/creative/render.ts');
  useRenderer(async (html, size, file) => {
    rendered.push({ html, file, size });
    return `data/creatives/${file}`;
  });
});

let n = 0;
const newUser = () => `test:${++n}`;
const say = (userId: string, text: string) => handle({ userId, surface: 'web', text });
const tap = (userId: string, button: string) => handle({ userId, surface: 'web', button });
const last = (r: Reply[]) => r.at(-1)!;
const textOf = (r: Reply) => (r.kind === 'image' ? r.caption ?? '' : r.text);
const ids = (r: Reply) => (r.kind === 'buttons' ? r.buttons.map((b) => b.id) : []);
const db = () => JSON.parse(readFileSync(process.env.DB_PATH!, 'utf8'));

// Answers Q1-Q4 and returns the replies to Q4.
async function onboard(u: string, q2: string[], q3: string, q4: string): Promise<Reply[]> {
  await say(u, '/start');
  await say(u, 'LED wall lights, Jaipur');
  for (const c of q2) await tap(u, `q2:${c}`);
  await tap(u, 'q2:done');
  await tap(u, `q3:${q3}`);
  return tap(u, `q4:${q4}`);
}

test('the four questions come one at a time, with buttons, in PAINS order', async () => {
  const u = newUser();
  const r1 = await say(u, '/start');
  assert.match(textOf(last(r1)), /I'm your marketing team\. What do you sell, and in which city\?/);
  const r2 = await say(u, 'LED wall lights, Jaipur');
  assert.match(textOf(last(r2)), /^Where do you sell today\?/m);
  assert.deepEqual(ids(last(r2)), ['q2:shop', 'q2:whatsapp', 'q2:marketplace', 'q2:social', 'q2:done']);
  const toggled = await tap(u, 'q2:whatsapp');
  assert.equal(toggled.length, 1);
  assert.ok(last(toggled).kind === 'buttons' && last(toggled).edit, 'ticking a box edits the same message');
  assert.match(JSON.stringify(last(toggled)), /✅ WhatsApp/);
  const r3 = await tap(u, 'q2:done');
  assert.equal(textOf(last(r3)), 'Have you paid for ads before?');
  assert.deepEqual(ids(last(r3)), ['q3:never', 'q3:tried_no_orders', 'q3:works']);
  const r4 = await tap(u, 'q3:never');
  assert.equal(textOf(last(r4)), 'What stops you from posting more?');
  assert.deepEqual(ids(last(r4)), ['q4:what_to_post', 'q4:no_time', 'q4:photos_bad', 'q4:which_app']);
});

test('all four answers are stored in the shop profile in db.json', async () => {
  const u = newUser();
  await onboard(u, ['whatsapp', 'marketplace'], 'tried_no_orders', 'which_app');
  const p = db().users[u].profile;
  assert.equal(p.sells, 'LED wall lights');
  assert.equal(p.city, 'Jaipur');
  assert.deepEqual(p.sellsOn, ['whatsapp', 'marketplace']);
  assert.equal(p.adsBefore, 'tried_no_orders');
  assert.equal(p.postingBlocker, 'which_app');
  assert.deepEqual(p.answers.q2, ['WhatsApp', 'Amazon / Meesho / Flipkart']);
  assert.equal(p.answers.q3, 'Tried, got no orders');
  const r = await say(u, '/profile');
  assert.match(textOf(last(r)), /Ads before: Tried, got no orders/);
});

test('"Only my shop" clears the other ticks, and Done with nothing ticked asks again', async () => {
  const u = newUser();
  await say(u, '/start');
  await say(u, 'sarees in Surat');
  const empty = await tap(u, 'q2:done');
  assert.match(textOf(last(empty)), /Tap at least one/);
  await tap(u, 'q2:whatsapp');
  const r = await tap(u, 'q2:shop');
  assert.match(JSON.stringify(r), /✅ Only my shop/);
  assert.doesNotMatch(JSON.stringify(r), /✅ WhatsApp/);
});

test('the product pick lists products.json and names the festival with days left', async () => {
  const u = newUser();
  const r = await onboard(u, ['whatsapp'], 'never', 'no_time');
  assert.deepEqual(ids(last(r)).slice(0, 4), [
    'pick:pooja-gold-3colour-sconce', 'pick:golden-bird-sconce', 'pick:outdoor-3up2down-gate-light', 'pick:black-cage-bedside-lamp',
  ]);
  const picked = await tap(u, 'pick:golden-bird-sconce');
  assert.ok(picked.some((x) => /Christmas is in 33 days/.test(textOf(x))));
});

test('a piece that fits no festival gets a better suggestion, ranked in code', async () => {
  const u = newUser();
  await onboard(u, ['whatsapp'], 'never', 'which_app');
  const r = await tap(u, 'pick:black-cage-bedside-lamp');
  assert.ok(r.some((x) => /Christmas is in 33 days/.test(textOf(x)) && /Golden Bird/.test(textOf(x))));
  assert.deepEqual(ids(last(r)), ['swap:golden-bird-sconce', 'keep']);
  const plan = await tap(u, 'swap:golden-bird-sconce');
  assert.deepEqual(ids(last(plan)), ['do_it_for_me']);
});

test('plan: numbered steps, ends with "Let me get it done for you"; no Instagram page means no Instagram step', async () => {
  const u = newUser();
  await onboard(u, ['whatsapp', 'marketplace'], 'works', 'photos_bad');
  const r = await tap(u, 'pick:golden-bird-sconce');
  const plan = last(r);
  assert.equal(plan.kind, 'buttons');
  assert.match(textOf(plan), /^1\. /m);
  assert.match(textOf(plan), /^2\. /m);
  assert.doesNotMatch(textOf(plan).split('\n').filter((l) => /^\d\./.test(l)).join('\n'), /instagram/i);
  assert.deepEqual(plan.kind === 'buttons' && plan.buttons, [{ id: 'do_it_for_me', label: 'Let me get it done for you' }]);
  assert.match(textOf(plan), /WhatsApp may block it/);
  const pack = await tap(u, 'do_it_for_me');
  assert.ok(pack.some((x) => /Your photo is fine, I'll make it look good\./.test(textOf(x))));
});

test('golden: Q3 "Tried, got no orders" → plan has 0 paid spend and no boost line', async () => {
  const u = newUser();
  await onboard(u, ['whatsapp', 'social', 'marketplace'], 'tried_no_orders', 'photos_bad');
  const plan = textOf(last(await tap(u, 'pick:golden-bird-sconce')));
  assert.doesNotMatch(plan, /boost|sponsored|Rs\s*\d|₹/i);
  assert.match(plan, /No ads until free posts prove this piece sells\./);
  assert.equal(db().users[u].flow.plan.steps.some((s: { rs?: number }) => s.rs), false);
});

test('Q3 "Never" shows paid only as "later, only if it proves itself", capped at Rs 300', async () => {
  const u = newUser();
  await onboard(u, ['social'], 'never', 'photos_bad');
  const plan = textOf(last(await tap(u, 'pick:golden-bird-sconce')));
  assert.match(plan, /Later, only if it proves itself.*Rs 300/);
});

test('golden: Q4 "Don\'t know what to post" → next reply is the pack, not coaching text', async () => {
  const u = newUser();
  await onboard(u, ['whatsapp'], 'never', 'what_to_post');
  const r = await tap(u, 'pick:golden-bird-sconce');
  assert.ok(!r.some((x) => x.kind === 'buttons' && x.buttons.some((b) => b.id === 'do_it_for_me')), 'no coaching plan (the plan is the message with that button)');
  assert.deepEqual(ids(last(r)), ['post_instagram'], 'the pack ends with "Post to Instagram"');
  assert.ok(r.some((x) => /Your posts for Golden Bird LED Wall Light/.test(textOf(x))));
  assert.ok(r.some((x) => x.kind === 'image'), 'posters, not coaching');
  assert.equal(db().users[u].flow.step, 'pack');
});

test('Q4 "No time" → one-tap pack with the Status schedule hint, no steps', async () => {
  const u = newUser();
  await onboard(u, ['whatsapp'], 'works', 'no_time');
  const plan = last(await tap(u, 'pick:golden-bird-sconce'));
  assert.match(textOf(plan), /Post Status tonight 7 to 10 PM\./);
  assert.doesNotMatch(textOf(plan), /^1\. /m);
  assert.deepEqual(ids(plan), ['do_it_for_me']);
});

test('Q4 "Don\'t know which app" → only their channels plus one free one, never more than 3 steps', async () => {
  const u = newUser();
  await onboard(u, ['marketplace', 'social'], 'works', 'which_app');
  const plan = textOf(last(await tap(u, 'pick:golden-bird-sconce')));
  const steps = plan.split('\n').filter((l) => /^\d\. /.test(l));
  assert.ok(steps.length <= 3, plan);
  assert.equal(steps.filter((l) => /WhatsApp/i.test(l)).length, 1, 'one new free channel: Status');
  assert.doesNotMatch(plan, /local groups/);
});

test('golden: "samajh nahi aaya" → one step + "Do it for me" button', async () => {
  const u = newUser();
  await say(u, '/start');
  await say(u, 'LED wall lights, Jaipur');
  const r = await say(u, 'samajh nahi aaya');
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, 'buttons');
  assert.equal(textOf(r[0]).split(/(?<=[.?!])\s+/).length, 1, 'a single step');
  assert.deepEqual(ids(r[0]), ['do_it_for_me']);
  assert.match(textOf(r[0]), /tap kariye/, 'answers in Hinglish');
  // "Do it for me" fills the rest with free-first defaults and moves on.
  const done = await tap(u, 'do_it_for_me');
  assert.match(textOf(last(done)), /Which pieces do you have in stock/);
});

test('resumable: /start after a break returns to the open question', async () => {
  const u = newUser();
  await say(u, '/start');
  await say(u, 'LED wall lights, Jaipur');
  await tap(u, 'q2:whatsapp');
  await tap(u, 'q2:done');
  const r = await say(u, '/start');
  assert.match(textOf(r[0]), /Welcome back/);
  assert.equal(textOf(last(r)), 'Have you paid for ads before?');
});

test('DEMO_SHOP_CITY=ask: the Amazon button loads the listings and asks only for the city', async () => {
  process.env.DEMO_SHOP_CITY = 'ask';
  const u = newUser();
  await say(u, '/start');
  const r = await tap(u, 'use_amazon');
  delete process.env.DEMO_SHOP_CITY;
  assert.match(textOf(last(r)), /Got your 4 Amazon listings.*which city/i);
  const r2 = await say(u, 'Jaipur');
  assert.match(textOf(last(r2)), /Where do you sell today\?/);
  assert.equal(db().users[u].profile.shopName, 'Kashmakash Studios');
});

test('an own photo + one line is enough to pick a piece', async () => {
  const u = newUser();
  await onboard(u, ['whatsapp'], 'never', 'photos_bad');
  const offer = await tap(u, 'pick:photo');
  assert.match(textOf(last(offer)), /Your photo is fine, I'll make it look good\./);
  const ask = await handle({ userId: u, surface: 'web', photoPath: 'data/uploads/x.jpg' });
  assert.match(textOf(last(ask)), /one line/);
  const r = await say(u, 'Brass diya lamp, gift box, Rs 899');
  assert.ok(r.some((x) => /Christmas is in 33 days/.test(textOf(x))));
  assert.deepEqual(ids(last(r)), ['do_it_for_me']);
});

test("the seller's own price is read by code and allowed in the plan; other rupee amounts are not", async () => {
  const { parsePrice } = await import('../src/core/products.ts');
  const { wordsAreValid, planSteps } = await import('../src/core/coaching.ts');
  assert.equal(parsePrice('Brass diya stand, gift for pooja, Rs 650'), 650);
  assert.equal(parsePrice('Lamp ₹1,299 only'), 1299);
  assert.equal(parsePrice('Lamp 499/-'), 499);
  assert.equal(parsePrice('Golden Bird LED Wall Light, 21 cm'), undefined);
  const steps = planSteps({ sellsOn: ['whatsapp'], adsBefore: 'tried_no_orders', postingBlocker: 'photos_bad' });
  const words = (extra: string) => ({ intro: 'Hi.', steps: steps.map((_, i) => `Step ${i + 1}${i === 0 ? extra : ''}.`), offer: 'Let me get it done for you?' });
  assert.equal(wordsAreValid(words(', only Rs 650'), steps, 650), true);
  assert.equal(wordsAreValid(words(', only Rs 650'), steps), false);
  assert.equal(wordsAreValid(words(', boost for Rs 500'), steps, 650), false);
});

test('DEMO_SHOP_CITY set → "Use my Amazon products" skips the city question', async () => {
  process.env.DEMO_SHOP_CITY = 'Testpur';
  try {
    const u = newUser();
    await say(u, '/start');
    const r = await tap(u, 'use_amazon');
    assert.match(textOf(last(r)), /^Where do you sell today\?/m);
    assert.match(textOf(last(r)), /Got your 4 Amazon listings \(LED wall lights\), Testpur\./);
    assert.equal(db().users[u].profile.city, 'Testpur');
  } finally {
    delete process.env.DEMO_SHOP_CITY;
  }
});


test('M3: "Let me get it done for you" sends 3 different posters + the group message, each with an instruction', async () => {
  const u = newUser();
  await onboard(u, ['whatsapp', 'social'], 'works', 'photos_bad');
  await tap(u, 'pick:golden-bird-sconce');
  const before = rendered.length;
  const pack = await tap(u, 'do_it_for_me');
  const posters = rendered.slice(before);
  assert.deepEqual(posters.map((p) => `${p.size.width}x${p.size.height}`), ['1080x1920', '1080x1080', '1080x1920']);
  assert.equal(new Set(posters.map((p) => p.html.replace(/data:[^)"']+/g, ''))).size, 3, 'three different designs');
  const images = pack.filter((x) => x.kind === 'image');
  assert.equal(images.length, 3);
  assert.match(textOf(images[0]), /WhatsApp Status tonight, 7 to 10 PM/);
  assert.match(textOf(images[1]), /feed post/);
  assert.match(textOf(images[2]), /Instagram story/);
  assert.ok(pack.some((x) => x.kind === 'text' && /http:\/\/test\.local:8787\/r\/\w{6}$/.test(x.text)), 'group message ends with its short link');
  assert.ok(posters.every((p) => p.html.includes('₹1,299')), 'price from products.json');
  assert.ok(posters.every((p) => p.html.includes('Kashmakash Studios')));
  assert.equal(db().users[u].flow.pack.files.length, 3);
});

test('M3: "Don\'t know which app" with no Instagram gets only the WhatsApp pieces', async () => {
  const u = newUser();
  await onboard(u, ['whatsapp'], 'never', 'which_app');
  await tap(u, 'pick:golden-bird-sconce');
  const pack = await tap(u, 'do_it_for_me');
  assert.equal(pack.filter((x) => x.kind === 'image').length, 1);
  assert.ok(pack.some((x) => /local groups/.test(textOf(x))));
});

test('M3: the seller price from their one line is on the posters; an own photo has no Amazon link', async () => {
  const u = newUser();
  await onboard(u, ['whatsapp', 'social'], 'never', 'what_to_post');
  await tap(u, 'pick:photo');
  const before = rendered.length;
  const r = await handle({ userId: u, surface: 'web', photoPath: 'data/uploads/none.jpg', text: 'Brass diya stand, gift for pooja, Rs 650' });
  const posters = rendered.slice(before);
  assert.equal(posters.length, 3);
  assert.ok(posters.every((p) => p.html.includes('₹650')));
  assert.ok(r.some((x) => /Reply to this message to order\./.test(textOf(x))));
  assert.ok(r.some((x) => /WhatsApp may block it/.test(textOf(x))), 'warning when there was no plan');
});


test('the demo shop is in Pune: the Amazon button goes straight to "Where do you sell today?"', async () => {
  const u = newUser();
  await say(u, '/start');
  const r = await tap(u, 'use_amazon');
  assert.match(textOf(last(r)), /Got your 4 Amazon listings \(LED wall lights\), Pune\./);
  assert.equal(db().users[u].profile.city, 'Pune');
});

// ---- M4: short links and report back --------------------------------------------------------

const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';

async function packFor(u: string) {
  await onboard(u, ['whatsapp', 'social'], 'never', 'what_to_post');
  await tap(u, 'pick:golden-bird-sconce');
  const codes = db().users[u].flow.pack.codes as Record<string, string>;
  return codes;
}

test('M4: one short link per format, each redirecting to the product page and logged in db.json', async () => {
  const { recordClick } = await import('../src/core/links.ts');
  const u = newUser();
  const codes = await packFor(u);
  assert.deepEqual(Object.keys(codes).sort(), ['feed', 'group', 'status', 'story']);
  assert.equal(new Set(Object.values(codes)).size, 4);
  const hit = await recordClick(codes.status, { ua: PHONE, ip: '172.20.10.5', method: 'GET' });
  assert.equal(hit?.target, 'https://www.amazon.in/dp/B0HL64BTHL');
  assert.equal(hit?.counted, true);
  const logged = db().clicks.filter((c: { code: string }) => c.code === codes.status);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].format, 'status');
  assert.equal(await recordClick('nope00', { ua: PHONE }), undefined);
});

test('M4: link previews, HEAD requests and quick repeats are logged but not counted', async () => {
  const { recordClick } = await import('../src/core/links.ts');
  const u = newUser();
  const codes = await packFor(u);
  assert.equal((await recordClick(codes.group, { ua: 'TelegramBot (like TwitterBot)', method: 'GET' }))?.counted, false);
  assert.equal((await recordClick(codes.group, { ua: 'WhatsApp/2.24.1 A', method: 'GET' }))?.counted, false);
  assert.equal((await recordClick(codes.group, { ua: PHONE, ip: '1.1.1.1', method: 'HEAD' }))?.counted, false);
  assert.equal((await recordClick(codes.group, { ua: PHONE, ip: '1.1.1.1', method: 'GET' }))?.counted, true);
  assert.equal((await recordClick(codes.group, { ua: PHONE, ip: '1.1.1.1', method: 'GET' }))?.counted, false, 'repeat');
  assert.equal((await recordClick(codes.group, { ua: PHONE, ip: '1.1.1.2', method: 'GET' }))?.counted, true, 'another phone');
});

test('M4: /report counts clicks per channel in code and names what worked best', async () => {
  const { recordClick } = await import('../src/core/links.ts');
  const u = newUser();
  const empty = await say(u, '/report');
  assert.match(textOf(last(empty)), /No posts to report on yet/);
  const codes = await packFor(u);
  const none = await say(u, '/report');
  assert.match(textOf(last(none)), /no clicks yet/);
  const click = (f: string, i: number) => recordClick(codes[f], { ua: PHONE, ip: `10.0.0.${i}`, method: 'GET' });
  for (let i = 0; i < 3; i++) await click('status', i);
  await click('group', 10);
  await click('feed', 20);
  await click('story', 21);
  const r = await say(u, '/report');
  assert.equal(textOf(last(r)), 'Golden Bird LED Wall Light so far:\nStatus: 3 clicks, groups: 1, Insta: 2. Status worked best, post it again tonight, 7 to 10 PM.');
});

test('M4: best channel and sentence rules (code decides, model sentence is checked)', async () => {
  const { best, sentenceIsValid, countsLine } = await import('../src/core/report.ts');
  assert.equal(best({ status: 2, groups: 2, insta: 1 }), 'status', 'tie goes to the free channel first');
  assert.equal(best({ status: 0, groups: 1, insta: 4 }), 'insta');
  assert.equal(best({ status: 0, groups: 0, insta: 0 }), undefined);
  assert.equal(countsLine({ status: 12, groups: 5, insta: 2 }), 'Status: 12 clicks, groups: 5, Insta: 2.');
  assert.equal(sentenceIsValid('Status worked best, post it again tonight, 7 to 10 PM.', 'status'), true);
  assert.equal(sentenceIsValid('Status got 50 clicks, post again.', 'status'), false, 'numbers code did not give');
  assert.equal(sentenceIsValid('Groups did well, post again tonight.', 'status'), false, 'must name the best channel');
});

test('M4: after clicks the agent reports back on its own (web: through the inbox)', async () => {
  const { recordClick } = await import('../src/core/links.ts');
  const { onCountedClick, takeOutbox } = await import('../src/core/notify.ts');
  const u = newUser();
  const codes = await packFor(u);
  await recordClick(codes.status, { ua: PHONE, ip: '10.1.0.1', method: 'GET' });
  await recordClick(codes.story, { ua: PHONE, ip: '10.1.0.1', method: 'GET' });
  onCountedClick(u);
  await new Promise((r) => setTimeout(r, 200));
  const out = await takeOutbox(u);
  assert.equal(out.length, 1);
  assert.match(textOf(out[0]), /Status: 1 click, groups: 0, Insta: 1\. Status worked best/);
  assert.deepEqual(await takeOutbox(u), [], 'handed over once');
});

test('/nudge: festival nudge as text AND a Hindi voice note saying the same, then the product buttons', async () => {
  const { useSpeaker } = await import('../src/core/voiceNote.ts');
  const u = newUser();
  await onboard(u, ['whatsapp'], 'never', 'no_time');
  await tap(u, 'pick:golden-bird-sconce'); // now at the plan; /nudge must bring the pick back
  let spoken = '';
  useSpeaker(async (text, lang) => { spoken = `${lang}|${text}`; return Buffer.from('RIFFfake'); });
  const r = await say(u, '/nudge');
  useSpeaker(undefined);
  assert.deepEqual(r.map((x) => x.kind), ['text', 'voice', 'buttons']);
  assert.match(textOf(r[0]), /Christmas is in 33 days\. Your Golden Bird LED Wall Light makes a good gift/);
  assert.match(spoken, /^hi-IN\|नमस्ते! क्रिसमस में 33 दिन बाकी हैं। आपकी Golden Bird LED Wall Light एक अच्छा गिफ़्ट है।/);
  assert.ok(r[1].kind === 'voice' && /voice-\w+\.(ogg|wav)$/.test(r[1].path));
  assert.deepEqual(ids(r[2]).slice(0, 4).map((i) => i.split(':')[0]), ['pick', 'pick', 'pick', 'pick']);
  assert.equal(db().users[u].flow.step, 'pick');
  // No voice available (no key, provider down): the text and buttons still go out.
  const r2 = await say(u, '/nudge');
  assert.deepEqual(r2.map((x) => x.kind), ['text', 'buttons']);
});

test('fix: a second "Post to Instagram" tap says "Already posted ✅" with the link, never an error', async () => {
  const { updateDb } = await import('../src/core/db.ts');
  const u = newUser();
  await packFor(u);
  await updateDb((d) => {
    d.users[u].flow!.pack!.instagram = { at: new Date().toISOString(), result: 'posted', postId: 'p1', url: 'https://www.instagram.com/p/TEST/' };
  });
  const r = await tap(u, 'post_instagram');
  assert.equal(textOf(last(r)), 'Already posted ✅ https://www.instagram.com/p/TEST/');
});

test('fix: /report counts clicks across all of the owner\'s packs', async () => {
  const { recordClick } = await import('../src/core/links.ts');
  const u = newUser();
  const first = await packFor(u);
  await recordClick(first.status, { ua: PHONE, ip: '10.9.0.1', method: 'GET' });
  await tap(u, 'do_it_for_me'); // a second pack for the same piece: new links
  const second = db().users[u].flow.pack.codes as Record<string, string>;
  assert.notEqual(second.status, first.status);
  await recordClick(second.story, { ua: PHONE, ip: '10.9.0.2', method: 'GET' });
  const r = await say(u, '/report');
  assert.match(textOf(last(r)), /Status: 1 click, groups: 0, Insta: 1\./);
});
