// The one message handler. Telegram and the web chat both call handle() and only translate the replies.
import type { Inbound, Reply } from './types.ts';
import { touchUser, updateDb } from './db.ts';
import { runFlow } from './flow.ts';

export type { Inbound, Reply } from './types.ts';

// Keeps the last 10 messages (both sides, short) so free chat has context.
function remember(msg: Inbound, replies: Reply[]): Promise<void> {
  const said = msg.text?.trim() || (msg.button ? `[tapped ${msg.button}]` : msg.photoPath ? '[sent a photo]' : '');
  const answered = replies.map((r) => (r.kind === 'image' ? `[picture] ${r.caption ?? ''}` : r.kind === 'voice' ? '[voice note]' : r.text)).join(' / ');
  return updateDb((db) => {
    const u = db.users[msg.userId];
    if (!u) return;
    const h = (u.history ??= []);
    if (said) h.push({ role: 'owner', text: said.slice(0, 300) });
    if (answered) h.push({ role: 'bot', text: answered.replace(/\s+/g, ' ').slice(0, 300) });
    u.history = h.slice(-10);
  });
}

export const OOPS = 'Sorry, that did not work on my side. Please tap or send it once more.';

// Nothing in the demo path may surface a raw error: whatever breaks, the owner gets one friendly line.
export async function handle(msg: Inbound): Promise<Reply[]> {
  try {
    await touchUser(msg.userId, msg.surface);
    const replies = await runFlow(msg);
    await remember(msg, replies).catch(() => undefined);
    return replies.length ? replies : [{ kind: 'text', text: 'Got it.' }];
  } catch (err) {
    console.error(`[handle] ${msg.userId} failed:`, err);
    return [{ kind: 'text', text: OOPS }];
  }
}
