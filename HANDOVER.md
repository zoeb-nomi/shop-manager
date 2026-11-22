# Handover: opening questions, product pick, coaching plan (22 Nov 2026)

Branch: `claude/onboarding-pains-questions-a4fec9`. It is built on top of the Telegram + web chat branch (`claude/telegram-web-chat-bot-522dee`), so its 2 commits come along with this work.

## Where it stands

Built, tested and committed locally on this branch (no PR, no push, per Zoeb). One check needs Zoeb's phone.

Done:
1. The 4 opening questions from PAINS.md, one per message, with buttons. "Where do you sell today?" is tick-several-then-Done; the ticks update the same message. All four answers are saved in the shop profile in `data/db.json`. `/start` resumes, `/profile` shows the answers, `/reset` starts over.
2. Product pick from `demo-products/products.json` (4 buttons + "I'll send a photo"; a photo + one line is enough). Code names the festival and the days left, and suggests a better piece when the pick fits no festival.
3. Coaching plan: code sets channels, order, times and rupees; Sonnet writes the words from `prompts/coaching_plan.md`. The plan ends with the "Let me get it done for you" button. If the model is off, slow, or breaks a rule, code writes the words instead.
4. Every PAINS pain-to-fix rule (no ads after "Tried, got no orders"; straight to the posts for "Don't know what to post"; one tap for "No time"; max 3 steps for "Don't know which app"; one step + "Do it for me" for "help / samajh nahi aaya"; the WhatsApp warning).
5. Same flow in Telegram and /chat (one handler). /chat also takes photo uploads.
6. 17 offline tests (`npm test`), including the 3 PAINS golden tests. TASKS 3, 4, 5 marked passing; task 13 added for the golden tests.

Open:
1. **Telegram on a phone is not checked.** Code typechecks, but I did not run the live bot (it would clash with the other session's bot if that one is running). Tap through once on @Shopma_bot: /start → Use my Amazon products → city → tick two boxes → Done → answer the rest → pick a light. Also send one photo.
2. **Demo shop city** (see Decisions 2).
3. **The posts themselves are not built** (TASKS 6-7). "Let me get it done for you" replies with a placeholder that says so. The pack plugs in at `packReplies()` in `src/core/flow.ts`.

## How to run

The keys are only in the original folder's `.env` (`~/Documents/HQ/shop-manager-build-pack/.env`). Copy it next to this file first, then:

```bash
npm install
```

```bash
DEMO_DATE=2026-11-22 npm start
```

Web chat only (no Telegram): `npm run web`, then open http://localhost:8787/chat. Tests: `npm test` (offline, no model calls).

## Where the code is

- `src/core/flow.ts`: the questions (word for word), every step, "Do it for me", resume, `/profile`, `/reset`.
- `src/core/coaching.ts`: which steps and rupees each profile gets (`planSteps`), the extra lines (`planNotes`), the model call and the checks on its answer.
- `src/core/festivals.ts`: festival table, days left, which product fits which festival.
- `src/core/products.ts`: loads `demo-products/products.json`; demo shop name and category.
- `src/adapters/telegram.ts`, `src/adapters/web.ts`, `src/adapters/chat-page.ts`: the two surfaces.
- `test/flow.test.ts`: the tests.

## Decisions (Zoeb, 22 Nov)

1. First message keeps "Namaste!" and the line in brackets.
2. Demo shop city: still open. The answer came through as a placeholder ("[your city]"). Setting `DEMO_SHOP_CITY=<city>` in `.env` makes "Use my Amazon products" skip the city question; without it the bot asks.
3. Demo shop: Kashmakash Studios, LED wall lights. Confirmed.
4. Festival fits (Golden Bird → Christmas, pooja sconce → wedding season, gate light → New Year, black cage → suggest Golden Bird): confirmed.
5. Added to `prompts/coaching_plan.md`: one step per STEPS_FROM_CODE item, same order, one sentence each; the seller's own price may be mentioned if PRODUCT states it. Code reads that price from the seller's line (`parsePrice`) and the plan check now allows it; any other rupee amount still falls back to code wording.
6. "Do it for me" mid-questions filling WhatsApp / never / no time: confirmed.
7. Amazon-only shops keep the Rs 300 Amazon Sponsored step after 20+ clicks: confirmed.
8. The pack placeholder stays until M3 (creative pack) replaces it.
9. One branch, committed locally. No PR and no push today.

## Notes for the next session

- Inside the Claude Code sandbox, Node needs `NODE_USE_ENV_PROXY=1` to reach the Anthropic API, and the shell cannot reach localhost (use the browser pane). Neither applies on the laptop.
- `npm install` hit a root-owned npm cache; `npm install --cache "$TMPDIR/npm-cache"` works around it.
- The repo-root `.claude/launch.json` in this worktree is a local preview config (port 8791, web chat only). It is not staged; do not commit it.
