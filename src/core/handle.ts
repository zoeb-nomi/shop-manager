// The one message handler. Telegram and the web chat both call handle() and only translate the replies.
import type { Inbound, Reply } from './types.ts';
import { touchUser } from './db.ts';

export type { Inbound, Reply } from './types.ts';

export const INTRO =
  "Namaste! I'm your marketing team. I'll learn your shop, help you pick the pieces that can sell most, " +
  'tell you where to post them, and make the posts for you.\n\n' +
  'First question: what do you sell, and in which city?';

const START_BUTTONS = [
  { id: 'use_amazon', label: 'Use my Amazon products' },
  { id: 'send_photos', label: "I'll send photos" },
];

function intro(): Reply[] {
  return [{ kind: 'buttons', text: INTRO, buttons: START_BUTTONS }];
}

function isStart(text: string): boolean {
  // Telegram sends "/start" or "/start@Shopma_bot"; the web chat sends "/start" on first load.
  return /^\/start(@\w+)?(\s|$)/i.test(text);
}

export async function handle(msg: Inbound): Promise<Reply[]> {
  const text = msg.text?.trim() ?? '';
  await touchUser(msg.userId, msg.surface);

  if (isStart(text)) return intro();

  // Placeholder until the shop interview (TASKS #3) lands: acknowledge, never dead-end.
  if (msg.button) {
    return [{ kind: 'text', text: 'Noted. The next steps of the setup are being built; type /start to see the intro again.' }];
  }
  if (msg.photoPath) {
    return [{ kind: 'text', text: 'Got your photo. Soon I will turn it into posts for you. Type /start to begin.' }];
  }
  return [{ kind: 'text', text: 'Got it. Type /start and I will walk you through it, one question at a time.' }];
}
