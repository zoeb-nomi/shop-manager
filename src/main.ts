// One process: Hono web server on 8787 (web chat, health) + the Telegram bot (long polling).
// Keys come from .env (npm start loads it with node --env-file-if-exists).
import { mkdirSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { webApp } from './adapters/web.ts';
import { startTelegram } from './adapters/telegram.ts';
import { closeRenderer, warmRenderer } from './creative/render.ts';
import { baseUrl } from './core/links.ts';

const port = Number(process.env.PORT ?? 8787);
mkdirSync('data/creatives', { recursive: true });

serve({ fetch: webApp().fetch, port }, (info) => {
  console.log(`[web] http://localhost:${info.port}/chat`);
  console.log(`[links] short links start with ${baseUrl()}/r/`);
});

if (process.env.RENDER_WARM !== 'off') warmRenderer();

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = token ? startTelegram(token) : undefined;
if (!bot) console.warn('[telegram] TELEGRAM_BOT_TOKEN is not set; running the web chat only.');

// Ctrl-C: stop polling and close Chrome, then exit for sure (port 8787 must be free for the next start).
const stop = () => {
  setTimeout(() => process.exit(0), 3000).unref();
  void Promise.allSettled([bot?.stop(), closeRenderer()]).then(() => process.exit(0));
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
