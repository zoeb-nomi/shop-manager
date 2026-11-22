# Shop Manager

**A marketing team for shops that can't afford one.** An AI agent on Telegram (and a web chat) that leads the conversation: it learns the shop, helps pick the piece that can sell most right now, tells the owner where to post it, makes the posts, and reports back which place brought the clicks.

- **Demo (web chat):** https://doctors-interviews-leave-contents.trycloudflare.com/chat?user=demo
- **Telegram:** @Shopma_bot

The demo link runs on a laptop through a Cloudflare quick tunnel, so it works only while that laptop and tunnel are up.

## What it does

1. **Learns the shop.** Four opening questions, one at a time, with buttons. The owner can also just type or send a voice note in any language (Hindi, Hinglish, English...); answered questions are skipped.
2. **Picks the piece.** From the shop's Amazon listings or the owner's own photo. Code ranks the pieces against a festival calendar ("Christmas is in 33 days").
3. **Coaches, step by step.** Free channels first (WhatsApp Status, local groups), paid only after a post proves itself, capped at Rs 300. The rules come from 41 real seller complaints (see PAINS.md).
4. **"Let me get it done for you."** Three different posters (WhatsApp Status, feed post, Instagram story) and a Hinglish group message, each with a one-line instruction. One tap posts the feed post to Instagram.
5. **Tracks and reports back.** One short link per format; `/report` and an automatic message say which place worked best.
6. **Messages first.** `/nudge` sends the festival nudge as text and as a Hindi voice note.

Code decides prices, dates, links, channels and budgets. The models only write words, and code checks what they write (no invented prices, discounts or claims). Text from the seller is treated as data, never as instructions.

## How to run

Needs Node 22+, Google Chrome (posters), and ffmpeg (voice notes).

```bash
npm install
```

Put these in `.env` (never committed):

```
ANTHROPIC_API_KEY=
TELEGRAM_BOT_TOKEN=
SARVAM_API_KEY=
ZERNIO_API_KEY=
ZERNIO_IG_ACCOUNT_ID=
PUBLIC_BASE_URL=      # public address of this server, used in the short links
PUBLIC_TUNNEL_URL=    # same address; Instagram fetches the poster from it
```

```bash
npm start
```

Then open http://localhost:8787/chat, or message the bot on Telegram. Other commands:

- `npm run seed-demo`: a fully set-up demo shop (Kashmakash Studios, Pune) for `/chat?user=demo` and the Telegram users already known.
- `npm test`: 46 offline tests (no model calls, no browser).
- `npm run web`: web chat only, no Telegram.
- In the chat: `/start`, `/nudge`, `/report`, `/profile`, `/reset`.

## Stack

- Node, TypeScript run with `tsx` (no build step), one process.
- `grammy` (Telegram, long polling) and `hono` (web chat, short links, poster files). One `handle()` behind both.
- Claude through `@anthropic-ai/sdk`: Sonnet 5.5 writes the plan, the poster copy and the report sentence; Haiku 5.5 reads free-form replies and answers chat.
- Sarvam AI for speech-to-text (voice notes in) and text-to-speech (the voice nudge).
- Playwright with Chrome renders the posters from HTML templates. Fonts are bundled.
- Zernio posts to Instagram.
- Storage is one `data/db.json` file. No database.

## Prepared before the event (before 1 PM)

No code. Only these files:

- `SPEC.md`: the build spec.
- `TASKS.json`: the task list with acceptance lines.
- `prompts/campaign_plan.md`, `prompts/coaching_plan.md`, `prompts/creative_copy.md`, `prompts/festival_nudge.md`.
- `demo-products/products.json`: titles and images from the seller's own Amazon listings (prices were added during the event).

## Made during the event (after 1 PM)

- All code (`src/`, `scripts/`, `test/`). The first commit is at 2:26 PM.
- `PAINS.md` (about 2 PM, as its first line says) and `postToInstagram.md`.
- Three more prompts (`onboarding_extract.md`, `report_back.md`, `chat_reply.md`) and one line added to `coaching_plan.md`.
- `HANDOVER.md`: build notes, including what was not checked.
