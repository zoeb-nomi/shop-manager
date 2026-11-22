// Telegram adapter (@Shopma_bot): grammy, long polling, so no public URL is needed.
import { Bot, InlineKeyboard, InputFile, type Context } from 'grammy';
import { handle, type Reply } from '../core/handle.ts';

async function send(ctx: Context, replies: Reply[]): Promise<void> {
  for (const r of replies) {
    if (r.kind === 'text') {
      await ctx.reply(r.text);
    } else if (r.kind === 'buttons') {
      const kb = new InlineKeyboard();
      for (const b of r.buttons) kb.text(b.label, b.id).row();
      await ctx.reply(r.text, { reply_markup: kb });
    } else {
      await ctx.replyWithPhoto(new InputFile(r.path), r.caption ? { caption: r.caption } : {});
    }
  }
}

export function startTelegram(token: string): Bot {
  const bot = new Bot(token);

  bot.on('message:text', async (ctx) => {
    await send(ctx, await handle({ userId: String(ctx.from.id), surface: 'telegram', text: ctx.message.text }));
  });

  bot.on('callback_query:data', async (ctx) => {
    await ctx.answerCallbackQuery();
    await send(ctx, await handle({ userId: String(ctx.from.id), surface: 'telegram', button: ctx.callbackQuery.data }));
  });

  bot.catch((err) => console.error('[telegram] handler error:', err.error));

  // bot.start() resolves only when the bot stops, so it is not awaited.
  void bot.start({
    drop_pending_updates: true,
    onStart: (me) => console.log(`[telegram] long polling as @${me.username}`),
  }).catch((err) => console.error('[telegram] could not start:', err.message ?? err));

  return bot;
}
