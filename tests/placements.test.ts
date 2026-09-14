import { describe, expect, it } from "vitest";
import {
  assessPlacement,
  placements,
  validDestination,
} from "../src/engine/placements";
const image = { kind: "image" as const, width: 1200, height: 1200 };
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
  it("does not mistake vertical images for video creatives", () => {
    const p = placements.find((p) => p.id === "tiktok-feed")!;
    expect(
      assessPlacement(
        { ...image, width: 1080, height: 1920 },
        p,
        "Hello",
        "https://example.com",
      ).status,
    ).toBe("Unsupported");
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
  it("requires measured video duration and nonempty copy", () => {
    const p = placements.find((p) => p.id === "meta-reels")!;
    const r = assessPlacement(
      { kind: "video", width: 1080, height: 1920 },
      p,
      "  ",
      "https://example.com",
    );
    expect(r.reasons).toContain("Video duration could not be verified.");
    expect(r.reasons).toContain("Add a headline.");
  });
});
