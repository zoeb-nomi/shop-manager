// Fonts and product photos as data: URLs, so templates render with no network and no file:// access.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const FONT_DIR = 'node_modules/@fontsource';
const FONTS: [family: string, weight: number, file: string][] = [
  ['Poppins', 400, 'poppins/files/poppins-latin-400-normal.woff2'],
  ['Poppins', 600, 'poppins/files/poppins-latin-600-normal.woff2'],
  ['Poppins', 700, 'poppins/files/poppins-latin-700-normal.woff2'],
  ['Poppins', 800, 'poppins/files/poppins-latin-800-normal.woff2'],
  ['Noto Sans Devanagari', 500, 'noto-sans-devanagari/files/noto-sans-devanagari-devanagari-500-normal.woff2'],
  ['Noto Sans Devanagari', 700, 'noto-sans-devanagari/files/noto-sans-devanagari-devanagari-700-normal.woff2'],
];

let fontCss: string | undefined;
export function fontFaces(): string {
  fontCss ??= FONTS.map(([family, weight, file]) => {
    const b64 = readFileSync(path.join(FONT_DIR, file)).toString('base64');
    return `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
  }).join('\n');
  return fontCss;
}

const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

function dataUrl(file: string): string {
  const mime = MIME[path.extname(file).toLowerCase()] ?? 'image/jpeg';
  return `data:${mime};base64,${readFileSync(file).toString('base64')}`;
}

// A listing photo: demo-products/<slug>.jpg if it is there, else a cached download of the listing image.
export async function photoDataUrl(p: { slug: string; image?: string; photoPath?: string }): Promise<string | undefined> {
  if (p.photoPath && existsSync(p.photoPath)) return dataUrl(p.photoPath);
  const local = path.join('demo-products', `${p.slug}.jpg`);
  if (existsSync(local)) return dataUrl(local);
  if (!p.image) return undefined;
  const cached = path.join('data/cache', `${p.slug}.jpg`);
  if (!existsSync(cached)) {
    const res = await fetch(p.image);
    if (!res.ok) return undefined;
    mkdirSync(path.dirname(cached), { recursive: true });
    writeFileSync(cached, Buffer.from(await res.arrayBuffer()));
  }
  return dataUrl(cached);
}
