// WhatsApp-style chat page for /chat. Plain HTML + fetch, no build step.
// It says plainly that it is a simulated chat, shows a short intro (skippable), and keeps a four-step
// journey strip up to date from the `journey` field of /api/chat.
// The page script avoids backticks, dollar-brace and backslashes, because it lives inside this template literal.
export const CHAT_HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#075E54">
<title>Shop Manager</title>
<style>
  :root { --bg:#ECE5DD; --head:#075E54; --me:#DCF8C6; --bot:#fff; --ink:#111b21; --muted:#667781; --teal:#128C7E;
          --link:#027EB5; --tick:#53BDEB; --line:#e9edef; }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body { font: 15px/1.35 -apple-system, "Segoe UI", "Helvetica Neue", Helvetica, "Noto Sans Devanagari", Arial, sans-serif;
         color: var(--ink); background: #d9dbd5; -webkit-text-size-adjust: 100%; }
  button { font: inherit; }
  #app { height: 100vh; height: 100dvh; max-width: 480px; margin: 0 auto; display: flex; flex-direction: column;
         background: var(--bg); box-shadow: 0 0 24px rgba(11,20,26,.18); position: relative; overflow: hidden; }

  /* Header: back arrow, avatar, name, status. */
  header { background: var(--head); color: #fff; padding: 8px 10px 8px 6px; display: flex; gap: 8px; align-items: center; flex: none; }
  header svg { display: block; }
  .avatar { width: 38px; height: 38px; border-radius: 50%; background: #dfe5e7; color: var(--head); display: grid; place-items: center;
            font-weight: 700; font-size: 17px; flex: none; }
  .who { flex: 1; min-width: 0; line-height: 1.2; }
  .who b { display: block; font-size: 16.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .who small { font-size: 12.5px; opacity: .85; }
  .help { border: 1.5px solid rgba(255,255,255,.75); background: none; color: #fff; width: 28px; height: 28px; border-radius: 50%;
          font-weight: 700; cursor: pointer; flex: none; padding: 0; }

  /* Says plainly what this page is. Stays put: only the messages scroll. */
  .banner { background: #FFF5C4; color: #54450b; font-size: 12px; line-height: 1.35; padding: 5px 14px; text-align: center; flex: none; }

  /* The journey: four steps, the current one marked, one line on what to do now. */
  .journey { background: #f7f8fa; border-bottom: 1px solid #dfe3e6; padding: 7px 10px 6px; flex: none; }
  .steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; list-style: none; margin: 0; padding: 0; }
  .steps li { font-size: 11px; line-height: 1.2; color: #8696a0; text-align: center; padding-top: 6px; border-top: 3px solid #d1d7db;
              white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .steps li.done { color: var(--teal); border-color: var(--teal); }
  .steps li.now { color: var(--ink); font-weight: 600; border-color: #25D366; }
  .hint { margin: 6px 2px 0; font-size: 12.5px; line-height: 1.35; color: #54656f; }
  .hint b { color: var(--ink); font-weight: 600; }
  .hint button { border: 0; background: none; color: var(--link); font-weight: 600; padding: 0; cursor: pointer; text-decoration: underline; }

  /* Messages. */
  #log { flex: 1; overflow-y: auto; padding: 8px 14px 10px; display: flex; flex-direction: column; gap: 3px;
         background-color: var(--bg);
         background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' fill='none' stroke='%23000' stroke-opacity='.045' stroke-width='1.6' stroke-linecap='round'%3E%3Ccircle cx='18' cy='20' r='7'/%3E%3Cpath d='M58 12l6 12h-12zM96 22h14M103 15v14M14 70c6-8 12 8 18 0M60 62l9 9M69 62l-9 9M98 78a7 7 0 1 0 .1 0M30 104h16M84 108l6-10 6 10'/%3E%3C/svg%3E"); }
  .day { align-self: center; background: #e1f2fb; color: #54656f; font-size: 12px; padding: 4px 10px; border-radius: 7px; margin: 2px 0 6px;
         box-shadow: 0 1px .5px rgba(11,20,26,.13); text-transform: uppercase; letter-spacing: .3px; }
  .msg { position: relative; max-width: 86%; padding: 6px 8px 5px 9px; border-radius: 7.5px; white-space: pre-wrap; overflow-wrap: anywhere;
         box-shadow: 0 1px .5px rgba(11,20,26,.13); }
  .bot { align-self: flex-start; background: var(--bot); }
  .me  { align-self: flex-end; background: var(--me); }
  .msg.tail { margin-top: 6px; }
  .bot.tail { border-top-left-radius: 0; }
  .me.tail  { border-top-right-radius: 0; }
  .msg.tail::before { content: ""; position: absolute; top: 0; width: 0; height: 0; border-style: solid; }
  .bot.tail::before { left: -8px; border-width: 0 8px 10px 0; border-color: transparent var(--bot) transparent transparent; }
  .me.tail::before  { right: -8px; border-width: 0 0 10px 8px; border-color: transparent transparent transparent var(--me); }
  .msg img { max-width: 100%; border-radius: 5px; display: block; margin: -2px -4px 4px -5px; width: calc(100% + 9px); max-width: calc(100% + 9px); }
  .msg audio { display: block; width: 240px; max-width: 100%; height: 40px; }
  .meta { float: right; margin: 5px 0 -2px 10px; font-size: 11px; line-height: 15px; color: var(--muted); white-space: nowrap; }
  .meta svg { vertical-align: -3px; margin-left: 3px; color: #8696a0; }
  .meta.read svg { color: var(--tick); }
  .btns { display: flex; flex-direction: column; margin: 7px -8px -5px -9px; clear: both; }
  .btns button { border: 0; border-top: 1px solid var(--line); background: none; color: var(--link); font-weight: 500; padding: 9px 10px;
                 cursor: pointer; text-align: center; }
  .btns button:last-child { border-radius: 0 0 7.5px 7.5px; }
  .btns button:active { background: #f5f6f6; }
  .btns button:disabled { color: #8696a0; cursor: default; }
  .typing { display: inline-flex; gap: 4px; padding: 11px 12px; }
  .typing i { width: 7px; height: 7px; border-radius: 50%; background: #9aa5ab; animation: blink 1.2s infinite both; }
  .typing i:nth-child(2) { animation-delay: .2s; }
  .typing i:nth-child(3) { animation-delay: .4s; }
  @keyframes blink { 0%, 80%, 100% { opacity: .25; } 40% { opacity: 1; } }

  /* Composer: attach, rounded field, round mic/send button. */
  form { display: flex; gap: 6px; padding: 6px 6px calc(6px + env(safe-area-inset-bottom)); align-items: flex-end; flex: none; }
  .field { flex: 1; display: flex; align-items: center; background: #fff; border-radius: 22px; padding: 0 6px 0 14px; min-width: 0;
           box-shadow: 0 1px .5px rgba(11,20,26,.13); }
  .field input[type=text] { flex: 1; border: 0; outline: 0; background: none; font: inherit; font-size: 16px; padding: 11px 0; min-width: 0; }
  .field button { border: 0; background: none; color: #54656f; width: 36px; height: 36px; display: grid; place-items: center; cursor: pointer; padding: 0; }
  #go { border: 0; border-radius: 50%; width: 46px; height: 46px; background: var(--teal); color: #fff; display: grid; place-items: center;
        cursor: pointer; flex: none; padding: 0; box-shadow: 0 1px .5px rgba(11,20,26,.2); }
  #file { display: none; }
  #go .send { display: none; }
  #go.has-text .send { display: block; }
  #go.has-text .mic { display: none; }

  .toast { position: absolute; left: 12px; right: 12px; bottom: 66px; background: #1f2c33; color: #fff; border-radius: 10px; padding: 10px 12px;
           font-size: 13.5px; line-height: 1.35; box-shadow: 0 6px 20px rgba(0,0,0,.25); display: none; z-index: 5; }
  .toast.show { display: block; }
  .toast a { color: #7fe3c8; font-weight: 600; }

  /* Intro: three cards, always skippable. */
  .intro { position: absolute; inset: 0; background: rgba(11,20,26,.55); display: none; align-items: flex-end; justify-content: center; z-index: 10; }
  .intro.show { display: flex; }
  .sheet { background: #fff; width: 100%; border-radius: 18px 18px 0 0; padding: 14px 20px calc(18px + env(safe-area-inset-bottom));
           max-height: 92%; overflow-y: auto; }
  .sheet-top { display: flex; justify-content: space-between; align-items: center; min-height: 32px; }
  .count { font-size: 12.5px; color: var(--muted); }
  .skip { border: 0; background: none; color: var(--muted); font-weight: 600; padding: 8px 2px; cursor: pointer; }
  .card { display: none; }
  .card.show { display: block; }
  .card h2 { font-size: 20px; line-height: 1.25; margin: 4px 0 8px; }
  .card p { margin: 0 0 10px; color: #3b4a54; font-size: 15px; line-height: 1.45; }
  .card ol { margin: 0 0 10px; padding: 0; list-style: none; counter-reset: s; }
  .card ol li { counter-increment: s; position: relative; padding: 0 0 10px 34px; font-size: 15px; line-height: 1.4; color: #3b4a54; }
  .card ol li::before { content: counter(s); position: absolute; left: 0; top: 0; width: 24px; height: 24px; border-radius: 50%;
                        background: #e7f7ef; color: var(--teal); font-weight: 700; font-size: 13px; display: grid; place-items: center; }
  .card ol b { color: var(--ink); }
  .note { background: #f0f2f5; border-radius: 10px; padding: 9px 12px; font-size: 13.5px; color: #54656f; line-height: 1.4; }
  .tg { display: inline-block; margin: 2px 0 10px; color: var(--link); font-weight: 600; }
  .dots { display: flex; gap: 6px; justify-content: center; margin: 14px 0 12px; }
  .dots i { width: 7px; height: 7px; border-radius: 50%; background: #d1d7db; }
  .dots i.on { background: var(--teal); }
  .nav { display: flex; gap: 10px; }
  .nav button { flex: 1; border: 0; border-radius: 24px; padding: 12px; font-weight: 600; cursor: pointer; }
  .next { background: var(--teal); color: #fff; }
  .back { background: #f0f2f5; color: var(--ink); flex: 0 0 96px !important; }
  .back[hidden] { display: none; }
  @media (prefers-reduced-motion: reduce) { .typing i { animation: none; opacity: .6; } }
</style>
</head>
<body>
<div id="app">
  <header>
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>
    <div class="avatar" aria-hidden="true">S</div>
    <div class="who"><b>Shop Manager</b><small id="status">your marketing team</small></div>
    <button class="help" id="help" type="button" aria-label="How this works">?</button>
  </header>
  <div class="banner" role="note">Simulated WhatsApp chat &middot; Shop Manager runs on Telegram today (@Shopma_bot) and WhatsApp next</div>
  <nav class="journey" aria-label="Where you are">
    <ol class="steps" id="steps">
      <li>1 Your shop</li><li>2 Pick a piece</li><li>3 Get posts</li><li>4 Post &amp; track</li>
    </ol>
    <p class="hint" id="hint" aria-live="polite"></p>
  </nav>
  <main id="log" aria-live="polite"><div class="day">Today</div></main>
  <form id="f" autocomplete="off">
    <div class="field">
      <input type="text" id="t" placeholder="Message" aria-label="Message" enterkeyhint="send">
      <button type="button" id="attach" aria-label="Send a photo">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l9-9a3.7 3.7 0 0 1 5.2 5.2l-9 9a1.8 1.8 0 0 1-2.6-2.6l8.300-8.300"/></svg>
      </button>
      <input type="file" id="file" accept="image/jpeg,image/png,image/webp">
    </div>
    <button id="go" aria-label="Send">
      <svg class="mic" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.500 11a6.500 6.500 0 0 0 13 0M12 17.500V21"/></svg>
      <svg class="send" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.400 20.400l17.500-7.500a1 1 0 0 0 0-1.800L3.400 3.600a1 1 0 0 0-1.400 1.200L4.500 12 2 19.200a1 1 0 0 0 1.400 1.200zM6.300 11L4.600 6.200 16.800 11zm0 2h10.500L4.600 17.800z"/></svg>
    </button>
  </form>
  <div class="toast" id="toast" role="status"></div>

  <div class="intro" id="intro" role="dialog" aria-modal="true" aria-labelledby="intro-title">
    <div class="sheet">
      <div class="sheet-top"><span class="count" id="count">1 of 3</span><button class="skip" id="skip" type="button">Skip</button></div>
      <section class="card show">
        <h2 id="intro-title">A marketing team for a shop that can't afford one</h2>
        <p>Shop Manager is an AI agent a shop owner chats with. It learns the shop, picks what to sell right now, makes the posts, and reports which place brought the clicks.</p>
        <div class="note">You are the shop owner here. This page is a WhatsApp-style demo; the real bot runs on Telegram today.</div>
      </section>
      <section class="card">
        <h2>What you will do, in about a minute</h2>
        <ol>
          <li><b>Your shop.</b> Four quick questions. You can skip them and use a demo shop.</li>
          <li><b>Pick a piece.</b> It tells you which one fits the next festival.</li>
          <li><b>Get posts.</b> One tap makes 3 posters and a group message.</li>
          <li><b>Post and track.</b> Each post has its own link, so it can say what worked.</li>
        </ol>
        <div class="note">The strip at the top always shows which step you are on.</div>
      </section>
      <section class="card">
        <h2>Tap, type, or talk</h2>
        <p>Tap the buttons, or type anything in Hindi, Hinglish or English and it will follow.</p>
        <p><b>On Telegram you can also use your voice:</b> send a voice note and it understands, and it can send you a spoken nudge in Hindi.</p>
        <a class="tg" href="https://t.me/Shopma_bot" target="_blank" rel="noopener">Open @Shopma_bot on Telegram</a>
      </section>
      <div class="dots" id="dots" aria-hidden="true"><i class="on"></i><i></i><i></i></div>
      <div class="nav">
        <button class="back" id="back" type="button" hidden>Back</button>
        <button class="next" id="next" type="button">Next</button>
      </div>
    </div>
  </div>
</div>
<script>
  var log = document.getElementById('log');
  var input = document.getElementById('t');
  var go = document.getElementById('go');
  var statusEl = document.getElementById('status');
  var IDLE_STATUS = 'your marketing team';
  var TELEGRAM = 'https://t.me/Shopma_bot';

  // /chat?user=demo opens the seeded demo shop (npm run seed-demo).
  var userId = new URLSearchParams(location.search).get('user');
  try { userId = userId || localStorage.getItem('sm_user'); } catch (e) {}
  if (!userId) {
    userId = Math.random().toString(36).slice(2, 12);
    try { localStorage.setItem('sm_user', userId); } catch (e) {}
  }

  // ---- messages ----------------------------------------------------------------------------------

  var TICKS = '<svg width="16" height="11" viewBox="0 0 16 11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 6l3 3 6-7.500M6 8.500l.700.700L13 1.500"/></svg>';

  function clock() {
    var d = new Date(), h = d.getHours(), m = d.getMinutes();
    return (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m + (h >= 12 ? ' pm' : ' am');
  }

  function toBottom() { log.scrollTop = log.scrollHeight; }

  // A long reply (the posts) is read from its first message: keep that one at the top while pictures load.
  // Anything else keeps the newest message in view.
  var anchor = null;
  function settle() {
    if (anchor && anchor.isConnected) log.scrollTop = Math.max(0, anchor.offsetTop - log.offsetTop - 8);
    else toBottom();
  }

  function bubble(cls) {
    var d = document.createElement('div');
    var prev = log.lastElementChild;
    d.className = 'msg ' + cls;
    if (!prev || !prev.classList.contains(cls)) d.classList.add('tail');
    log.appendChild(d);
    settle();
    return d;
  }

  function stamp(d, own) {
    var m = document.createElement('span');
    m.className = 'meta';
    m.textContent = clock();
    if (own) m.insertAdjacentHTML('beforeend', TICKS);
    d.appendChild(m);
  }

  function mine(text) {
    var d = bubble('me');
    d.appendChild(document.createTextNode(text));
    stamp(d, true);
    return d;
  }

  function markRead() {
    var all = log.querySelectorAll('.me .meta');
    for (var i = 0; i < all.length; i++) all[i].classList.add('read');
  }

  // target: the bubble whose button was tapped; a reply marked edit redraws that bubble in place.
  function render(r, target) {
    var d = target || bubble('bot');
    d.textContent = '';
    if (r.kind === 'voice') {
      var a = document.createElement('audio');
      a.controls = true; a.preload = 'metadata'; a.src = r.path;
      d.appendChild(a);
      stamp(d);
      return d;
    }
    if (r.kind === 'image') {
      var img = document.createElement('img');
      img.src = r.path; img.alt = r.caption || 'product photo';
      img.onload = settle;
      d.appendChild(img);
      if (r.caption) d.appendChild(document.createTextNode(r.caption));
      stamp(d);
      return d;
    }
    d.appendChild(document.createTextNode(r.text));
    stamp(d);
    if (r.kind === 'buttons') {
      var box = document.createElement('div');
      box.className = 'btns';
      r.buttons.forEach(function (b) {
        var el = document.createElement('button');
        el.type = 'button';
        el.textContent = b.label;
        el.onclick = function () {
          var all = box.querySelectorAll('button');
          for (var i = 0; i < all.length; i++) all[i].disabled = true;
          send({ button: b.id }, b.label, d);
        };
        box.appendChild(el);
      });
      d.appendChild(box);
    }
    settle();
    return d;
  }

  function showPhoto(src) {
    var d = bubble('me');
    var img = document.createElement('img');
    img.src = src; img.alt = 'your photo'; img.onload = settle;
    d.appendChild(img);
    stamp(d, true);
  }

  // "typing…" in the header and three dots in the chat while the bot works (posters take a few seconds).
  var waiting = 0, dots = null;
  function typing(on) {
    waiting += on ? 1 : -1;
    if (waiting > 0 && !dots) {
      dots = document.createElement('div');
      dots.className = 'msg bot typing';
      dots.setAttribute('aria-label', 'Shop Manager is typing');
      dots.innerHTML = '<i></i><i></i><i></i>';
      statusEl.textContent = 'typing…';
    }
    if (waiting > 0) { log.appendChild(dots); settle(); }
    if (waiting <= 0 && dots) { dots.remove(); dots = null; statusEl.textContent = IDLE_STATUS; waiting = 0; }
  }

  async function send(payload, shown, from) {
    // Typed messages show at once; a tapped button shows only if it did not just redraw its own message.
    anchor = null;
    if (shown && !from) { mine(shown); shown = ''; }
    typing(true);
    try {
      var res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ userId: userId }, payload)),
      });
      var data = await res.json();
      var replies = data.replies || [{ kind: 'text', text: data.error || 'Something went wrong.' }];
      var inPlace = from && replies[0] && replies[0].edit;
      typing(false);
      if (shown && !inPlace) mine(shown);
      markRead();
      replies.forEach(function (r, i) {
        var d = render(r, inPlace && i === 0 ? from : undefined);
        if (i === 0 && !inPlace && replies.length > 2) { anchor = d; settle(); }
      });
      settle();
      if (data.journey) setJourney(data.journey);
    } catch (e) {
      typing(false);
      if (shown) mine(shown);
      render({ kind: 'text', text: 'Could not reach the server. Try again.' });
    }
  }

  // ---- the journey strip -------------------------------------------------------------------------

  var HINTS = {
    1: function (j) { return '<b>Step 1 of 4.</b> Question ' + (j.question || 1) + ' of 4 about your shop: tap a button or just type. <button type="button" id="skipq">Skip the questions</button>'; },
    2: function () { return '<b>Step 2 of 4.</b> Pick the piece to sell now: tap one, or ask "which one is best?" in Hindi or English.'; },
    3: function () { return '<b>Step 3 of 4.</b> Your plan is ready. Tap "Let me get it done for you" for 3 posters + a group message.'; },
    4: function () { return '<b>Step 4 of 4.</b> Your posts are ready. Post them, then type /report to see which place brought the clicks.'; },
  };

  function setJourney(j) {
    var items = document.getElementById('steps').children;
    for (var i = 0; i < items.length; i++) {
      items[i].className = i + 1 < j.stage ? 'done' : i + 1 === j.stage ? 'now' : '';
      if (i + 1 === j.stage) items[i].setAttribute('aria-current', 'step'); else items[i].removeAttribute('aria-current');
    }
    document.getElementById('hint').innerHTML = HINTS[j.stage](j);
    var skipq = document.getElementById('skipq');
    if (skipq) skipq.onclick = function () { send({ button: 'do_it_for_me' }, 'Skip the questions'); };
  }

  // ---- composer ----------------------------------------------------------------------------------

  var toastEl = document.getElementById('toast'), toastTimer;
  function toast(html) {
    toastEl.innerHTML = html;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 6000);
  }

  function syncGo() {
    var has = input.value.trim().length > 0;
    go.classList.toggle('has-text', has);
    go.setAttribute('aria-label', has ? 'Send' : 'Voice note');
  }
  input.addEventListener('input', syncGo);

  document.getElementById('f').onsubmit = function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) {
      // The mic: voice works on Telegram, not on this page. Say so instead of doing nothing.
      toast('Voice notes work on Telegram. Type here, or <a href="' + TELEGRAM + '" target="_blank" rel="noopener">open @Shopma_bot</a> to talk to it.');
      return;
    }
    input.value = '';
    syncGo();
    send({ text: text }, text);
  };

  // Photo + the typed line (if any) as its caption, like Telegram.
  var file = document.getElementById('file');
  document.getElementById('attach').onclick = function () { file.click(); };
  file.onchange = function () {
    var f = file.files && file.files[0];
    file.value = '';
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { render({ kind: 'text', text: 'That photo is too big. Under 8 MB, please.' }); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var caption = input.value.trim();
      input.value = '';
      syncGo();
      showPhoto(reader.result);
      if (caption) mine(caption);
      send(caption ? { photo: reader.result, text: caption } : { photo: reader.result });
    };
    reader.readAsDataURL(f);
  };

  // ---- intro -------------------------------------------------------------------------------------

  var intro = document.getElementById('intro');
  var cards = intro.querySelectorAll('.card');
  var dotEls = document.getElementById('dots').children;
  var nextBtn = document.getElementById('next'), backBtn = document.getElementById('back');
  var at = 0;

  function showCard(i) {
    at = i;
    for (var k = 0; k < cards.length; k++) {
      cards[k].classList.toggle('show', k === i);
      dotEls[k].classList.toggle('on', k === i);
    }
    document.getElementById('count').textContent = (i + 1) + ' of ' + cards.length;
    backBtn.hidden = i === 0;
    nextBtn.textContent = i === cards.length - 1 ? 'Start chatting' : 'Next';
  }
  function openIntro() { showCard(0); intro.classList.add('show'); nextBtn.focus(); }
  function closeIntro() {
    intro.classList.remove('show');
    try { localStorage.setItem('sm_intro_seen', '1'); } catch (e) {}
    input.focus({ preventScroll: true });
  }
  nextBtn.onclick = function () { if (at === cards.length - 1) closeIntro(); else showCard(at + 1); };
  backBtn.onclick = function () { showCard(at - 1); };
  document.getElementById('skip').onclick = closeIntro;
  document.getElementById('help').onclick = openIntro;
  intro.onclick = function (e) { if (e.target === intro) closeIntro(); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && intro.classList.contains('show')) closeIntro(); });

  // ---- start -------------------------------------------------------------------------------------

  var seen = false;
  try { seen = localStorage.getItem('sm_intro_seen') === '1'; } catch (e) {}
  if (!seen) openIntro();
  setJourney({ stage: 1, question: 1 });
  send({ text: '/start' });

  // The agent can message first (automatic report back): pick those up every few seconds.
  setInterval(async function () {
    try {
      var res = await fetch('/api/inbox?userId=' + encodeURIComponent(userId));
      var data = await res.json();
      (data.replies || []).forEach(function (r) { render(r); });
    } catch (e) {}
  }, 5000);
</script>
</body>
</html>`;
