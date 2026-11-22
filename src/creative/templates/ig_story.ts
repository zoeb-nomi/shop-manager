// Instagram story, 1080x1920: vertical, tap prompt, "Link in bio" or link-sticker text.
import { esc, page, photoTag, rupees, type PosterData } from './base.ts';

export const SIZE = { width: 1080, height: 1920 };

export function igStory(d: PosterData): string {
  const css = `
body{background:linear-gradient(170deg,#3a1d4f 0%,#1d1a3f 55%,#0f1027 100%);color:#fff}
.head{position:absolute;top:120px;left:0;right:0;text-align:center;font-weight:600;font-size:32px;letter-spacing:6px;text-transform:uppercase;color:var(--gold2)}
.halo{position:absolute;top:260px;left:90px;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle,rgba(246,213,142,.55),rgba(246,213,142,0) 62%)}
.frame{position:absolute;top:330px;left:190px;width:700px;height:760px;background:var(--paper);border-radius:350px 350px 40px 40px;padding:90px 60px 50px;box-shadow:0 40px 90px rgba(0,0,0,.5)}
.badge{position:absolute;top:300px;right:150px;transform:rotate(8deg);background:var(--warm);color:#fff;font-weight:800;font-size:34px;padding:14px 28px;border-radius:20px}
.text{position:absolute;top:1170px;left:90px;right:90px;text-align:center}
.text .hi{font-size:76px;font-weight:700;line-height:1.25}
.text h1{font-size:56px;font-weight:800;line-height:1.15;margin-top:14px}
.price{display:inline-block;margin-top:26px;background:#fff;color:var(--ink);font-weight:800;font-size:50px;border-radius:999px;padding:6px 34px}
.sticker{position:absolute;bottom:230px;left:50%;transform:translateX(-50%);background:#fff;color:#1d1a3f;border-radius:22px;padding:22px 44px;font-weight:700;font-size:40px;white-space:nowrap;box-shadow:0 10px 30px rgba(0,0,0,.35)}
.tap{position:absolute;bottom:120px;left:0;right:0;text-align:center;font-size:34px;color:#cfd1ec;font-weight:600}
.nophoto{display:grid;place-items:center;color:var(--ink);font-size:52px;font-weight:800;text-align:center}`;
  const body = `
<div class="head">${esc(d.brand)}</div>
<div class="halo"></div>
<div class="frame">${photoTag(d)}</div>
${d.badge ? `<div class="badge">${esc(d.badge)}</div>` : ''}
<div class="text">
  ${d.headlineHi ? `<div class="hi">${esc(d.headlineHi)}</div>` : ''}
  <h1>${esc(d.headline)}</h1>
  ${d.price ? `<span class="price">${rupees(d.price)}</span>` : ''}
</div>
<div class="sticker">🔗 ${esc(d.link ? d.storyCta : 'Link in bio')}</div>
<div class="tap">${esc(d.link ? 'Tap the sticker to order' : 'DM us to order')}</div>`;
  return page(SIZE.width, SIZE.height, css, body);
}
