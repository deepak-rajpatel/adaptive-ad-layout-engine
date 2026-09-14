import { describe, expect, it } from "vitest";
import { sample } from "../src/engine/creativeModel";
import type { Measure } from "../src/engine/text";
import { placements } from "../src/engine/catalog/data";
import { planAll, uploadRecommendation } from "../src/engine/catalog/plan";

const measure: Measure = (text, size) =>
  [...text].reduce((sum, c) => sum + (c === " " ? 0.28 : 0.52) * size, 0);
const creative = { ...sample, destination: "https://example.com" };
const only = (id: string) => placements.filter((p) => p.id === id);

describe("minimum upload recommendation", () => {
  it("matches a hand calculation for LinkedIn single image", () => {
    // 300×300 source. 1.91:1 → crop 300×157.07 vs min 640×360 → ×2.29;
    // 1:1 → crop 300×300 vs min 360×360 → ×1.2; 4:5 → crop 240×300 vs min 360×640 → ×2.13.
    // The best size needs ×1.2, so 360 × 360.
    const image = { width: 300, height: 300 };
    const { plans } = planAll({ image, creative, goal: "Awareness", measure }, only("linkedin-single-image"));
    expect(plans[0].fit).toBe("Unsupported");
    expect(plans[0].minimumScale).toBeCloseTo(1.2);
    expect(uploadRecommendation(plans, image)).toMatchObject({ size: { width: 360, height: 360 }, alreadyMet: false });
  });
  it("takes the largest need across placements and keeps the aspect ratio", () => {
    const image = { width: 400, height: 300 };
    const { plans } = planAll({ image, creative, goal: "Awareness", measure });
    const rec = uploadRecommendation(plans, image)!;
    const worst = Math.max(...plans.flatMap((p) => (p.minimumScale === null ? [] : [p.minimumScale])));
    expect(rec.size).toEqual({ width: Math.ceil(400 * worst), height: Math.ceil(300 * worst) });
  });
  it("reports an image that already meets every minimum", () => {
    const image = { width: 1200, height: 1200 };
    const { plans } = planAll({ image, creative, goal: "Awareness", measure }, only("meta-feed"));
    expect(uploadRecommendation(plans, image)).toMatchObject({ alreadyMet: true, size: image });
  });
  it("gives no recommendation without an image", () => {
    const { plans } = planAll({ image: null, creative, goal: "Awareness", measure });
    expect(uploadRecommendation(plans, null)).toBeNull();
    expect(plans.every((p) => p.minimumScale === null)).toBe(true);
  });
});
