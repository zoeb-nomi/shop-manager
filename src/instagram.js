// instagram.js: postToInstagram(imageUrl, caption) via Zernio. Spec: ../postToInstagram.md
// Env: ZERNIO_API_KEY, ZERNIO_IG_ACCOUNT_ID. Node 18+ (built-in fetch).

const ZERNIO_POSTS_URL = "https://zernio.com/api/v1/posts";

// Pure: builds the exact request postToInstagram sends. Used by the dry run.
export function buildInstagramRequest(imageUrl, caption) {
  if (!/^https:\/\//.test(imageUrl)) {
    throw new Error(`imageUrl must be a public https URL Instagram can fetch, got: ${imageUrl}`);
  }
  if (!process.env.ZERNIO_IG_ACCOUNT_ID) throw new Error("ZERNIO_IG_ACCOUNT_ID is not set");
  const body = {
    content: String(caption ?? "").slice(0, 2200),
    mediaItems: [{ type: "image", url: imageUrl }],
    platforms: [{ platform: "instagram", accountId: process.env.ZERNIO_IG_ACCOUNT_ID }],
    publishNow: true,
  };
  return {
    url: ZERNIO_POSTS_URL,
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.ZERNIO_API_KEY}`,
      "Content-Type": "application/json",
    },
    body,
  };
}

export async function postToInstagram(imageUrl, caption) {
  const req = buildInstagramRequest(imageUrl, caption);
  if (!process.env.ZERNIO_API_KEY) throw new Error("ZERNIO_API_KEY is not set");
  const res = await fetch(req.url, {
    method: req.method,
    headers: req.headers,
    body: JSON.stringify(req.body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Instagram post failed (${res.status}): ${JSON.stringify(data)}`);
  return {
    id: data.post?._id,
    status: data.post?.status,
    url: data.post?.platforms?.[0]?.platformPostUrl, // send this link back in Telegram
  };
}
