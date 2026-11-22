// Telegram adapter (@Shopma_bot): grammy, long polling, so no public URL is needed.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Api, Bot, GrammyError, InlineKeyboard, InputFile, type Context } from 'grammy';
import { handle, OOPS, type Inbound, type Reply } from '../core/handle.ts';
import { registerNotifier } from '../core/notify.ts';
import { transcribe } from './sarvam.ts';

const UPLOADS = 'data/uploads';

function keyboard(buttons: { id: string; label: string }[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const b of buttons) kb.text(b.label, b.id).row();
  return kb;
}

// No link previews: Telegram's preview fetch would also look like a click on the tracking links.
const NO_PREVIEW = { link_preview_options: { is_disabled: true } };

// The agent messaging first (automatic report back). In a private chat the chat id is the user id.
async function push(api: Api, chatId: string, replies: Reply[]): Promise<void> {
  for (const r of replies) {
    if (r.kind === 'text') await api.sendMessage(chatId, r.text, NO_PREVIEW);
    else if (r.kind === 'buttons') await api.sendMessage(chatId, r.text, { reply_markup: keyboard(r.buttons), ...NO_PREVIEW });
    else if (r.kind === 'voice') await api.sendVoice(chatId, new InputFile(r.path));
    else await api.sendPhoto(chatId, /^https?:\/\//.test(r.path) ? r.path : new InputFile(r.path), r.caption ? { caption: r.caption } : {});
  }
}

// fromButton: the update was a button tap, so a reply marked `edit` updates that message in place.
async function send(ctx: Context, replies: Reply[], fromButton = false): Promise<void> {
  for (const r of replies) {
    if (r.kind === 'text') {
      await ctx.reply(r.text, NO_PREVIEW);
    } else if (r.kind === 'buttons') {
      if (r.edit && fromButton) {
        try {
          await ctx.editMessageText(r.text, { reply_markup: keyboard(r.buttons) });
        } catch (err) {
          // Tapping fast can ask for the same text twice; Telegram rejects that and nothing needs doing.
          if (!(err instanceof GrammyError && /not modified/i.test(err.description))) throw err;
        }
      } else {
        await ctx.reply(r.text, { reply_markup: keyboard(r.buttons), ...NO_PREVIEW });
      }
    } else if (r.kind === 'voice') {
      await ctx.replyWithVoice(new InputFile(r.path));
    } else {
      const photo = /^https?:\/\//.test(r.path) ? r.path : new InputFile(r.path);
      await ctx.replyWithPhoto(photo, r.caption ? { caption: r.caption } : {});
    }
  }
}

async function run(ctx: Context, msg: Inbound, fromButton = false): Promise<void> {
  // The coaching plan can take a few seconds (model call): show "typing…" meanwhile.
  await ctx.replyWithChatAction('typing').catch(() => undefined);
  try {
    await send(ctx, await handle(msg), fromButton);
  } catch (err) {
    // A message Telegram refused (a picture it could not fetch, a too-long caption): say so plainly.
    console.error('[telegram] send failed:', err);
    await ctx.reply(OOPS).catch(() => undefined);
  }
}

export function startTelegram(token: string): Bot {
  const bot = new Bot(token);
  mkdirSync(UPLOADS, { recursive: true });
  registerNotifier('telegram', (userId, replies) => push(bot.api, userId, replies));

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

  // A voice note (M5): Sarvam speech-to-text, then the same handle() as typed text.
  bot.on(['message:voice', 'message:audio'], async (ctx) => {
    const media = ctx.message.voice ?? ctx.message.audio!;
    await ctx.replyWithChatAction('typing').catch(() => undefined);
    const file = await ctx.api.getFile(media.file_id);
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
    if (!res.ok) throw new Error(`voice download failed (${res.status})`);
    const voicePath = path.join(UPLOADS, `tg-${media.file_unique_id}${path.extname(file.file_path ?? '') || '.ogg'}`);
    writeFileSync(voicePath, Buffer.from(await res.arrayBuffer()));
    const heard = await transcribe(voicePath).catch((err) => {
      console.error('[voice] failed:', (err as Error).message);
      return undefined;
    });
    if (!heard) {
      await ctx.reply('Sorry, I could not hear that clearly. Please type it, or tap a button.');
      return;
    }
    console.log(`[voice] ${ctx.from.id} (${heard.language ?? '?'}): ${heard.text.slice(0, 80)}`);
    await ctx.reply(`I heard: "${heard.text}"`, NO_PREVIEW);
    await run(ctx, { userId: String(ctx.from.id), surface: 'telegram', text: heard.text });
  });

  bot.on('callback_query:data', async (ctx) => {
    // Telegram refuses to answer a tap on an old button ("query is too old"); the tap itself still counts.
    await ctx.answerCallbackQuery().catch(() => undefined);
    await run(ctx, { userId: String(ctx.from.id), surface: 'telegram', button: ctx.callbackQuery.data }, true);
  });

  // Anything a handler still throws (a photo or voice download, say): log it and tell the owner in one line.
  bot.catch(async (err) => {
    console.error('[telegram] handler error:', err.error);
    await err.ctx.reply(OOPS).catch(() => undefined);
  });

  // bot.start() resolves only when the bot stops, so it is not awaited.
  void bot.start({
    drop_pending_updates: true,
    onStart: (me) => console.log(`[telegram] long polling as @${me.username}`),
  }).catch((err) => console.error('[telegram] could not start:', err.message ?? err));

  return bot;
}
