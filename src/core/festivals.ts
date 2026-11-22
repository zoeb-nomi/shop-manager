// Festival calendar and product ranking. Code decides dates, days left and which piece fits (SPEC Flow 3 and 8).
// Demo clock: DEMO_DATE=YYYY-MM-DD, otherwise today's date in India.

type MonthDay = [month: number, day: number];

export type Festival = {
  id: string;
  name: string;
  date?: MonthDay; // one day
  season?: { from: MonthDay; to: MonthDay }; // a stretch, may run across New Year
  keywords: string[]; // matched against the product title (lower case)
  why: string; // the reason the agent gives, written here, never by the model
};

export const FESTIVALS: Festival[] = [
  { id: 'christmas', name: 'Christmas', date: [12, 25], keywords: ['gift', 'decorative', 'bird', 'golden', 'star', 'festive', 'christmas'], why: 'people buy gifts and decorate their homes' },
  { id: 'new_year', name: 'New Year', date: [1, 1], keywords: ['gift', 'decorative', 'balcony', 'party'], why: 'homes get lit up for parties' },
  { id: 'lohri', name: 'Lohri', date: [1, 13], keywords: ['outdoor', 'gate', 'courtyard', 'bonfire'], why: 'families gather outside the house in the evening' },
  { id: 'republic_day', name: 'Republic Day sale', date: [1, 26], keywords: [], why: 'shoppers wait for the big sales' },
  { id: 'wedding', name: 'wedding season', season: { from: [11, 1], to: [2, 28] }, keywords: ['gate', 'entrance', 'pooja', 'gold', 'outdoor', 'gift'], why: 'homes are lit up for guests and families buy gifts' },
];

const DAY = 86_400_000;

export function today(): number {
  const demo = process.env.DEMO_DATE;
  if (demo && /^\d{4}-\d{2}-\d{2}$/.test(demo)) return Date.parse(`${demo}T00:00:00Z`);
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function next(md: MonthDay, from: number): number {
  const y = new Date(from).getUTCFullYear();
  const t = Date.UTC(y, md[0] - 1, md[1]);
  return t >= from ? t : Date.UTC(y + 1, md[0] - 1, md[1]);
}

export type FestivalTiming = { festival: Festival; days: number; active: boolean; endLabel?: string };

// days = days until the festival; for a season that is already on, days left in it (active = true).
export function timing(f: Festival, now = today()): FestivalTiming {
  if (f.date) return { festival: f, days: Math.round((next(f.date, now) - now) / DAY), active: false };
  const { from, to } = f.season!;
  const end = next(to, now);
  const start = Date.UTC(new Date(end).getUTCFullYear() - (to[0] < from[0] ? 1 : 0), from[0] - 1, from[1]);
  const endLabel = new Date(end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  if (start <= now) return { festival: f, days: Math.round((end - now) / DAY), active: true, endLabel };
  return { festival: f, days: Math.round((next(from, now) - now) / DAY), active: false };
}

export function phrase(t: FestivalTiming): string {
  if (t.active) return `${cap(t.festival.name)} is on for ${t.days} more days (till ${t.endLabel})`;
  if (t.days === 0) return `${cap(t.festival.name)} is today`;
  return `${cap(t.festival.name)} is in ${t.days} day${t.days === 1 ? '' : 's'}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function fitScore(title: string, f: Festival): number {
  const t = title.toLowerCase();
  return f.keywords.filter((k) => t.includes(k)).length;
}

const WINDOW_DAYS = 60;

// Festivals worth planning for now: a season that is on, or a date within the window. Soonest first.
export function upcoming(now = today()): FestivalTiming[] {
  return FESTIVALS.map((f) => timing(f, now))
    .filter((t) => t.active || t.days <= WINDOW_DAYS)
    .sort((a, b) => Number(a.active) - Number(b.active) || a.days - b.days);
}

// The headline festival: the nearest dated one in the window (Christmas on 22 Nov).
export function headline(now = today()): FestivalTiming | undefined {
  return upcoming(now).find((t) => !t.active) ?? upcoming(now)[0];
}

// The best festival for one product, or undefined if nothing coming up fits it.
export function bestFit(title: string, now = today()): FestivalTiming | undefined {
  return upcoming(now).find((t) => fitScore(title, t.festival) > 0);
}

export type PickVerdict =
  | { kind: 'agree'; timing?: FestivalTiming }
  | { kind: 'suggest'; timing: FestivalTiming; betterIndex: number };

// The owner picked `picked` out of `titles`. Agree when it fits something coming up; when it fits nothing,
// suggest the piece that fits the headline festival best (if any does).
export function judgePick(picked: string, titles: string[], now = today()): PickVerdict {
  const fit = bestFit(picked, now);
  if (fit) return { kind: 'agree', timing: fit };
  const head = headline(now);
  if (!head) return { kind: 'agree' };
  let betterIndex = -1;
  let best = 0;
  titles.forEach((t, i) => {
    const s = fitScore(t, head.festival);
    if (s > best) [best, betterIndex] = [s, i];
  });
  if (betterIndex < 0 || titles[betterIndex] === picked) return { kind: 'agree' };
  return { kind: 'suggest', timing: head, betterIndex };
}

// Rank all products for "Do it for me": best headline-festival fit first, then any fit, then list order.
export function rankTitles(titles: string[], now = today()): number[] {
  const head = headline(now);
  const score = (t: string) => (head ? fitScore(t, head.festival) * 10 : 0) + (bestFit(t, now) ? 1 : 0);
  return titles.map((t, i) => [i, score(t)] as const).sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([i]) => i);
}
