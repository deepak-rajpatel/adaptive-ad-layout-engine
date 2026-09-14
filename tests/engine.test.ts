import { describe, expect, it } from "vitest";
import {
  contrast,
  geometryErrors,
  resolve,
  validateCreative,
  wrap,
} from "../src/engine/resolve";
import { sample, surfaces } from "../src/lib/data";
import type { Measure } from "../src/engine/types";
// Deterministic substitute for Canvas metrics. Browser tests verify real font metrics.
const measure: Measure = (text, size) =>
  [...text].reduce((sum, c) => sum + (c === " " ? 0.28 : 0.52) * size, 0);
describe("constraint resolution", () => {
  it("keeps every element on the four required surfaces in distinct arrangements", () => {
    const results = surfaces
      .slice(0, 4)
      .map((s) => resolve(sample, s, measure));
    for (const r of results) {
      expect(r.elements).toHaveLength(5);
      expect(r.errors).toEqual([]);
    }
    expect(new Set(results.map((r) => r.arrangement)).size).toBe(4);
  });
  it("does not branch on names or IDs", () => {
    const s = { ...surfaces[1], id: "unknown", name: "Never seen before" };
    expect(resolve(sample, s, measure)).toEqual(
      resolve(sample, surfaces[1], measure),
    );
  });
  it("never reports invalid geometry as valid over a dimension grid", () => {
    let valid = 0,
      impossible = 0;
    for (let width = 64; width <= 1200; width += 71)
      for (let height = 48; height <= 900; height += 67) {
        const s = { ...surfaces[0], width, height };
        const r = resolve(sample, s, measure);
        if (r.status === "ready" || r.status === "adapted") {
          valid++;
          expect(geometryErrors(r.elements, s)).toEqual([]);
          expect(r.elements.map((e) => e.id)).toEqual(
            expect.arrayContaining(["headline", "cta"]),
          );
        } else {
          impossible++;
          expect(r.elements).toEqual([]);
        }
      }
    expect(valid).toBeGreaterThan(100);
    expect(impossible).toBeGreaterThan(0);
  });
  it("omits optional elements strictly in ascending priority order", () => {
    const c = {
      ...sample,
      priorities: { ...sample.priorities, image: 1, price: 2, brand: 3 },
    };
    for (let height = 70; height < 240; height += 10) {
      const r = resolve(c, { ...surfaces[4], height }, measure);
      expect(r.omitted).toEqual(
        ["image", "price", "brand"].slice(0, r.omitted.length),
      );
    }
  });
  it("returns explicit impossible results for too-small safe areas and long words", () => {
    expect(resolve(sample, { ...surfaces[0], safe: 300 }, measure).status).toBe(
      "impossible",
    );
    expect(
      resolve({ ...sample, headline: "x".repeat(200) }, surfaces[0], measure)
        .status,
    ).toBe("impossible");
  });
  it("rejects nonfinite dimensions, malformed priorities, and unsafe image URLs", () => {
    expect(
      resolve(sample, { ...surfaces[0], width: NaN }, measure).status,
    ).toBe("invalid");
    expect(
      validateCreative({ ...sample, priorities: null }).length,
    ).toBeGreaterThan(0);
    expect(
      validateCreative({ ...sample, image: "javascript:alert(1)" }).length,
    ).toBeGreaterThan(0);
  });
  it("rejects insufficient contrast and computes known contrast ratios", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21);
    expect(contrast("#ffffff", "#ffffff")).toBe(1);
    expect(
      resolve(
        { ...sample, foreground: sample.background },
        surfaces[0],
        measure,
      ).status,
    ).toBe("impossible");
  });
  it("wraps measured words without clipping or silent truncation", () => {
    const lines = wrap("One creative. Every surface.", 100, 16, 700, measure)!;
    expect(lines.join(" ")).toBe("One creative. Every surface.");
    expect(lines.every((line) => measure(line, 16, 700) <= 100)).toBe(true);
  });
});
