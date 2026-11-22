// Demo seed: a fully onboarded Kashmakash Studios profile, so /start goes straight to the Christmas nudge
// and the product pick. Seeds every Telegram user already in db.json (the demo phone) and the /chat user
// "demo" (open /chat?user=demo). Extra ids: npm run seed-demo -- <telegramUserId> ...
import { updateDb, type ShopProfile } from '../src/core/db.ts';

const profile = (): ShopProfile => ({
  shopName: 'Kashmakash Studios',
  sells: 'LED wall lights',
  city: 'Pune',
  productSource: 'amazon',
  sellsOn: ['marketplace', 'whatsapp'],
  adsBefore: 'tried_no_orders',
  postingBlocker: 'what_to_post',
  answers: {
    q1: 'LED wall lights (my Amazon products), Pune',
    q2: ['WhatsApp', 'Amazon / Meesho / Flipkart'],
    q3: 'Tried, got no orders',
    q4: "Don't know what to post",
  },
  answeredAt: new Date().toISOString(),
});

const seeded = await updateDb((db) => {
  const ids = new Set([...Object.values(db.users).filter((u) => u.surface === 'telegram').map((u) => u.userId), ...process.argv.slice(2), 'web:demo']);
  const now = new Date().toISOString();
  for (const id of ids) {
    const surface = id.startsWith('web:') ? 'web' : 'telegram';
    const u = (db.users[id] ??= { userId: id, surface, firstSeen: now, lastSeen: now, profile: {} });
    u.profile = profile();
    u.flow = { step: 'pick' };
    delete u.outbox;
  }
  return [...ids];
});
console.log(`Seeded Kashmakash Studios (Pune) for ${seeded.length} user(s): ${seeded.map((id) => (id.startsWith('web:') ? id : 'telegram user')).join(', ')}`);
