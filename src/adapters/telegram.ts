// Telegram adapter (@Shopma_bot): grammy, long polling, so no public URL is needed.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Bot, GrammyError, InlineKeyboard, InputFile, type Context } from 'grammy';
import { handle, type Inbound, type Reply } from '../core/handle.ts';

const UPLOADS = 'data/uploads';

function keyboard(buttons: { id: string; label: string }[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const b of buttons) kb.text(b.label, b.id).row();
  return kb;
}

// fromButton: the update was a button tap, so a reply marked `edit` updates that message in place.
async function send(ctx: Context, replies: Reply[], fromButton = false): Promise<void> {
  for (const r of replies) {
    if (r.kind === 'text') {
      await ctx.reply(r.text);
    } else if (r.kind === 'buttons') {
      if (r.edit && fromButton) {
        try {
          await ctx.editMessageText(r.text, { reply_markup: keyboard(r.buttons) });
        } catch (err) {
          // Tapping fast can ask for the same text twice; Telegram rejects that and nothing needs doing.
          if (!(err instanceof GrammyError && /not modified/i.test(err.description))) throw err;
        }
      } else {
        await ctx.reply(r.text, { reply_markup: keyboard(r.buttons) });
      }
    } else {
      const photo = /^https?:\/\//.test(r.path) ? r.path : new InputFile(r.path);
      await ctx.replyWithPhoto(photo, r.caption ? { caption: r.caption } : {});
    }
  }
}

async function run(ctx: Context, msg: Inbound, fromButton = false): Promise<void> {
  // The coaching plan can take a few seconds (model call): show "typing…" meanwhile.
  await ctx.replyWithChatAction('typing').catch(() => undefined);
  await send(ctx, await handle(msg), fromButton);
}

export function startTelegram(token: string): Bot {
  const bot = new Bot(token);
  mkdirSync(UPLOADS, { recursive: true });

  bot.on('message:text', (ctx) => run(ctx, { userId: String(ctx.from.id), surface: 'telegram', text: ctx.message.text }));

  // A product photo, with or without a one-line caption. Saved locally for the creative pack.
  bot.on('message:photo', async (ctx) => {
    const largest = ctx.message.photo.at(-1)!;
    const file = await ctx.api.getFile(largest.file_id);
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
    if (!res.ok) throw new Error(`photo download failed (${res.status})`);
    const ext = path.extname(file.file_path ?? '') || '.jpg';
    const photoPath = path.join(UPLOADS, `tg-${largest.file_unique_id}${ext}`);
    writeFileSync(photoPath, Buffer.from(await res.arrayBuffer()));
    await run(ctx, { userId: String(ctx.from.id), surface: 'telegram', photoPath, text: ctx.message.caption });
  });

  bot.on('callback_query:data', async (ctx) => {
    await ctx.answerCallbackQuery();
    await run(ctx, { userId: String(ctx.from.id), surface: 'telegram', button: ctx.callbackQuery.data }, true);
  });

  bot.catch((err) => console.error('[telegram] handler error:', err.error));

  // bot.start() resolves only when the bot stops, so it is not awaited.
  void bot.start({
    drop_pending_updates: true,
    onStart: (me) => console.log(`[telegram] long polling as @${me.username}`),
  }).catch((err) => console.error('[telegram] could not start:', err.message ?? err));

  return bot;
}
