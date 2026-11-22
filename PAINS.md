# PAINS.md: what real sellers complain about, and what the bot does about it

Added 22 Nov, ~2 PM IST. Read this after SPEC.md. It changes the opening questions (Flow steps 1-2) and adds pain-to-fix rules. Everything else in SPEC.md stands.

## Where the data came from (be honest on stage)
- 41 verbatim complaints, about 28 of them from sellers or shop owners, from public pages: Amazon Seller forums (2 threads on "ads but no sales"), Dukaan reviews (Product Hunt, AppSumo), Vyapar reviews (Capterra), Meesho supplier complaints (consumercomplaints.in), Flipkart Seller Hub (TrustRadius), WhatsApp Business pricing story (YourStory, Indian D2C founders).
- The Apify Play Store and Reddit scrape did not run: the laptop browser connection kept dropping. Play Store reviews and Reddit are the next pull (actors picked: `neatrat/google-play-store-reviews-scraper`, `trudax/reddit-scraper-lite`).
- Small sample. The Amazon forum threads may include sellers outside India. Use counts as "of the 41 we read", never as a market percentage.

## Top pains (counts out of 41; one quote can count twice)

| # | Pain | Count | Real quotes |
|---|------|------:|-------------|
| 1 | **Ads and commission eat the money, no orders come** | 14 | "amazon ko bs ads ka paisa dete raho order bhul jao" · "Wasting money on advertisements but 0 sales" · "small sellers are pushed to spend on ads just to get visibility." |
| 2 | **Nobody helps when they get stuck** (support is a bot or a ticket) | 12 | "No feature of online support, You can just create ticket and they will keep on sending automatic reply." · "There's no proper solution provided even after 1–2 hour-long phone calls" |
| 3 | **The app is too hard or breaks** (can't upload, can't log in, features fail) | 10 | "i joined supplier panel to sale online, but some reasons i were not able to upload articles" · "the WhatsApp invoice feature is broken — bills are always sent as blank files." |
| 4 | **Platform rules are a black box** (messages reclassified, broadcasts blocked, no appeal) | 3 | "Some utility messages were taken as promotional" · "we do not have an option where we can appeal for this" |
| 5 | **Switching tools costs time** | 1 | "Shifting to other platforms can be time-consuming and costly for small businesses like ours" |

**What the data did not show:** no review we reached says "too many channels" or "I don't know what to post" in those words. The closest signal is pain 1: with no guide, sellers default to the paid channel the platform pushes and lose money. Say it that way on stage: *the channel confusion shows up as wasted ad money.* Don't claim a direct quote we don't have.

## New opening questions (replace SPEC Flow steps 1-2; max 4, one at a time, buttons)
1. "I'm your marketing team. What do you sell, and in which city?" (unchanged)
2. **"Where do you sell today?"** Buttons (multi-select): Only my shop · WhatsApp · Amazon / Meesho / Flipkart · Instagram / Facebook
3. **"Have you paid for ads before?"** Buttons: Never · Tried, got no orders · Yes, it works
4. **"What stops you from posting more?"** Buttons: Don't know what to post · No time · My photos look bad · Don't know which app to use

Store all four answers in the shop profile in db.json.

## Pain-to-fix rules (code decides, model only writes the words)

| If the owner says | Pain | Bot does |
|---|---|---|
| Q3 = "Tried, got no orders" | 1 | Plan uses **free channels only** (WhatsApp Status, 2 local groups, IG story if they have a page). Paid boost is hidden until a piece gets 20+ clicks on free channels, then capped at Rs 300. Say once: "No ads until free posts prove this piece sells." |
| Q3 = "Never" | 1 | Same free-first plan; paid line shown as "later, only if it proves itself". |
| Q4 = "Don't know what to post" | 1, 3 | Skip coaching text, go straight to "Let me get it done for you" with the 4-format pack. |
| Q4 = "No time" | 5 | One-tap pack plus one instruction per format; schedule hint "Post Status tonight 7 to 10 PM". No extra questions. |
| Q4 = "My photos look bad" | 3 | Accept any phone photo; template puts it on a clean branded card. Say "Your photo is fine, I'll make it look good." |
| Q4 = "Don't know which app" | 1 | Show only the channels from Q2 plus at most one new free one, ranked by code. Never list more than 3 steps. |
| Owner types "help", "stuck", "kaise", "samajh nahi aaya" | 2 | Reply with the single next step only, in the owner's language, plus a button "Do it for me". Never a ticket, never a link to docs. |
| Plan includes WhatsApp | 4 | Use Status and personal group forwards, not paid broadcast/API promos. One-line warning: "Don't send the same offer to 100s of numbers; WhatsApp may block it." |
| Any step | 3 | One question per message, buttons over typing, photo + one line is always enough. No dashboard the owner must learn. |

## Golden tests to add (TASKS.json)
- Q3 = "Tried, got no orders" → campaign plan has 0 paid spend and no boost line.
- Q4 = "Don't know what to post" → next reply is the creative pack, not coaching text.
- "samajh nahi aaya" → reply is one step + "Do it for me" button.

## Stage line
"We read 41 real complaints from sellers on Amazon, Meesho, Flipkart, Dukaan, Vyapar and WhatsApp Business. The top three: ads eat their money with no orders, nobody helps when they get stuck, and the apps are too hard to use. So Shop Manager starts with free channels, does the work for them, and asks one simple question at a time."
