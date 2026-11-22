// Web adapter: Hono app with the chat fallback at /chat. Calls the same handle() as Telegram.
import path from 'node:path';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { handle, type Reply } from '../core/handle.ts';
import { CHAT_HTML } from './chat-page.ts';

// Image replies carry a file path; the browser gets it from /c/<file> (creatives live in data/creatives/).
function forWeb(replies: Reply[]): Reply[] {
  return replies.map((r) => (r.kind === 'image' ? { ...r, path: `/c/${encodeURIComponent(path.basename(r.path))}` } : r));
}

export function webApp(): Hono {
  const app = new Hono();

  app.get('/', (c) => c.redirect('/chat'));
  app.get('/health', (c) => c.text('ok'));
  app.get('/chat', (c) => c.html(CHAT_HTML));

  app.post('/api/chat', async (c) => {
    const body = await c.req.json().catch(() => null);
    const userId = typeof body?.userId === 'string' ? body.userId.slice(0, 64) : '';
    if (!userId) return c.json({ error: 'userId required' }, 400);
    const text = typeof body.text === 'string' ? body.text.slice(0, 2000) : undefined;
    const button = typeof body.button === 'string' ? body.button.slice(0, 64) : undefined;
    if (!text && !button) return c.json({ error: 'text or button required' }, 400);

    const replies = await handle({ userId: `web:${userId}`, surface: 'web', text, button });
    return c.json({ replies: forWeb(replies) });
  });

  app.use('/c/*', serveStatic({ root: './data/creatives', rewriteRequestPath: (p) => p.replace(/^\/c/, '') }));

  return app;
}
