// Storage: one data/db.json file, read-modify-write (SPEC "Storage"). No database.
// Writes go through one queue and land via temp file + rename, so two messages at once never corrupt the file.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Surface } from './types.ts';

// Answers to the opening questions (PAINS.md). Codes drive the plan; `answers` keeps the words the owner saw.
export type SellsOn = 'shop' | 'whatsapp' | 'marketplace' | 'social';
export type AdsBefore = 'never' | 'tried_no_orders' | 'works';
export type Blocker = 'what_to_post' | 'no_time' | 'photos_bad' | 'which_app';

export type PickedProduct = {
  slug: string;
  title: string;
  source: 'amazon' | 'photo';
  asin?: string;
  image?: string; // listing image URL (Amazon products)
  photoPath?: string; // owner's own photo (local file)
  price?: number; // rupees, only when the seller stated it (code parses it, the model never sets it)
};

export type ShopProfile = {
  shopName?: string;
  sells?: string;
  city?: string;
  productSource?: 'amazon' | 'photos';
  sellsOn?: SellsOn[]; // Q2
  adsBefore?: AdsBefore; // Q3
  postingBlocker?: Blocker; // Q4
  answers?: { q1?: string; q2?: string[]; q3?: string; q4?: string };
  defaultsUsed?: boolean; // owner tapped "Do it for me" before answering everything
  product?: PickedProduct;
  answeredAt?: string;
};

// Where the owner is in the conversation, so it resumes after a restart or a page reload.
export type FlowStep = 'q1' | 'q1_city' | 'q2' | 'q3' | 'q4' | 'pick' | 'photo_line' | 'suggest' | 'plan' | 'pack';

export type Flow = {
  step: FlowStep;
  q2Draft?: SellsOn[];
  pendingPhoto?: string;
  suggestion?: { picked: string; better: string };
  plan?: { text: string; steps: unknown[]; source: 'model' | 'fallback' | 'code'; createdAt: string };
  noAdsNoticeShown?: boolean;
  packRequestedAt?: string;
  pack?: { files: string[]; copySource: 'model' | 'fallback'; createdAt: string };
};

export type User = {
  userId: string;
  surface: Surface;
  firstSeen: string;
  lastSeen: string;
  profile: ShopProfile;
  flow?: Flow;
};

export type Db = { users: Record<string, User>; clicks: unknown[] };

const DB_PATH = process.env.DB_PATH ?? 'data/db.json';
const empty = (): Db => ({ users: {}, clicks: [] });

export function readDb(): Db {
  try {
    return { ...empty(), ...JSON.parse(readFileSync(DB_PATH, 'utf8')) };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return empty();
    throw err;
  }
}

let queue: Promise<unknown> = Promise.resolve();

export function updateDb<T>(fn: (db: Db) => T): Promise<T> {
  const run = queue.then(() => {
    const db = readDb();
    const result = fn(db);
    mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const tmp = `${DB_PATH}.tmp`;
    writeFileSync(tmp, JSON.stringify(db, null, 2));
    renameSync(tmp, DB_PATH);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

export function touchUser(userId: string, surface: Surface): Promise<User> {
  return updateDb((db) => {
    const now = new Date().toISOString();
    const u = (db.users[userId] ??= { userId, surface, firstSeen: now, lastSeen: now, profile: {} });
    u.lastSeen = now;
    return u;
  });
}
