// Example-ad library: valid, editable creatives that resolve on the four required surfaces.
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolve } from "../src/engine/resolver";
import type { Measure } from "../src/engine/text";
import { ctaOptions, sample, toSpec, validateCreative } from "../src/engine/creativeModel";
import { exampleAds, exampleCopy } from "../src/engine/examples";
import { surfaces } from "../src/lib/data";

const measure: Measure = (text, size) =>
  [...text].reduce((sum, c) => sum + (c === " " ? 0.28 : 0.52) * size, 0);
const required = surfaces.slice(0, 4);

describe("example ads", () => {
  it("has at least two examples per goal with stable, unique ids", () => {
    expect(exampleAds).toHaveLength(9);
    expect(new Set(exampleAds.map((e) => e.id)).size).toBe(9);
    // Sales has a third: the ZESTO food campaign demonstrating logo, badge and background graphic.
    expect(exampleAds.filter((e) => e.goal === "Sales")).toHaveLength(3);
    for (const goal of ["Leads", "Awareness", "Consideration"] as const)
      expect(exampleAds.filter((e) => e.goal === goal)).toHaveLength(2);
    for (const e of exampleAds) expect(e.creative.goal).toBe(e.goal);
  });

  it("keeps the four required surfaces at their brief dimensions", () => {
    expect(required.map((s) => [s.width, s.height])).toEqual([
      [320, 480],
      [480, 320],
      [1920, 250],
      [1080, 1080],
    ]);
  });

  it.each(exampleAds.map((e) => [e.id, e] as const))("%s is valid and resolves on every required surface", (_id, e) => {
    expect(validateCreative(e.creative)).toEqual([]);
    expect(ctaOptions).toContain(e.creative.cta);
    for (const s of required) {
      const r = resolve(toSpec(e.creative), s, measure);
      expect(["ready", "adapted"], `${e.id} on ${s.name}: ${r.errors.join(" ")}`).toContain(r.status);
    }
  });

  it("seven examples use local photos, ZESTO a local illustration; Open Shelf has no image", () => {
    const withImage = exampleAds.filter((e) => e.creative.image);
    expect(withImage).toHaveLength(8);
    expect(exampleAds.filter((e) => !e.creative.image).map((e) => e.id)).toEqual(["awareness-open-shelf-reading"]);
    expect(exampleAds.find((e) => e.id === "sales-voxora-headphones")!.creative.image).toBe(sample.image);
    const photos = withImage.filter((e) => e.id !== "sales-zesto-noodle-bowl");
    expect(photos).toHaveLength(7);
    for (const e of photos) expect(e.creative.image).toMatch(/^\/[\w/-]+\.jpg$/);
    // Every image, logo and decoration is a local file: no hotlinked assets.
    for (const e of exampleAds)
      for (const src of [e.creative.image, e.creative.logo, e.creative.decoration].filter(Boolean)) {
        expect(src).toMatch(/^\/[\w/-]+\.(jpg|svg)$/);
        expect(existsSync(`public${src}`)).toBe(true);
      }
  });

  it("hands out independent copies and leaves the original sample unchanged", () => {
    const before = structuredClone(exampleAds[0].creative);
    const copy = exampleCopy(exampleAds[0]);
    copy.headline = "Edited";
    copy.focalOverrides.x = { x: 1, y: 1 };
    expect(exampleAds[0].creative).toEqual(before);
    expect(sample.headline).toBe("Sound without limits.");
    expect(sample.cta).toBe("Shop now");
  });
});
