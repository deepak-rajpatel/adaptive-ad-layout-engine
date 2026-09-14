import { describe, expect, it } from "vitest";
import { sample } from "../src/engine/creativeModel";
import type { Measure } from "../src/engine/text";
import { placements } from "../src/engine/catalog/data";
import { batchExport, planAll, summarizeSkipped } from "../src/engine/catalog/plan";
import type { Placement } from "../src/engine/catalog/types";

const measure: Measure = (text, size) =>
  [...text].reduce((sum, c) => sum + (c === " " ? 0.28 : 0.52) * size, 0);
const creative = { ...sample, destination: "https://example.com" };
const copyOnly: Placement = {
  ...placements.find((p) => p.id === "meta-right-column")!,
  id: "fixture-copy-only",
  media: "none",
};
const catalog = [...placements, copyOnly];
const run = (image: { width: number; height: number } | null) =>
  planAll({ image, creative, goal: "Awareness", measure }, catalog).plans;
const file = (b: ReturnType<typeof batchExport>, id: string) => b.files.find((f) => f.plan.placement.id === id);
const skip = (b: ReturnType<typeof batchExport>, id: string) => b.skipped.find((s) => s.plan.placement.id === id);

describe("batch export", () => {
  it("exports exactly the available placements and explains every skip", () => {
    const plans = run({ width: 1254, height: 1254 });
    const batch = batchExport(plans);
    expect(batch.files.length + batch.skipped.length).toBe(plans.length);
    expect(batch.files.every((f) => f.plan.pngExport.available)).toBe(true);
    expect(batch.skipped.every((s) => !s.plan.pngExport.available && s.reason)).toBe(true);
    expect(skip(batch, "fixture-copy-only")!.reason).toMatch(/Copy-only/);
  });
  it("names and sizes composed creatives and image assets", () => {
    const batch = batchExport(run({ width: 1254, height: 1254 }));
    expect(file(batch, "google-300x250")).toMatchObject({ kind: "composed-creative", width: 300, height: 250, name: "google-300x250-300x250.png" });
    expect(file(batch, "meta-feed")).toMatchObject({ kind: "image-asset", name: expect.stringMatching(/^meta-feed-\d+x\d+-image-asset\.png$/) });
  });
  it("never enlarges an image asset beyond the source crop", () => {
    const batch = batchExport(run({ width: 800, height: 800 }));
    // Meta feed 1:1 recommends 1440 × 1440; the 800 × 800 source exports at its own size.
    expect(file(batch, "meta-feed")).toMatchObject({ width: 800, height: 800 });
  });
  it("skips image placements without an image and still exports text-only banners", () => {
    const batch = batchExport(run(null));
    expect(skip(batch, "meta-feed")!.reason).toBe("Needs an image.");
    expect(file(batch, "google-728x90")).toMatchObject({ kind: "composed-creative" });
    expect(summarizeSkipped(batch.skipped)).toMatch(/^Skipped \d+: /);
  });
  it("limits the batch to the selection", () => {
    const batch = batchExport(run({ width: 1254, height: 1254 }), ["meta-feed", "fixture-copy-only"]);
    expect(batch.files.map((f) => f.plan.placement.id)).toEqual(["meta-feed"]);
    expect(batch.skipped.map((s) => s.plan.placement.id)).toEqual(["fixture-copy-only"]);
  });
});
