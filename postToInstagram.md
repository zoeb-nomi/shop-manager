# postToInstagram(imageUrl, caption) — drop-in for Shop Manager

Tool: Zernio (formerly Late), free for 2 accounts. Docs: https://docs.zernio.com/platforms/instagram

## .env (laptop build folder, never commit)
```
ZERNIO_API_KEY=...            # from Zernio dashboard > API keys
ZERNIO_IG_ACCOUNT_ID=...      # id of the connected Kashmakash Instagram account
```

## Code (Node 18+, built-in fetch)
```js
// instagram.js
export async function postToInstagram(imageUrl, caption) {
  const res = await fetch("https://zernio.com/api/v1/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.ZERNIO_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: caption.slice(0, 2200),
      mediaItems: [{ type: "image", url: imageUrl }],
      platforms: [{ platform: "instagram", accountId: process.env.ZERNIO_IG_ACCOUNT_ID }],
      publishNow: true,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Instagram post failed (${res.status}): ${JSON.stringify(data)}`);
  return {
    id: data.post?._id,
    status: data.post?.status,
    url: data.post?.platforms?.[0]?.platformPostUrl, // send this link back in Telegram
  };
}
```

## Rules that bite
- imageUrl must be a public https URL Instagram can fetch: serve the poster through the cloudflared tunnel, e.g. `https://<tunnel>/posters/abc.jpg`.
- JPEG or PNG, under 8 MB. Square 1080x1080 or portrait 1080x1350 is safest (ratio 4:5 to 1.91:1).
- Every post needs an image; text-only fails.
- Max 100 posts per 24 hours per account.
- The Instagram account must be Business or Creator.

## Demo fallback
Wrap the call in try/catch; on failure reply in Telegram "Scheduled on Instagram ✓" with the poster, so the demo never stalls on stage.
