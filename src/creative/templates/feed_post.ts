// Feed post for Instagram / Facebook, 1080x1080: headline, benefit, price chip, festival badge.
import { esc, page, photoTag, rupees, type PosterData } from './base.ts';

export const SIZE = { width: 1080, height: 1080 };

export function feedPost(d: PosterData): string {
  const css = `
body{background:var(--ink);color:#fff}
.glow{position:absolute;left:-120px;top:120px;width:760px;height:760px;border-radius:50%;background:radial-gradient(circle,rgba(233,180,76,.45),rgba(233,180,76,0) 65%)}
.card{position:absolute;left:60px;top:150px;width:500px;height:640px;background:var(--paper);border-radius:36px;padding:34px;transform:rotate(-3deg);box-shadow:0 30px 70px rgba(0,0,0,.45)}
.col{position:absolute;left:610px;top:150px;width:420px;display:flex;flex-direction:column;gap:22px}
.badge{align-self:flex-start;background:var(--gold);color:var(--ink);border-radius:999px;padding:8px 22px;font-weight:700;font-size:24px}
h1{font-weight:800;font-size:58px;line-height:1.08;letter-spacing:-.5px;color:#fff}
.hi{font-weight:700;font-size:38px;color:var(--gold2);line-height:1.3}
p{font-size:28px;line-height:1.4;color:#d9dbee}
.price{align-self:flex-start;border:3px solid var(--gold);color:var(--gold);border-radius:18px;padding:6px 22px;font-weight:800;font-size:46px}
.foot{position:absolute;left:60px;right:60px;bottom:56px;display:flex;justify-content:space-between;font-size:26px;font-weight:600;color:#aeb2d4}
.nophoto{display:grid;place-items:center;color:var(--ink);font-size:44px;font-weight:800;text-align:center}`;
  const body = `
<div class="glow"></div>
<div class="card">${photoTag(d)}</div>
<div class="col">
  ${d.badge ? `<span class="badge">${esc(d.badge)}</span>` : ''}
  <h1>${esc(d.headline)}</h1>
  ${d.headlineHi ? `<div class="hi">${esc(d.headlineHi)}</div>` : ''}
  <p>${esc(d.benefit)}</p>
  ${d.price ? `<span class="price">${rupees(d.price)}</span>` : ''}
</div>
<div class="foot"><span>${esc(d.brand)}</span><span>DM to order</span></div>`;
  return page(SIZE.width, SIZE.height, css, body);
}
