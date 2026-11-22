// WhatsApp-style chat page for /chat. Plain HTML + fetch, no build step.
export const CHAT_HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Shop Manager</title>
<style>
  :root { --bg:#efeae2; --head:#075e54; --me:#d9fdd3; --bot:#fff; --ink:#111b21; --muted:#667781; --accent:#00a884; }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body { font: 15px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ink); background: var(--bg);
         display: flex; flex-direction: column; max-width: 720px; margin: 0 auto; }
  header { background: var(--head); color: #fff; padding: 12px 16px; display: flex; gap: 10px; align-items: center; }
  header .dot { width: 36px; height: 36px; border-radius: 50%; background: var(--accent); display: grid; place-items: center; font-weight: 700; }
  header small { display: block; opacity: .8; font-size: 12px; }
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
  form button { border: 0; border-radius: 50%; width: 42px; height: 42px; background: var(--accent); color: #fff; font-size: 18px; cursor: pointer; }
</style>
</head>
<body>
<header><div class="dot">S</div><div>Shop Manager<small>your marketing team</small></div></header>
<main id="log" aria-live="polite"></main>
<form id="f" autocomplete="off">
  <input id="t" placeholder="Type a message" aria-label="Message">
  <button aria-label="Send">&#10148;</button>
</form>
<script>
  const log = document.getElementById('log');
  const input = document.getElementById('t');
  let userId;
  try { userId = localStorage.getItem('sm_user'); } catch {}
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

  function render(r) {
    const d = bubble('bot');
    if (r.kind === 'image') {
      const img = document.createElement('img');
      img.src = r.path; img.alt = r.caption || 'creative';
      d.appendChild(img);
      if (r.caption) d.appendChild(document.createTextNode(r.caption));
      return;
    }
    d.textContent = r.text;
    if (r.kind === 'buttons') {
      const box = document.createElement('div');
      box.className = 'btns';
      for (const b of r.buttons) {
        const el = document.createElement('button');
        el.textContent = b.label;
        el.onclick = () => {
          box.querySelectorAll('button').forEach((x) => (x.disabled = true));
          send({ button: b.id }, b.label);
        };
        box.appendChild(el);
      }
      d.appendChild(box);
    }
  }

  async function send(payload, shown) {
    if (shown) bubble('me').textContent = shown;
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...payload }),
      });
      const data = await res.json();
      (data.replies || [{ kind: 'text', text: data.error || 'Something went wrong.' }]).forEach(render);
    } catch {
      render({ kind: 'text', text: 'Could not reach the server. Try again.' });
    }
  }

  document.getElementById('f').onsubmit = (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    send({ text }, text);
  };

  send({ text: '/start' });
</script>
</body>
</html>`;
