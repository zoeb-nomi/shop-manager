// Short tracking links (SPEC Flow 6): one per format, /r/:code logs the click in db.json and redirects
// to the product page. Code makes the codes and counts; nothing here is written by a model.
import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import type { Click, Link, LinkFormat } from './db.ts';
import { readDb, updateDb } from './db.ts';

export const FORMATS: LinkFormat[] = ['status', 'group', 'feed', 'story'];

// PUBLIC_BASE_URL from .env; without it, the laptop's Wi-Fi/hotspot address, so a phone on the same network can open it.
export function baseUrl(): string {
  const set = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, '');
  if (set) return set;
  const port = process.env.PORT ?? '8787';
  const nets = networkInterfaces();
  const ipv4 = (name: string) => nets[name]?.find((a) => a.family === 'IPv4' && !a.internal)?.address;
  const ip =
    ipv4('en0') ??
    ipv4('en1') ??
    Object.keys(nets).map(ipv4).find((a) => a && !a.startsWith('169.254.') && !a.startsWith('100.')) ??
    'localhost';
  return `http://${ip}:${port}`;
}

const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode(taken: Record<string, Link>): string {
  for (;;) {
    const bytes = randomBytes(6);
    const code = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
    if (!taken[code]) return code;
  }
}

// Makes one link per format for this owner and product. Returns the codes and the full URLs.
export async function createLinks(userId: string, slug: string, target: string, formats = FORMATS) {
  const codes = await updateDb((db) => {
    db.links ??= {};
    const out: Partial<Record<LinkFormat, string>> = {};
    const now = new Date().toISOString();
    for (const format of formats) {
      const code = newCode(db.links);
      db.links[code] = { code, userId, slug, format, target, createdAt: now };
      out[format] = code;
    }
    return out;
  });
  const base = baseUrl();
  const urls = Object.fromEntries(Object.entries(codes).map(([f, c]) => [f, `${base}/r/${c}`])) as Partial<Record<LinkFormat, string>>;
  return { codes, urls };
}

// Link previews (Telegram, WhatsApp, Facebook...) fetch the URL on their own; those are not people.
const BOT_UA = /bot|crawler|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|twitter|skype|embedly|headless|curl|wget|python|node-fetch|undici/i;
const REPEAT_MS = 3_000; // a double load from one phone; kept short so two people on one Wi-Fi with the same phone both count

export type ClickMeta = { ua?: string; ip?: string; method?: string };

// Logs the click and returns where to send the visitor. Repeats from the same device within 3 s and link
// previews are logged but not counted.
export async function recordClick(code: string, meta: ClickMeta): Promise<{ target: string; link: Link; counted: boolean } | undefined> {
  return updateDb((db) => {
    const link = db.links?.[code];
    if (!link) return undefined;
    const now = Date.now();
    let counted = true;
    let why: string | undefined;
    if (meta.method && meta.method !== 'GET') [counted, why] = [false, meta.method];
    else if (!meta.ua || BOT_UA.test(meta.ua)) [counted, why] = [false, 'preview or bot'];
    else if (
      db.clicks.some(
        (c) => c.code === code && c.counted && c.ip === meta.ip && c.ua === meta.ua && now - Date.parse(c.at) < REPEAT_MS,
      )
    ) [counted, why] = [false, 'repeat'];
    const click: Click = { code, userId: link.userId, format: link.format, at: new Date(now).toISOString(), ua: meta.ua?.slice(0, 200), ip: meta.ip, counted, ...(why ? { why } : {}) };
    db.clicks.push(click);
    return { target: link.target, link, counted };
  });
}

export type Counts = Record<LinkFormat, number>;

// Counted clicks per format across every pack this owner ever made, and which products those links were for.
export function countClicksForUser(userId: string): { counts: Counts; slugs: string[]; links: number } {
  const db = readDb();
  const counts: Counts = { status: 0, group: 0, feed: 0, story: 0 };
  for (const c of db.clicks ?? []) if (c.userId === userId && c.counted) counts[c.format]++;
  const mine = Object.values(db.links ?? {}).filter((l) => l.userId === userId);
  return { counts, slugs: [...new Set(mine.map((l) => l.slug))], links: mine.length };
}

// Counted clicks per format for the given codes (one pack).
export function countClicks(codes: Partial<Record<LinkFormat, string>>): Counts {
  const db = readDb();
  const byCode = new Map(Object.entries(codes).map(([f, c]) => [c, f as LinkFormat]));
  const counts: Counts = { status: 0, group: 0, feed: 0, story: 0 };
  for (const c of db.clicks ?? []) {
    const f = byCode.get(c.code);
    if (f && c.counted) counts[f]++;
  }
  return counts;
}
