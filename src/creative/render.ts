// HTML → PNG with Playwright (SPEC "Creatives"). One browser for the whole process, launched on first use.
// Uses Playwright's own Chromium when installed (npx playwright install chromium), else the laptop's Google Chrome.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';

export const CREATIVES_DIR = 'data/creatives';
let browser: Promise<Browser> | undefined;

async function launch(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch {
    return await chromium.launch({ channel: 'chrome' });
  }
}

function getBrowser(): Promise<Browser> {
  browser ??= launch().catch((err) => {
    browser = undefined;
    throw err;
  });
  return browser;
}

// Start the browser early so the first "Do it for me" is not slowed by the launch.
export function warmRenderer(): void {
  getBrowser().then(
    () => console.log('[render] browser ready'),
    (err) => console.error('[render] no browser for posters:', (err as Error).message.split('\n')[0]),
  );
}

type Render = (html: string, size: { width: number; height: number }, file: string) => Promise<string>;
let impl: Render | undefined;

// Tests swap in a fake renderer (no browser in CI or the sandbox).
export function useRenderer(fn: Render | undefined): void {
  impl = fn;
}

export function renderPng(html: string, size: { width: number; height: number }, file: string): Promise<string> {
  return (impl ?? browserRender)(html, size, file);
}

async function browserRender(html: string, size: { width: number; height: number }, file: string): Promise<string> {
  const b = await getBrowser();
  const ctx = await b.newContext({ viewport: size, deviceScaleFactor: 1 });
  try {
    const p = await ctx.newPage();
    await p.setContent(html, { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    mkdirSync(CREATIVES_DIR, { recursive: true });
    const out = path.join(CREATIVES_DIR, file);
    await p.screenshot({ path: out, type: 'png' });
    return out;
  } finally {
    await ctx.close();
  }
}

export async function closeRenderer(): Promise<void> {
  if (browser) await (await browser).close().catch(() => undefined);
  browser = undefined;
}
