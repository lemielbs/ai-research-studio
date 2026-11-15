export type CreatorStats = { top_video_views: number | null; followers: number | null; sells_product: boolean; avg_reel_views: number | null; email: string | null };

export function runFilters(c: CreatorStats) {
  const f = c.followers ?? 0;
  return [
    { label: "Video views 50k–200k", pass: c.top_video_views != null && c.top_video_views >= 50000 && c.top_video_views <= 200000 },
    { label: "Followers 10k–100k", pass: f >= 10000 && f <= 100000 },
    { label: "Not selling own product", pass: !c.sells_product },
    { label: "Avg Reel views ≥ followers ÷ 10", pass: c.avg_reel_views != null && f > 0 && c.avg_reel_views >= f / 10 },
    { label: "Business email in bio", pass: !!c.email && /.+@.+\..+/.test(c.email) },
  ];
}

export const passesAll = (c: CreatorStats) => runFilters(c).every((x) => x.pass);
