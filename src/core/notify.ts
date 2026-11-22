// The agent messages first: an automatic report back a little while after new clicks.
// Adapters register how to reach an owner (Telegram: send a message; web: a queue the page polls).
import type { Surface } from './types.ts';
import type { Reply } from './types.ts';
import { readDb, updateDb } from './db.ts';
import { buildReport } from './report.ts';

export type Notifier = (userId: string, replies: Reply[]) => Promise<void>;
const notifiers = new Map<Surface, Notifier>();

export function registerNotifier(surface: Surface, fn: Notifier): void {
  notifiers.set(surface, fn);
}

// The web chat has no push: queue the replies on the user; /api/inbox hands them over.
registerNotifier('web', async (userId, replies) => {
  await updateDb((db) => {
    const u = db.users[userId];
    if (u) (u.outbox ??= []).push(...replies);
  });
});

const AFTER_MS = Number(process.env.REPORT_AFTER_MS ?? 60_000); // wait for the clicks to settle
const GAP_MS = Number(process.env.REPORT_GAP_MS ?? 10 * 60_000); // at most one automatic report per 10 minutes
const timers = new Map<string, NodeJS.Timeout>();
const lastTotal = new Map<string, number>();

export function onCountedClick(userId: string): void {
  clearTimeout(timers.get(userId));
  timers.set(
    userId,
    setTimeout(() => {
      timers.delete(userId);
      void autoReport(userId).catch((err) => console.error('[report] automatic report failed:', err));
    }, AFTER_MS),
  );
}

export async function autoReport(userId: string): Promise<boolean> {
  const u = readDb().users[userId];
  if (!u) return false;
  const last = u.lastAutoReportAt ? Date.parse(u.lastAutoReportAt) : 0;
  if (Date.now() - last < GAP_MS) {
    onCountedClick(userId); // try again once the gap has passed
    return false;
  }
  const report = await buildReport(u);
  if (!report.total || report.total <= (lastTotal.get(userId) ?? 0)) return false;
  const notify = notifiers.get(u.surface);
  if (!notify) return false;
  await notify(userId, report.replies);
  lastTotal.set(userId, report.total);
  await updateDb((db) => {
    if (db.users[userId]) db.users[userId].lastAutoReportAt = new Date().toISOString();
  });
  console.log(`[report] sent automatic report to ${userId} (${report.total} click${report.total === 1 ? '' : 's'})`);
  return true;
}

export async function takeOutbox(userId: string): Promise<Reply[]> {
  return updateDb((db) => {
    const u = db.users[userId];
    const out = u?.outbox ?? [];
    if (u) delete u.outbox;
    return out;
  });
}
