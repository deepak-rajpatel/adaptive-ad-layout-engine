// Composition families, background layering and typography: reusable engine capabilities,
// checked on the four required surfaces with a deterministic measure.
import { describe, expect, it } from "vitest";
import { geometryErrors, resolve } from "../src/engine/resolver";
import type { ResolvedElement, ResolvedLayout } from "../src/engine/layout";
import type { Measure } from "../src/engine/text";
import { sample, toSpec, validateCreative } from "../src/engine/creativeModel";
import { exampleAds, exampleCopy } from "../src/engine/examples";
import { surfaces } from "../src/lib/data";
import { parseProject } from "../src/lib/persistence";

// Serif measures wider than sans, so a resolver that ignored the chosen font would mis-wrap.
const measure: Measure = (text, size, _weight, font) =>
  [...text].reduce((sum, c) => sum + (c === " " ? 0.28 : font === "serif" ? 0.56 : 0.52) * size, 0);
const required = surfaces.slice(0, 4);
const [portrait, , , kiosk] = required;
const byId = (id: string) => exampleAds.find((e) => e.id === id)!;
const directions = ["sales-dayform-essentials", "leads-tidyday-quote", "awareness-open-shelf-reading"];
const textIds = (r: ResolvedLayout) =>
  r.elements.filter((e) => e.kind !== "image").map((e) => e.id).sort();

describe("composition families", () => {
  it.each(directions)("%s resolves on all four surfaces with valid geometry and its required content", (id) => {
    for (const s of required) {
      const r = resolve(toSpec(byId(id).creative), s, measure);
      expect(["ready", "adapted"], `${id} on ${s.id}: ${r.errors.join(" ")}`).toContain(r.status);
      expect(geometryErrors(r.elements, s, r.panels)).toEqual([]);
      expect(r.elements.map((e) => e.id)).toEqual(expect.arrayContaining(["headline", "cta"]));
    }
  });

  it("keeps each preferred family on the square kiosk", () => {
    for (const id of directions) {
      const spec = toSpec(byId(id).creative);
      expect(resolve(spec, kiosk, measure).arrangement).toBe(spec.composition!.family);
    }
  });

  it("reflows the panel composition by aspect ratio instead of scaling it", () => {
    const tidy = toSpec(byId("leads-tidyday-quote").creative);
    const square = resolve(tidy, kiosk, measure);
    expect(square.panels?.[0]).toMatchObject({ x: 0, y: 0, height: kiosk.height });
    const tall = resolve(tidy, portrait, measure);
    if (tall.arrangement === "panel") {
      expect(tall.panels?.[0]).toMatchObject({ x: 0, width: portrait.width });
      expect(tall.panels![0].y).toBeGreaterThan(0);
    }
  });

  it("draws the photo as a background layer and keeps every text element on the solid panel", () => {
    for (const s of required) {
      const r = resolve(toSpec(byId("leads-tidyday-quote").creative), s, measure);
      if (r.arrangement !== "panel") continue;
      const photo = r.elements.find((e) => e.id === "image");
      expect(photo).toMatchObject({ kind: "image", layer: "background" });
      for (const e of r.elements.filter((e) => e.kind !== "image"))
        expect(
          r.panels!.some((p) => e.x >= p.x && e.y >= p.y && e.x + e.width <= p.x + p.width && e.y + e.height <= p.y + p.height),
          `${e.id} on ${s.id}`,
        ).toBe(true);
    }
  });

  it("rejects content over a background photo unless it sits on a panel", () => {
    const photo: ResolvedElement = { kind: "image", layer: "background", id: "image", role: "hero", priority: 1, src: "/x.jpg", focalX: 50, focalY: 50, radius: 0, x: 0, y: 0, width: 1080, height: 1080, explanation: [] };
    const text: ResolvedElement = { kind: "text", id: "headline", role: "primary", priority: 1, x: 100, y: 100, width: 400, height: 100, lines: ["Hi"], fontSize: 40, lineHeight: 48, fontWeight: 700, align: "left", color: "#000000", radius: 0, scale: 1, truncated: false, explanation: [] };
    expect(geometryErrors([photo, text], kiosk)).toContain("headline overlaps background image without a solid panel");
    expect(geometryErrors([photo, text], kiosk, [{ x: 0, y: 0, width: 600, height: 1080 }])).toEqual([]);
  });

  it("checks text contrast against the panel, and explains a fallback when only the panel fails", () => {
    const tidy = byId("leads-tidyday-quote").creative;
    const panelFails = resolve(toSpec({ ...tidy, panelColor: "#f4efe3" }), kiosk, measure);
    expect(panelFails.arrangement).not.toBe("panel");
    expect(panelFails.decisions.join(" ")).toMatch(/skipped: its text contrast/);
    const bothFail = resolve(toSpec({ ...tidy, panelColor: "#f4efe3", background: "#f4efe3" }), kiosk, measure);
    expect(bothFail.status).toBe("impossible");
    expect(bothFail.errors[0]).toMatch(/on the panel/);
  });

  it("lets decoration yield before any content and never shrinks text to keep it", () => {
    const shelf = byId("awareness-open-shelf-reading").creative;
    for (const s of required) {
      const withDecoration = resolve(toSpec(shelf), s, measure);
      const without = resolve(toSpec({ ...shelf, decoration: "" }), s, measure);
      if (withDecoration.elements.some((e) => e.id === "decoration")) {
        for (const e of withDecoration.elements) if (e.kind !== "image") expect(e.scale).toBe(1);
      } else expect(withDecoration.omitted.map((o) => o.id)).toContain("decoration");
      expect(textIds(withDecoration)).toEqual(textIds(without));
    }
  });

  it("measures and reports the chosen font", () => {
    const fonts = new Set<string>();
    const spy: Measure = (t, size, weight, font) => {
      fonts.add(font ?? "sans");
      return measure(t, size, weight, font);
    };
    const r = resolve(toSpec(byId("awareness-open-shelf-reading").creative), kiosk, spy);
    expect(fonts.has("serif")).toBe(true);
    const headline = r.elements.find((e) => e.id === "headline")!;
    expect(headline).toMatchObject({ kind: "text", fontFamily: "serif", fontWeight: 400 });
  });
});

describe("compatibility", () => {
  it("default composition, spacing and typography add nothing to the spec", () => {
    const spec = toSpec(sample);
    expect(spec).not.toHaveProperty("composition");
    expect(spec).not.toHaveProperty("spacing");
    expect(spec.elements.map((e) => e.id)).toEqual(["headline", "image", "cta", "brand", "price"]);
    for (const e of spec.elements) {
      expect(e).not.toHaveProperty("style");
      expect(e).not.toHaveProperty("fit");
    }
  });

  it("gives old drafts the new fields as defaults, keeps their content and their layouts", () => {
    const {
      supporting: _s,
      decoration: _d,
      composition: _c,
      imageShare: _i,
      panelColor: _p,
      spacing: _sp,
      imageFit: _f,
      textStyles: _t,
      ...old
    } = sample;
    const priorities = { headline: 1, image: 1, cta: 2, offer: 2, brand: 3 };
    const requiredFlags = { headline: true, cta: true, brand: false, image: false, offer: false };
    const { creative } = parseProject({ version: 3, creative: { ...old, priorities, required: requiredFlags }, surface: kiosk });
    expect(creative).toMatchObject({ supporting: "", decoration: "", composition: "auto", imageShare: 50, panelColor: "", spacing: "normal", imageFit: "cover", textStyles: {} });
    expect(creative.priorities).toEqual({ ...priorities, supporting: 3, decoration: 5 });
    expect(creative.required).toEqual({ ...requiredFlags, supporting: false, decoration: false });
    for (const s of required) expect(resolve(toSpec(creative), s, measure)).toEqual(resolve(toSpec(sample), s, measure));
  });

  it("round-trips the new fields through a project file", () => {
    const shelf = exampleCopy(byId("awareness-open-shelf-reading"));
    const file = JSON.parse(JSON.stringify({ version: 3, creative: shelf, surface: kiosk }));
    expect(parseProject(file).creative).toEqual(shelf);
  });

  it("rejects invalid composition and typography values", () => {
    expect(validateCreative({ ...sample, composition: "collage" })).toContain("Unknown composition.");
    expect(validateCreative({ ...sample, imageShare: 90 })).toContain("Image prominence must be 25–70%.");
    expect(validateCreative({ ...sample, textStyles: { headline: { size: 3 } } }).join(" ")).toMatch(/size must be 0\.6–1\.6/);
    expect(validateCreative({ ...sample, textStyles: { headline: { font: "comic" } } }).join(" ")).toMatch(/unknown font/);
    expect(validateCreative({ ...sample, textStyles: { logo: {} } })).toContain("Text styles must be settings keyed by text element.");
  });

  it("editing an example copy never changes the example definition", () => {
    const ex = byId("leads-tidyday-quote");
    const before = JSON.stringify(ex.creative);
    const copy = exampleCopy(ex);
    copy.textStyles.headline = { font: "serif" };
    copy.priorities.supporting = 1;
    copy.supporting = "Changed";
    expect(JSON.stringify(ex.creative)).toBe(before);
  });
});
