export type CreatorStats = { top_video_views: number | null; followers: number | null; sells_product: boolean; avg_reel_views: number | null; email: string | null };
export type Check = { label: string; pass: boolean | null; detail: string };

const fmt = (n: number) => n.toLocaleString("en-US");

/** Parses "45k", "1.2M", "45,000", "45 200" into a number. */
export function parseCount(v: string): number | null {
  const t = v.trim().toLowerCase().replace(/[\s,]/g, "");
  if (!t) return null;
  const m = t.match(/^(\d+(?:\.\d+)?)([km])?/);
  if (!m) return null;
  const n = parseFloat(m[1]) * (m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : 1);
  return Math.round(n);
}

/** The 5 filters from the AI Income Challenge, Episode 3. pass=null means not checked yet. */
export function runFilters(c: CreatorStats): Check[] {
  const f = c.followers;
  const v = c.top_video_views;
  const need = f ? Math.ceil(f / 10) : null;
  return [
    { label: "1. Video views 50k–200k", pass: v == null ? null : v >= 50000 && v <= 200000, detail: v == null ? "views unknown" : `${fmt(v)} views` },
    { label: "2. Followers 10k–100k", pass: f == null ? null : f >= 10000 && f <= 100000, detail: f == null ? "followers unknown" : `${fmt(f)} followers` },
    { label: "3. Not already selling a product", pass: !c.sells_product, detail: c.sells_product ? "sells their own product" : "no product found" },
    { label: "4. Reels avg ≥ followers ÷ 10", pass: c.avg_reel_views == null || need == null ? null : c.avg_reel_views >= need, detail: c.avg_reel_views == null || need == null ? "Reel views unknown" : `${fmt(c.avg_reel_views)} avg vs ${fmt(need)} needed` },
    { label: "5. Business email in bio", pass: !!c.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim()), detail: c.email ? c.email : "no email" },
  ];
}

/** Filter 4 uses "most of the last 10 Reels": the median is used so one viral Reel can't skew it. */
export function typicalReelViews(views: number[]): number | null {
  const a = views.filter((n) => n > 0).sort((x, y) => x - y);
  if (!a.length) return null;
  return a[Math.floor((a.length - 1) / 2)];
}

export const passesAll = (c: CreatorStats) => runFilters(c).every((x) => x.pass === true);
