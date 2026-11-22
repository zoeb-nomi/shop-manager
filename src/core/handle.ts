// The one message handler. Telegram and the web chat both call handle() and only translate the replies.
import type { Inbound, Reply } from './types.ts';
import { touchUser } from './db.ts';
import { runFlow } from './flow.ts';

export type { Inbound, Reply } from './types.ts';

export async function handle(msg: Inbound): Promise<Reply[]> {
  await touchUser(msg.userId, msg.surface);
  return runFlow(msg);
}
