// Core handler for the "Post to Instagram" button. No grammy/hono imports (SPEC core rule).
// The poster file must already be in data/creatives/ and served by Hono at /c/:file.
// Instagram fetches it through the cloudflared tunnel: PUBLIC_TUNNEL_URL=https://<name>.trycloudflare.com
// (PUBLIC_BASE_URL is the LAN/hotspot IP, which Instagram cannot reach.)
import path from "node:path";
import { postToInstagram, buildInstagramRequest } from "../instagram.js";

export const POST_TO_INSTAGRAM_BUTTON = { id: "post_instagram", label: "Post to Instagram" };

export function posterTunnelUrl(posterPath) {
  const base = process.env.PUBLIC_TUNNEL_URL;
  if (!base) throw new Error("PUBLIC_TUNNEL_URL is not set (start: cloudflared tunnel --url http://localhost:8787)");
  return `${base.replace(/\/+$/, "")}/c/${encodeURIComponent(path.basename(posterPath))}`;
}

// Returns Reply[] in the SPEC shape. Set INSTAGRAM_DRY_RUN=1 to build the request without sending.
export async function handlePostToInstagram({ posterPath, caption }) {
  const imageUrl = posterTunnelUrl(posterPath);

  if (process.env.INSTAGRAM_DRY_RUN === "1") {
    const { body } = buildInstagramRequest(imageUrl, caption);
    return [{ kind: "text", text: `Dry run, nothing posted. Request body:\n${JSON.stringify(body, null, 2)}` }];
  }

  try {
    const post = await postToInstagram(imageUrl, caption);
    const text = post.url
      ? `Posted on Instagram: ${post.url}`
      : `Sent to Instagram (status: ${post.status ?? "unknown"}). The link appears once Instagram finishes publishing.`;
    return [{ kind: "text", text }];
  } catch (err) {
    console.error("[instagram]", err);
    // Demo fallback from postToInstagram.md, only in demo mode so a real failure is never hidden.
    if (process.env.DEMO_MODE === "1") {
      return [{ kind: "image", path: posterPath, caption: "Scheduled on Instagram ✓" }];
    }
    return [{ kind: "text", text: `Instagram post failed: ${err.message}` }];
  }
}
