// WhatsApp-style chat page for /chat. Plain HTML + fetch, no build step.
export const CHAT_HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Shop Manager</title>
<style>
  :root { --bg:#ECE5DD; --head:#075E54; --me:#DCF8C6; --bot:#fff; --ink:#111b21; --muted:#667781; --accent:#00a884; }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body { font: 15px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ink); background: var(--bg);
         display: flex; flex-direction: column; max-width: 720px; margin: 0 auto; }
  header { background: var(--head); color: #fff; padding: 12px 16px; display: flex; gap: 10px; align-items: center; }
  header .dot { width: 36px; height: 36px; border-radius: 50%; background: var(--accent); display: grid; place-items: center; font-weight: 700; }
  header small { display: block; opacity: .8; font-size: 12px; }
  /* Says plainly what this page is. Sits under the header and stays put: only the messages scroll. */
  .banner { background: #fff3c4; color: #54450b; font-size: 12.5px; line-height: 1.35; padding: 6px 16px; text-align: center; }
  .guide { background: #f7f5f0; color: var(--muted); font-size: 12.5px; line-height: 1.35; padding: 6px 16px; text-align: center; border-bottom: 1px solid #e0dbd2; }
  .guide b { color: var(--ink); font-weight: 600; }
  #log { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 6px; }
  .msg { max-width: 85%; padding: 8px 10px; border-radius: 8px; white-space: pre-wrap; word-wrap: break-word; box-shadow: 0 1px .5px rgba(0,0,0,.13); }
  .bot { align-self: flex-start; background: var(--bot); }
  .me  { align-self: flex-end; background: var(--me); }
  .msg img { max-width: 100%; border-radius: 6px; display: block; }
  .btns { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
  .btns button { border: 0; border-top: 1px solid #e9edef; background: none; color: var(--accent); font: inherit; font-weight: 600; padding: 8px; cursor: pointer; }
  .btns button:disabled { color: var(--muted); cursor: default; }
  form { display: flex; gap: 8px; padding: 8px 16px 12px; background: #f0f2f5; }
  input { flex: 1; border: 0; border-radius: 20px; padding: 10px 14px; font: inherit; min-width: 0; }
  form button { border: 0; border-radius: 50%; width: 42px; height: 42px; background: var(--accent); color: #fff; font-size: 18px; cursor: pointer; flex: none; }
  form .attach { background: none; color: var(--muted); font-size: 22px; }
  #file { display: none; }
</style>
</head>
<body>
<header><div class="dot">S</div><div>Shop Manager<small>your marketing team</small></div></header>
<div class="banner" role="note">Simulated WhatsApp chat &middot; Shop Manager runs on Telegram today (@Shopma_bot) and WhatsApp next</div>
<div class="guide" role="note"><b>Try it:</b> tap a light &rarr; &lsquo;Let me get it done for you&rsquo; &rarr; see 3 posters + group message. You can also type or ask anything in Hindi/English.</div>
<main id="log" aria-live="polite"></main>
<form id="f" autocomplete="off">
  <button type="button" class="attach" id="attach" aria-label="Send a photo">&#128247;</button>
  <input type="file" id="file" accept="image/jpeg,image/png,image/webp">
  <input id="t" placeholder="Type a message" aria-label="Message">
  <button aria-label="Send">&#10148;</button>
</form>
<script>
  const log = document.getElementById('log');
  const input = document.getElementById('t');
  // /chat?user=demo opens the seeded demo shop (npm run seed-demo).
  let userId = new URLSearchParams(location.search).get('user');
  try { userId = userId || localStorage.getItem('sm_user'); } catch {}
  if (!userId) {
    userId = Math.random().toString(36).slice(2, 12);
    try { localStorage.setItem('sm_user', userId); } catch {}
  }

  function bubble(cls) {
    const d = document.createElement('div');
    d.className = 'msg ' + cls;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }

  // target: the bubble whose button was tapped; a reply marked edit redraws that bubble in place.
  function render(r, target) {
    const d = target || bubble('bot');
    d.textContent = '';
    if (r.kind === 'voice') {
      const a = document.createElement('audio');
      a.controls = true; a.src = r.path; a.style.maxWidth = '100%';
      d.appendChild(a);
      return;
    }
    if (r.kind === 'image') {
      const img = document.createElement('img');
      img.src = r.path; img.alt = r.caption || 'product photo';
      d.appendChild(img);
      if (r.caption) d.appendChild(document.createTextNode(r.caption));
      return;
    }
    d.appendChild(document.createTextNode(r.text));
    if (r.kind === 'buttons') {
      const box = document.createElement('div');
      box.className = 'btns';
      for (const b of r.buttons) {
        const el = document.createElement('button');
        el.textContent = b.label;
        el.onclick = () => {
          box.querySelectorAll('button').forEach((x) => (x.disabled = true));
          send({ button: b.id }, b.label, d);
        };
        box.appendChild(el);
      }
      d.appendChild(box);
    }
  }

  function showPhoto(src) {
    const d = bubble('me');
    const img = document.createElement('img');
    img.src = src; img.alt = 'your photo';
    d.appendChild(img);
  }

  async function send(payload, shown, from) {
    // Typed messages show at once; a tapped button shows only if it did not just redraw its own message.
    if (shown && !from) { bubble('me').textContent = shown; shown = ''; }
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...payload }),
      });
      const data = await res.json();
      const replies = data.replies || [{ kind: 'text', text: data.error || 'Something went wrong.' }];
      const inPlace = from && replies[0] && replies[0].edit;
      if (shown && !inPlace) bubble('me').textContent = shown;
      replies.forEach((r, i) => render(r, inPlace && i === 0 ? from : undefined));
    } catch {
      if (shown) bubble('me').textContent = shown;
      render({ kind: 'text', text: 'Could not reach the server. Try again.' });
    }
  }

  // Photo + the typed line (if any) as its caption, like Telegram.
  const file = document.getElementById('file');
  document.getElementById('attach').onclick = () => file.click();
  file.onchange = () => {
    const f = file.files && file.files[0];
    file.value = '';
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { render({ kind: 'text', text: 'That photo is too big. Under 8 MB, please.' }); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const caption = input.value.trim();
      input.value = '';
      showPhoto(reader.result);
      if (caption) bubble('me').textContent = caption;
      send(caption ? { photo: reader.result, text: caption } : { photo: reader.result });
    };
    reader.readAsDataURL(f);
  };

  document.getElementById('f').onsubmit = (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    send({ text }, text);
  };

  send({ text: '/start' });

  // The agent can message first (automatic report back): pick those up every few seconds.
  setInterval(async () => {
    try {
      const res = await fetch('/api/inbox?userId=' + encodeURIComponent(userId));
      const data = await res.json();
      (data.replies || []).forEach((r) => render(r));
    } catch {}
  }, 5000);
</script>
</body>
</html>`;
