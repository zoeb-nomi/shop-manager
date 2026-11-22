// Web adapter: Hono app with the chat fallback at /chat. Calls the same handle() as Telegram.
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { handle, type Reply } from '../core/handle.ts';
import { recordClick } from '../core/links.ts';
import { onCountedClick, takeOutbox } from '../core/notify.ts';
import { CHAT_HTML } from './chat-page.ts';

const UPLOADS = 'data/uploads';
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

// Image replies carry a file path or a URL; local files reach the browser through /c/<file> (data/creatives/).
function forWeb(replies: Reply[]): Reply[] {
  return replies.map((r) =>
    r.kind === 'image' && !/^https?:\/\//.test(r.path) ? { ...r, path: `/c/${encodeURIComponent(path.basename(r.path))}` } : r,
  );
}

// The page sends a photo as a data: URL. Save it like the Telegram adapter does.
function savePhoto(dataUrl: unknown): string | undefined {
  if (typeof dataUrl !== 'string') return undefined;
  const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return undefined;
  const bytes = Buffer.from(m[2], 'base64');
  if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) return undefined;
  mkdirSync(UPLOADS, { recursive: true });
  const file = path.join(UPLOADS, `web-${randomBytes(6).toString('hex')}${PHOTO_TYPES[m[1]]}`);
  writeFileSync(file, bytes);
  return file;
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
    const photoPath = body.photo === undefined ? undefined : savePhoto(body.photo);
    if (body.photo !== undefined && !photoPath) return c.json({ error: 'photo must be a JPEG, PNG or WebP under 8 MB' }, 400);
    if (!text && !button && !photoPath) return c.json({ error: 'text, button or photo required' }, 400);

    const replies = await handle({ userId: `web:${userId}`, surface: 'web', text, button, photoPath });
    return c.json({ replies: forWeb(replies) });
  });

  // Messages the agent sends first (automatic report back); the chat page polls this.
  app.get('/api/inbox', async (c) => {
    const userId = (c.req.query('userId') ?? '').slice(0, 64);
    if (!userId) return c.json({ error: 'userId required' }, 400);
    return c.json({ replies: forWeb(await takeOutbox(`web:${userId}`)) });
  });

  // Short tracking links: log the click, then send the visitor to the product page.
  app.on(['GET', 'HEAD'], '/r/:code', async (c) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? (c.env as { incoming?: { socket?: { remoteAddress?: string } } })?.incoming?.socket?.remoteAddress;
    const hit = await recordClick(c.req.param('code'), { ua: c.req.header('user-agent'), ip, method: c.req.method });
    const ua = (c.req.header('user-agent') ?? '-').slice(0, 40);
    if (!hit) {
      console.log(`[click] unknown code ${c.req.param('code')} (${ua})`);
      return c.text('This link is not known.', 404);
    }
    console.log(`[click] ${hit.link.format} ${hit.link.code} for ${hit.link.userId}: ${hit.counted ? 'counted' : 'not counted'} (${ua})`);
    if (hit.counted) onCountedClick(hit.link.userId);
    return c.redirect(hit.target, 302);
  });

  app.use('/c/*', serveStatic({ root: './data/creatives', rewriteRequestPath: (p) => p.replace(/^\/c/, '') }));

  return app;
}
