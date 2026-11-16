import { describe, it, expect } from "vitest";
import { runFilters, passesAll } from "@/lib/creatorFilters";
const good = { top_video_views: 80000, followers: 40000, sells_product: false, avg_reel_views: 5000, email: "a@b.com" };
describe("5 creator filters", () => {
  it("passes a creator meeting all 5", () => expect(passesAll(good)).toBe(true));
  it("fails views over 200k", () => expect(runFilters({ ...good, top_video_views: 250000 })[0]!.pass).toBe(false));
  it("fails followers under 10k", () => expect(runFilters({ ...good, followers: 9000 })[1]!.pass).toBe(false));
  it("fails if already selling", () => expect(passesAll({ ...good, sells_product: true })).toBe(false));
  it("needs avg views of followers/10", () => expect(runFilters({ ...good, avg_reel_views: 3999 })[3]!.pass).toBe(false));
  it("needs a business email", () => expect(runFilters({ ...good, email: null })[4]!.pass).toBe(false));
});
