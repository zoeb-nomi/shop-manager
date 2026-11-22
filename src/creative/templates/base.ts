// Shared pieces for the three poster templates. Each template is a different layout, not one image resized.
import { fontFaces } from '../assets.ts';

export const BRAND = 'Kashmakash Studios';

export type PosterData = {
  photo?: string; // data: URL
  headline: string;
  headlineHi: string;
  benefit: string;
  badge: string;
  statusLine: string;
  storyCta: string;
  price?: number;
  phone?: string;
  link?: string;
  brand: string;
};

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export function page(width: number, height: number, css: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaces()}
:root{--ink:#16182f;--ink2:#262a4d;--gold:#e9b44c;--gold2:#f6d58e;--cream:#fff7e8;--paper:#ffffff;--muted:#6b6f8c;--warm:#f0883e;}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${width}px;height:${height}px;overflow:hidden}
body{font-family:'Poppins','Noto Sans Devanagari',sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased}
.hi{font-family:'Noto Sans Devanagari','Poppins',sans-serif}
.photo{width:100%;height:100%;object-fit:contain;display:block}
${css}
</style></head><body>${body}</body></html>`;
}

export const photoTag = (d: PosterData) =>
  d.photo ? `<img class="photo" src="${d.photo}" alt="">` : `<div class="photo nophoto">${esc(d.headline)}</div>`;
