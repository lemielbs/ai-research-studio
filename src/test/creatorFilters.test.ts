import { describe, it, expect } from "vitest";
import { runFilters, passesAll, parseCount, typicalReelViews } from "@/lib/creatorFilters";
const good = { top_video_views: 80000, followers: 40000, sells_product: false, avg_reel_views: 5000, email: "a@b.com" };
describe("5 creator filters", () => {
  it("passes a creator meeting all 5", () => expect(passesAll(good)).toBe(true));
  it("fails views over 200k", () => expect(runFilters({ ...good, top_video_views: 250000 })[0]!.pass).toBe(false));
  it("fails followers under 10k", () => expect(runFilters({ ...good, followers: 9000 })[1]!.pass).toBe(false));
  it("fails if already selling", () => expect(passesAll({ ...good, sells_product: true })).toBe(false));
  it("needs avg views of followers/10", () => expect(runFilters({ ...good, avg_reel_views: 3999 })[3]!.pass).toBe(false));
  it("needs a business email", () => expect(runFilters({ ...good, email: null })[4]!.pass).toBe(false));
  it("unknown numbers are not checked yet", () => expect(runFilters({ ...good, followers: null })[1]!.pass).toBe(null));
  it("parses 45k and 1.2M", () => { expect(parseCount("45k")).toBe(45000); expect(parseCount("1.2M")).toBe(1200000); expect(parseCount("45,200")).toBe(45200); });
  it("uses median of reel views", () => expect(typicalReelViews([1000, 2000, 900000])).toBe(2000));
});
