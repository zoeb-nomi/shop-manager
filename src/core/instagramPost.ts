// "Post to Instagram" for the feed poster of the latest pack. One post per pack: a second tap answers
// "Already posted" with the link instead of asking Zernio again (which refuses duplicates with a 409).
import { postToInstagram } from '../instagram.js';
import { handlePostToInstagram, posterTunnelUrl } from './postToInstagramAction.js';
import { readDb, updateDb } from './db.ts';
import type { Reply } from './types.ts';

// The link of a post Zernio already has (it appears once Instagram finishes publishing).
async function lookupUrl(postId: string): Promise<string | undefined> {
  try {
    const res = await fetch('https://zernio.com/api/v1/posts?limit=20', {
      headers: { Authorization: `Bearer ${process.env.ZERNIO_API_KEY}` },
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as { posts?: { _id: string; platforms?: { platformPostUrl?: string }[] }[] };
    return data.posts?.find((p) => p._id === postId)?.platforms?.[0]?.platformPostUrl;
  } catch {
    return undefined;
  }
}

async function remember(userId: string, ig: { postId?: string; url?: string }): Promise<void> {
  await updateDb((db) => {
    const p = db.users[userId]?.flow?.pack;
    if (p) p.instagram = { at: p.instagram?.at ?? new Date().toISOString(), result: 'posted', ...p.instagram, ...ig };
  });
}

async function already(userId: string, postId?: string, url?: string): Promise<Reply[]> {
  const link = url ?? (postId ? await lookupUrl(postId) : undefined);
  if (link && link !== url) await remember(userId, { postId, url: link });
  return [{ kind: 'text', text: link ? `Already posted ✅ ${link}` : 'Already posted ✅ Instagram is still publishing it. Tap again in a minute for the link.' }];
}

export async function postFeedToInstagram(userId: string): Promise<Reply[]> {
  const pack = readDb().users[userId]?.flow?.pack;
  if (!pack?.feedPoster || !pack.igCaption) return [{ kind: 'text', text: 'Make the posts first, then I can put the feed post on Instagram.' }];
  if (process.env.INSTAGRAM_DRY_RUN === '1') return handlePostToInstagram({ posterPath: pack.feedPoster, caption: pack.igCaption });
  if (pack.instagram?.postId || pack.instagram?.url) return already(userId, pack.instagram.postId, pack.instagram.url);

  try {
    const post = await postToInstagram(posterTunnelUrl(pack.feedPoster), pack.igCaption);
    await remember(userId, { postId: post.id, url: post.url });
    console.log(`[instagram] ${userId}: posted (${post.status ?? 'ok'})`);
    return [{ kind: 'text', text: post.url ? `Posted on Instagram ✅ ${post.url}` : 'Sent to Instagram ✅ It is publishing now. Tap the button again in a minute for the link.' }];
  } catch (err) {
    const message = (err as Error).message;
    console.error(`[instagram] ${userId}: ${message}`);
    // Zernio's duplicate refusal names the post that already exists: that is a success for the owner.
    const existing = message.match(/"existingPostId":"([^"]+)"/)?.[1];
    if (existing || /duplicate_content/.test(message)) {
      if (existing) await remember(userId, { postId: existing });
      return already(userId, existing);
    }
    return [{ kind: 'text', text: 'Instagram did not take the post just now. Please tap the button again in a minute.' }];
  }
}
