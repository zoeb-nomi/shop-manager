// Storage: one data/db.json file, read-modify-write (SPEC "Storage"). No database.
// Writes go through one queue and land via temp file + rename, so two messages at once never corrupt the file.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Surface } from './types.ts';

export type User = {
  userId: string;
  surface: Surface;
  firstSeen: string;
  lastSeen: string;
  profile: Record<string, unknown>; // shop interview answers (TASKS #3)
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
