// The one message handler. Telegram and the web chat both call handle() and only translate the replies.
import type { Inbound, Reply } from './types.ts';
import { touchUser } from './db.ts';
import { runFlow } from './flow.ts';

export type { Inbound, Reply } from './types.ts';

export const OOPS = 'Sorry, that did not work on my side. Please tap or send it once more.';

// Nothing in the demo path may surface a raw error: whatever breaks, the owner gets one friendly line.
export async function handle(msg: Inbound): Promise<Reply[]> {
  try {
    await touchUser(msg.userId, msg.surface);
    const replies = await runFlow(msg);
    return replies.length ? replies : [{ kind: 'text', text: 'Got it.' }];
  } catch (err) {
    console.error(`[handle] ${msg.userId} failed:`, err);
    return [{ kind: 'text', text: OOPS }];
  }
}
