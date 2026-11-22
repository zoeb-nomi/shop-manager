export function buildInstagramRequest(imageUrl: string, caption: string): { url: string; method: string; headers: Record<string, string>; body: unknown };
export function postToInstagram(imageUrl: string, caption: string): Promise<{ id?: string; status?: string; url?: string }>;
