import { describe, expect, it } from "vitest";
import { geometryErrors, resolve, sizePlans } from "../src/engine/resolver";
import { contrast } from "../src/engine/contrast";
import { truncateLine, wrap, type Measure } from "../src/engine/text";
import { defineAd, SpecError, validateSpec, type AdSpec } from "../src/engine/spec";
import { defineSurface, insets, validateSurface, type Surface } from "../src/engine/surfaces";
import type { ResolvedText } from "../src/engine/layout";
import { sample, toSpec } from "../src/lib/creative";
import { surfaces } from "../src/lib/data";

// Deterministic substitute for Canvas metrics. Browser checks verify real font metrics.
const measure: Measure = (text, size) =>
  [...text].reduce((sum, c) => sum + (c === " " ? 0.28 : 0.52) * size, 0);
const spec = toSpec(sample);
const [portrait, landscape, broadcast, kiosk, tight] = surfaces;
const texts = (r: ReturnType<typeof resolve>) =>
  r.elements.filter((e): e is ResolvedText => e.kind !== "image");
const ok = (r: ReturnType<typeof resolve>) => r.status === "ready" || r.status === "adapted";

describe("brief surfaces", () => {
  it("keeps every element on the four required surfaces, recomposing tall, wide, and square differently", () => {
    const results = [portrait, landscape, broadcast, kiosk].map((s) => resolve(spec, s, measure));
    results.forEach((r, i) => {
      expect(r.errors).toEqual([]);
      expect(r.status).toBe("ready");
      expect(r.elements.map((e) => e.id).sort()).toEqual(["brand", "cta", "headline", "image", "price"]);
      expect(geometryErrors(r.elements, surfaces[i])).toEqual([]);
    });
    const [tall, , wide, square] = results;
    expect(new Set([tall.arrangement, wide.arrangement, square.arrangement]).size).toBe(3);
    // Landscape fits gallery at full size; stage ordering forbids shrinking text just to reach split.
    expect(results[1].arrangement).toBe("gallery");
  });
  it("uses the brief's constraints: 32 px broadcast text and 60 px kiosk targets", () => {
    expect(broadcast).toMatchObject({ width: 1920, height: 250, minTextSize: 32, viewingDistance: "far", input: "none" });
    expect(kiosk).toMatchObject({ width: 1080, height: 1080, minTapTarget: 60, input: "touch" });
    expect(Math.min(...texts(resolve(spec, broadcast, measure)).map((e) => e.fontSize))).toBeGreaterThanOrEqual(32);
    const cta = resolve(spec, kiosk, measure).elements.find((e) => e.id === "cta")!;
    expect(Math.min(cta.width, cta.height)).toBeGreaterThanOrEqual(60);
  });
  it("resolves every IAB and social preset with required content and valid geometry", () => {
    const extra = surfaces.filter((s) => s.category === "IAB display" || s.category === "Social & digital");
    expect(extra).toHaveLength(18);
    for (const s of extra) {
      const r = resolve(spec, s, measure);
      expect(ok(r), `${s.id}: ${r.errors.join(" ")}`).toBe(true);
      expect(geometryErrors(r.elements, s)).toEqual([]);
      expect(r.elements.map((e) => e.id)).toEqual(expect.arrayContaining(["headline", "cta"]));
    }
  });
  it("does not branch on surface names or ids", () => {
    const s = { ...landscape, id: "unknown", name: "Never seen before" };
    expect(resolve(spec, s, measure)).toEqual(resolve(spec, landscape, measure));
  });
});

describe("priority-based degradation", () => {
  it("shrinks lower-priority text fully before any higher-priority text", () => {
    const plans = sizePlans(spec.elements);
    for (const plan of plans)
      for (const a of spec.elements)
        for (const b of spec.elements)
          if (a.priority < b.priority && (plan.scale.get(a.id) ?? 1) < 1)
            expect(plan.scale.get(b.id)).toBeLessThanOrEqual(0.62);
  });
  it("never shrinks text when some arrangement fits everything at preferred size", () => {
    // Regression: 300×200 used to pick a shrunk gallery although a full-size strip fits.
    const r = resolve(spec, { ...portrait, width: 300, height: 200 }, measure);
    expect(r.status).toBe("ready");
    expect(r.omitted).toEqual([]);
    for (const e of texts(r)) expect(e.scale).toBe(1);
    for (let width = 120; width <= 1200; width += 60)
      for (let height = 60; height <= 900; height += 60) {
        const r2 = resolve(spec, { ...portrait, width, height }, measure);
        if (r2.status === "adapted" && !r2.omitted.length) expect(r2.decisions[1]).toContain("Degradation applied");
      }
  });
  it("drops branding first as the kiosk loses height, keeping headline and CTA intact", () => {
    let firstDrop: string | undefined;
    let shrunkBeforeDrop = false;
    for (let height = 1080; height >= 120; height -= 10) {
      const s = { ...kiosk, height };
      const r = resolve(spec, s, measure);
      if (!ok(r)) {
        expect(r.elements).toEqual([]);
        continue;
      }
      expect(geometryErrors(r.elements, s)).toEqual([]);
      expect(r.elements.map((e) => e.id)).toEqual(expect.arrayContaining(["headline", "cta"]));
      const brand = texts(r).find((e) => e.id === "brand");
      if (!firstDrop && brand && brand.scale < 1) shrunkBeforeDrop = true;
      firstDrop ??= r.omitted[0]?.id;
    }
    expect(firstDrop).toBe("brand");
    expect(shrunkBeforeDrop).toBe(true);
  });
  it("omits optional elements in brief priority order (3, then 2, then 1)", () => {
    for (let height = 48; height < 240; height += 8) {
      const r = resolve(spec, { ...tight, height }, measure);
      expect(r.omitted.map((o) => o.id)).toEqual(["brand", "price", "image"].slice(0, r.omitted.length));
    }
  });
  it("treats priority 1 as most important when priorities change", () => {
    const flipped = toSpec({ ...sample, priorities: { ...sample.priorities, brand: 1, price: 5 } });
    const r = resolve(flipped, { ...tight, height: 64 }, measure);
    expect(r.omitted[0]?.id).toBe("price");
  });
  it("truncates secondary text with an ellipsis before dropping it", () => {
    const long = toSpec({ ...sample, price: "From $129 with free two-day shipping and a two-year warranty" });
    let truncatedSeen = false;
    for (let height = 90; height <= 400; height += 10)
      for (const width of [240, 320, 480]) {
        const s = { ...portrait, width, height };
        const r = resolve(long, s, measure);
        if (!ok(r)) continue;
        expect(geometryErrors(r.elements, s)).toEqual([]);
        const price = texts(r).find((e) => e.id === "price");
        if (price?.truncated) {
          truncatedSeen = true;
          expect(price.lines).toHaveLength(1);
          expect(price.lines[0].endsWith("…")).toBe(true);
          expect(measure(price.lines[0], price.fontSize, 700)).toBeLessThanOrEqual(price.width);
        }
      }
    expect(truncatedSeen).toBe(true);
  });
});

describe("correctness", () => {
  it("never reports invalid geometry as valid over a dimension grid", () => {
    let valid = 0,
      impossible = 0;
    for (let width = 64; width <= 1200; width += 71)
      for (let height = 64; height <= 900; height += 67) {
        const s = { ...portrait, width, height };
        const r = resolve(spec, s, measure);
        if (ok(r)) {
          valid++;
          expect(geometryErrors(r.elements, s)).toEqual([]);
          expect(r.elements.map((e) => e.id)).toEqual(expect.arrayContaining(["headline", "cta"]));
          for (const e of r.elements) expect(e.explanation.length).toBeGreaterThan(1);
        } else {
          impossible++;
          expect(r.elements).toEqual([]);
        }
      }
    expect(valid).toBeGreaterThan(100);
    expect(impossible).toBeGreaterThan(0);
  });
  it("never labels an image-less layout as gallery", () => {
    const c = toSpec({ ...sample, priorities: { ...sample.priorities, image: 5 } });
    for (let height = 70; height < 400; height += 10) {
      const r = resolve(c, { ...kiosk, width: 400, height }, measure);
      if (r.omitted.some((o) => o.id === "image")) expect(r.arrangement).not.toBe("gallery");
    }
  });
  it("sizes the CTA to its label instead of the full column", () => {
    const cta = resolve(spec, broadcast, measure).elements.find((e) => e.id === "cta")!;
    expect(cta.width).toBeLessThan(broadcast.width / 3);
  });
  it("returns explicit impossible results when required content cannot fit", () => {
    expect(resolve(spec, { ...tight, minTextSize: 40 }, measure).status).toBe("impossible");
    expect(resolve({ ...spec, theme: { ...spec.theme, foreground: spec.theme.background } }, portrait, measure).status).toBe("impossible");
  });
  it("explains each element's slot, size, and degradation", () => {
    const r = resolve(spec, { ...kiosk, height: 420 }, measure);
    for (const e of r.elements) expect(e.explanation[0]).toContain(`${r.arrangement} arrangement`);
    expect(r.decisions[0]).toContain("arrangement chosen");
  });
});

describe("validation and text", () => {
  it("reports invalid specs and invalid constraint combinations clearly", () => {
    expect(resolve(spec, { ...portrait, width: NaN }, measure).status).toBe("invalid");
    expect(validateSurface({ ...broadcast, minTextSize: 14 }).join(" ")).toContain("far viewing distance");
    expect(validateSurface({ ...broadcast, minTapTarget: 44 }).join(" ")).toContain("cannot declare a tap target");
    expect(validateSurface({ ...portrait, safeArea: insets(300) }).join(" ")).toContain("Safe area");
    const bad = { ...spec, elements: [...spec.elements, { ...spec.elements[0] }] };
    expect(validateSpec(bad).join(" ")).toContain("duplicate id");
    expect(validateSpec({ ...spec, elements: [{ ...spec.elements[0], type: "image" }] }).join(" ")).toContain('requires type "text"');
    expect(validateSpec({ ...spec, elements: [{ ...spec.elements[1], content: "javascript:alert(1)" }, spec.elements[0]] }).length).toBeGreaterThan(0);
    expect(() => defineAd(bad as AdSpec)).toThrow(SpecError);
    expect(() => defineSurface({ ...portrait, width: 10 } as Surface)).toThrow();
  });
  it("computes known contrast ratios", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21);
    expect(contrast("#ffffff", "#ffffff")).toBe(1);
  });
  it("wraps measured words without clipping, hyphenating only where allowed", () => {
    const lines = wrap("One creative. Every surface.", 100, 16, 700, measure)!;
    expect(lines.join(" ")).toBe("One creative. Every surface.");
    expect(lines.every((l) => measure(l, 16, 700) <= 100)).toBe(true);
    const word = "x".repeat(60);
    const hyphenated = wrap(`Big ${word} deal`, 100, 16, 700, measure, { hyphenate: true })!;
    expect(hyphenated.every((l) => measure(l, 16, 700) <= 100)).toBe(true);
    expect(hyphenated.join(" ").replace(/- /g, "")).toBe(`Big ${word} deal`);
    expect(wrap(word, 100, 16, 700, measure)).toBeNull();
    expect(truncateLine("From $129 today", 60, 16, 700, measure)).toMatch(/…$/);
  });
});
