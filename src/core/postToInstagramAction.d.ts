import type { Reply, Button } from './types.ts';
export const POST_TO_INSTAGRAM_BUTTON: Button;
export function posterTunnelUrl(posterPath: string): string;
export function handlePostToInstagram(opts: { posterPath: string; caption: string }): Promise<Reply[]>;
