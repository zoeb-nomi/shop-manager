// One process: Hono web server on 8787 (web chat, health) + the Telegram bot (long polling).
// Keys come from .env (npm start loads it with node --env-file-if-exists).
import { mkdirSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { webApp } from './adapters/web.ts';
import { startTelegram } from './adapters/telegram.ts';

const port = Number(process.env.PORT ?? 8787);
mkdirSync('data/creatives', { recursive: true });

serve({ fetch: webApp().fetch, port }, (info) => {
  console.log(`[web] http://localhost:${info.port}/chat`);
});

const token = process.env.TELEGRAM_BOT_TOKEN;
if (token) {
  const bot = startTelegram(token);
  const stop = () => { void bot.stop(); process.exit(0); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} else {
  console.warn('[telegram] TELEGRAM_BOT_TOKEN is not set; running the web chat only.');
}
