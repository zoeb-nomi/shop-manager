// WhatsApp Status, 1080x1920: big photo, one line, "Reply to order", phone number.
import { esc, page, photoTag, rupees, type PosterData } from './base.ts';

export const SIZE = { width: 1080, height: 1920 };

export function waStatus(d: PosterData): string {
  const css = `
body{background:var(--cream)}
.top{position:absolute;top:70px;left:80px;right:80px;display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:34px;letter-spacing:.5px;color:var(--ink2)}
.badge{background:var(--ink);color:var(--gold2);border-radius:999px;padding:14px 30px;font-size:32px;font-weight:700}
.card{position:absolute;top:190px;left:70px;width:940px;height:940px;background:var(--paper);border-radius:48px;padding:50px;box-shadow:0 30px 80px rgba(22,24,47,.18)}
.line{position:absolute;top:1130px;bottom:300px;left:80px;right:80px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;font-weight:800;font-size:84px;line-height:1.12;letter-spacing:-1px}
.price{display:inline-block;margin-top:34px;background:var(--gold);color:var(--ink);font-weight:800;font-size:60px;border-radius:24px;padding:8px 34px}
.bar{position:absolute;bottom:0;left:0;right:0;height:300px;background:var(--ink);color:#fff;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:12px}
.bar b{font-size:78px;font-weight:800;color:var(--gold)}
.bar span{font-size:46px;font-weight:600;letter-spacing:1px}
.nophoto{display:grid;place-items:center;font-size:70px;font-weight:800;text-align:center}`;
  const body = `
<div class="top"><span>${esc(d.brand)}</span>${d.badge ? `<span class="badge">${esc(d.badge)}</span>` : ''}</div>
<div class="card">${photoTag(d)}</div>
<div class="line"><div>${esc(d.statusLine)}</div>${d.price ? `<span class="price">${rupees(d.price)}</span>` : ''}</div>
<div class="bar"><b>Reply to order</b>${d.phone ? `<span>${esc(d.phone)}</span>` : ''}</div>`;
  return page(SIZE.width, SIZE.height, css, body);
}
