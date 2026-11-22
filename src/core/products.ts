// The seller's own Amazon listings, prepared before the event: demo-products/products.json.
import { readFileSync } from 'node:fs';

export type Product = { slug: string; asin: string; title: string; image: string; price?: number; demo_angle?: string };

// The demo shop behind "Use my Amazon products" (brand from SPEC "Creatives"; every listing is an LED wall light).
// Set DEMO_SHOP_CITY in .env and the demo skips the city question.
export const DEMO_SHOP = { shopName: 'Kashmakash Studios', sells: 'LED wall lights' };
export const demoShopCity = (): string | undefined => process.env.DEMO_SHOP_CITY?.trim() || undefined;

const PRODUCTS_PATH = process.env.PRODUCTS_PATH ?? 'demo-products/products.json';
let cache: Product[] | undefined;

export function loadProducts(): Product[] {
  cache ??= (JSON.parse(readFileSync(PRODUCTS_PATH, 'utf8')) as Product[]).filter((p) => p.slug && p.title);
  return cache;
}

export function productBySlug(slug: string): Product | undefined {
  return loadProducts().find((p) => p.slug === slug);
}

// The seller's own price from their one line ("Brass diya stand, Rs 650" / "₹650" / "650/-"). Code reads it;
// the model may repeat it but never sets one.
export function parsePrice(line: string): number | undefined {
  const m = line.match(/(?:\brs\.?|₹|\binr)\s*(\d[\d,]*)|(\d[\d,]*)\s*(?:rs\b|rupees?\b|\/-)/i);
  const n = m ? Number((m[1] ?? m[2]).replace(/,/g, '')) : NaN;
  return Number.isFinite(n) && n > 0 && n < 10_000_000 ? n : undefined;
}

// Listing titles are long ("Golden Bird LED Wall Light, Modern Decorative Sconce for ..."): keep the part before the first comma.
export function shortTitle(title: string): string {
  const head = title.split(',')[0].trim();
  return head.length <= 40 ? head : `${head.slice(0, 38).trimEnd()}…`;
}
