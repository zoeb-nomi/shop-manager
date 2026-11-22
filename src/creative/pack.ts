// "Let me get it done for you": a different design for each format, each sent with a one-line instruction
// (SPEC Flow 5). Copy from the model (checked), everything factual from code.
import type { PickedProduct, ShopProfile } from '../core/db.ts';
import type { Reply } from '../core/types.ts';
import { bestFit } from '../core/festivals.ts';
import { shortTitle } from '../core/products.ts';
import { createLinks } from '../core/links.ts';
import type { LinkFormat } from '../core/db.ts';
import { cleanSellerText, creativeCopy, LINK_TOKEN, type Copy } from './copy.ts';
import { photoDataUrl } from './assets.ts';
import { renderPng } from './render.ts';
import { BRAND, type PosterData } from './templates/base.ts';
import { waStatus, SIZE as STATUS_SIZE } from './templates/wa_status.ts';
import { feedPost, SIZE as FEED_SIZE } from './templates/feed_post.ts';
import { igStory, SIZE as STORY_SIZE } from './templates/ig_story.ts';

export const PHOTO_LINE = "Your photo is fine, I'll make it look good.";
const WHATSAPP_WARNING = "Don't send the same offer to 100s of numbers; WhatsApp may block it.";

// The product page the short links redirect to. An own photo with no listing has none, so it gets no links.
export function productPage(product: PickedProduct): string | undefined {
  return product.asin ? `https://www.amazon.in/dp/${product.asin}` : undefined;
}

export function forwardText(copy: Copy, link?: string): string {
  const tail = link ?? 'Reply to this message to order.';
  return copy.forward_text_hi_en.replace(LINK_TOKEN, tail).replace(/\s+$/, '');
}

export type Pack = {
  replies: Reply[];
  files: string[];
  copySource: 'model' | 'fallback';
  ms: number;
  codes: Partial<Record<LinkFormat, string>>;
};

export async function makePack(opts: { key: string; profile: ShopProfile; product: PickedProduct; hadPlan: boolean }): Promise<Pack> {
  const t0 = Date.now();
  const { profile: p, product } = opts;
  const timing = bestFit(product.title);
  const [{ copy, source }, photo] = await Promise.all([
    creativeCopy({ title: product.title, price: product.price, timing }),
    photoDataUrl(product).catch(() => undefined),
  ]);
  // One short link per format (/r/:code), so the report can tell which place brought the clicks.
  const page = productPage(product);
  const { codes, urls } = page ? await createLinks(opts.key, product.slug, page) : { codes: {}, urls: {} as Partial<Record<LinkFormat, string>> };
  const link = urls.story;
  const data: PosterData = {
    photo,
    headline: copy.headline_en,
    headlineHi: copy.headline_hi,
    benefit: copy.benefit_en,
    badge: copy.festival_badge,
    statusLine: copy.status_line,
    storyCta: copy.story_cta,
    price: product.price, // from code only
    phone: process.env.SHOP_PHONE?.trim() || undefined,
    link,
    brand: p.shopName ?? BRAND,
  };

  // "Don't know which app" with no Instagram/Facebook: only the WhatsApp pieces (PAINS: never more than they can use).
  const social = p.sellsOn?.includes('social') ?? false;
  const onlyWhatsApp = p.postingBlocker === 'which_app' && !social;

  const stamp = `${opts.key.replace(/[^a-z0-9]+/gi, '_')}-${product.slug}-${Date.now().toString(36)}`;
  const jobs: Promise<string>[] = [renderPng(waStatus(data), STATUS_SIZE, `${stamp}-wa_status.png`)];
  if (!onlyWhatsApp) {
    jobs.push(renderPng(feedPost(data), FEED_SIZE, `${stamp}-feed_post.png`));
    jobs.push(renderPng(igStory(data), STORY_SIZE, `${stamp}-ig_story.png`));
  }
  const [status, feed, story] = await Promise.all(jobs);

  // The owner's own line may carry anything; show the plain part of it.
  const name = shortTitle(product.source === 'photo' ? cleanSellerText(product.title)[0] ?? 'your piece' : product.title);
  const replies: Reply[] = [
    { kind: 'text', text: [`Done. Your posts for ${name}, one per place. Post them in this order:`, ...(p.postingBlocker === 'photos_bad' ? [PHOTO_LINE] : [])].join('\n') },
    {
      kind: 'image',
      path: status,
      caption: `1. Post this as your WhatsApp Status tonight, 7 to 10 PM.${urls.status ? ` Add this link in the Status text: ${urls.status}` : ''}`,
    },
    { kind: 'text', text: '2. Forward the next message to your 2 local groups (society, market association). Send the Status picture with it.' },
    { kind: 'text', text: forwardText(copy, urls.group) },
  ];
  if (feed && story) {
    replies.push({
      kind: 'image',
      path: feed,
      caption:
        (social ? '3. Post this on Instagram and Facebook as a feed post.' : '3. Feed post for Instagram or Facebook, for when you start a page.') +
        (urls.feed ? ` Put this link in the caption (Facebook) or your bio (Instagram): ${urls.feed}` : ''),
    });
    const tags = copy.hashtags.length ? ` Hashtags: ${copy.hashtags.join(' ')}` : '';
    replies.push({
      kind: 'image',
      path: story,
      caption: `4. Post this as an Instagram story at 8 PM.${urls.story ? ` Add a link sticker: ${urls.story}` : ' Write "DM to order".'}${tags}`,
    });
  }
  if (!opts.hadPlan) replies.push({ kind: 'text', text: WHATSAPP_WARNING });
  return { replies, files: [status, feed, story].filter(Boolean), copySource: source, ms: Date.now() - t0, codes };
}
