import { describe, expect, it } from "vitest";
import {
  assessPlacement,
  placements,
  validDestination,
} from "../src/engine/placements";
const image = { width: 1200, height: 1200 };
const feed = placements.find((p) => p.id === "meta-feed")!;
describe("creative placement planning", () => {
  it("requires a decoded asset and valid destination before reporting fit", () => {
    expect(
      assessPlacement(image, feed, "Hello", "https://example.com").status,
    ).toBe("Fits");
    expect(assessPlacement(image, feed, "Hello", "").status).toBe("Needs work");
    expect(
      assessPlacement(
        { ...image, width: NaN },
        feed,
        "Hello",
        "https://example.com",
      ).status,
    ).toBe("Unsupported");
    expect(validDestination("javascript:alert(1)")).toBe(false);
  });
  it("offers only static-image placements", () => {
    expect(placements.length).toBeGreaterThan(0);
    for (const p of placements)
      expect(["meta-reels", "google-shorts", "tiktok-feed"]).not.toContain(p.id);
  });
  it("calculates crop loss and checks resolution after cropping", () => {
    const p = placements.find((p) => p.id === "meta-story")!;
    const r = assessPlacement(image, p, "Hello", "https://example.com");
    expect(r.retained).toBeCloseTo(0.5625);
    expect(r.reasons.some((s) => s.includes("44%"))).toBe(true);
    expect(r.reasons.some((s) => s.includes("resolution"))).toBe(true);
  });
  it("keeps multi-asset formats incomplete despite matching geometry", () => {
    const p = placements.find((p) => p.id === "google-rda")!;
    const r = assessPlacement(
      { ...image, height: 628 },
      p,
      "x".repeat(31),
      "https://example.com",
    );
    expect(r.status).toBe("Needs work");
    expect(r.reasons.some((s) => s.includes("30 characters"))).toBe(true);
    expect(r.reasons.some((s) => s.includes("asset group"))).toBe(true);
  });
  it("requires nonempty copy", () => {
    const r = assessPlacement(image, feed, "  ", "https://example.com");
    expect(r.reasons).toContain("Add a headline.");
  });
});
