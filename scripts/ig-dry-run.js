// Prints the Zernio request postToInstagram would send. Sends nothing.
// Usage: node --env-file=.env scripts/ig-dry-run.js [posterFile] [caption]
import { buildInstagramRequest } from "../src/instagram.js";
import { posterTunnelUrl } from "../src/core/postToInstagramAction.js";

process.env.PUBLIC_TUNNEL_URL ||= "https://example-tunnel.trycloudflare.com";
const poster = process.argv[2] || "data/creatives/feed_post_sample.png";
const caption = process.argv[3] || "Golden bird light, handmade in Jaipur. A Christmas gift that glows. Order on WhatsApp, link in bio.";

const req = buildInstagramRequest(posterTunnelUrl(poster), caption);
const key = process.env.ZERNIO_API_KEY || "";
req.headers.Authorization = `Bearer ${key ? key.slice(0, 4) + "…" + `(${key.length} chars)` : "<missing>"}`;
console.log(`${req.method} ${req.url}`);
console.log(JSON.stringify(req.headers, null, 2));
console.log(JSON.stringify(req.body, null, 2));
