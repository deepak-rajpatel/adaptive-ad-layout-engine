// Brand logo, image masks and borders, background graphics and the offer badge: typed, reusable
// capabilities checked for geometry, completeness, persistence and legacy defaults.
import { describe, expect, it } from "vitest";
import { completenessErrors, geometryErrors, polygonHitsBox, resolve } from "../src/engine/resolver";
import type { ResolvedElement, ResolvedLayout } from "../src/engine/layout";
import type { Measure } from "../src/engine/text";
import type { Surface } from "../src/engine/surfaces";
import { sample, toSpec, validateCreative, type CreativeData } from "../src/engine/creativeModel";
import { exampleAds, exampleCopy } from "../src/engine/examples";
import { surfaces } from "../src/lib/data";
import { parseProject } from "../src/lib/persistence";

const measure: Measure = (text, size) =>
  [...text].reduce((sum, c) => sum + (c === " " ? 0.28 : 0.52) * size, 0);
const byId = (id: string) => surfaces.find((s) => s.id === id)!;
const [portrait, landscape, broadcast, kiosk] = surfaces.slice(0, 4);
const custom = { ...byId("custom"), width: 1000, height: 420 } as Surface;
/** The assignment four, a tall display ad, a wide banner, an unfamiliar size and a constrained one. */
const showcase: Surface[] = [portrait, landscape, broadcast, kiosk, byId("iab-300x600"), byId("iab-728x90"), custom, byId("tight")];
const zesto = exampleAds.find((e) => e.id === "sales-zesto-noodle-bowl")!.creative;
const logo = "/examples/zesto-logo.svg";
const find = (r: ResolvedLayout, id: string) => r.elements.find((e) => e.id === id);
const overlapsBox = (a: ResolvedElement, b: ResolvedElement) =>
  a.x < b.x + b.width - 0.01 && a.x + a.width > b.x + 0.01 && a.y < b.y + b.height - 0.01 && a.y + a.height > b.y + 0.01;

/** Every valid result accounts for each element exactly once, keeps required ones and valid geometry. */
function expectComplete(c: CreativeData, s: Surface, label: string) {
  const spec = toSpec(c);
  const r = resolve(spec, s, measure);
  expect(r.status, `${label}: ${r.errors.join(" ")}`).not.toBe("invalid");
  if (r.status === "impossible") {
    expect(r.elements).toEqual([]);
    return r;
  }
  const placedAndOmitted = [...r.elements, ...r.omitted.map((o) => ({ id: o.id }))];
  expect(completenessErrors(placedAndOmitted, spec.elements), label).toEqual([]);
  for (const e of spec.elements) if (e.required) expect(find(r, e.id), `${label}: required ${e.id}`).toBeDefined();
  expect(geometryErrors(r.elements, s, r.panels), label).toEqual([]);
  // The badge may overlap only the hero image or decoration.
  const badge = find(r, "badge");
  if (badge)
    for (const e of r.elements)
      if (e !== badge && overlapsBox(badge, e)) expect(["hero", "decoration"], `${label}: badge over ${e.id}`).toContain(e.role);
  return r;
}

describe("brand logo", () => {
  it("keeps the logo's proportions on every surface, alone or with brand text", () => {
    for (const brand of ["", "VOXORA"])
      for (const s of showcase) {
        const r = resolve(toSpec({ ...sample, brand, logo, logoAspect: 3.2 }), s, measure);
        const l = find(r, "logo");
        if (!l) continue;
        expect(l.width / l.height).toBeCloseTo(3.2, 1);
        expect(l.height).toBeGreaterThanOrEqual(s.minTextSize - 0.01);
        expect(l).toMatchObject({ kind: "image", fit: "contain" });
        expect(Boolean(find(r, "brand"))).toBe(brand !== "" || r.omitted.some((o) => o.id === "brand"));
      }
  });

  it("gives the logo an explicit priority and required flag", () => {
    const tight = byId("tight");
    const optional = resolve(toSpec({ ...zesto, priorities: { ...zesto.priorities, logo: 5 }, useGoalPriorities: false }), tight, measure);
    expect(find(optional, "logo")).toBeUndefined();
    expect(optional.omitted.map((o) => o.id)).toContain("logo");
    const required = resolve(toSpec({ ...zesto, required: { ...zesto.required, logo: true } }), kiosk, measure);
    expect(find(required, "logo")).toBeDefined();
  });
});

describe("image style", () => {
  it("keeps a circular image circular on tall, wide and square surfaces", () => {
    for (const composition of ["auto", "product", "panel"] as const)
      for (const s of showcase) {
        const r = expectComplete({ ...sample, composition, imageMask: "circle" }, s, `circle ${composition} ${s.id}`);
        const img = find(r, "image");
        if (!img || img.kind !== "image") continue;
        expect(img.width).toBeCloseTo(img.height, 5);
        expect(img.radius).toBeCloseTo(img.width / 2, 5);
        expect(img.layer).toBeUndefined();
      }
  });

  it("applies rectangle, rounded (capped) and border settings without changing geometry", () => {
    const plain = resolve(toSpec(sample), kiosk, measure);
    const rect = resolve(toSpec({ ...sample, imageMask: "rect" }), kiosk, measure);
    const rounded = resolve(toSpec({ ...sample, imageMask: "rounded", imageRadius: 200 }), kiosk, measure);
    const bordered = resolve(toSpec({ ...sample, imageBorderWidth: 6, imageBorderColor: "#ffffff" }), kiosk, measure);
    const box = (r: ResolvedLayout) => {
      const { x, y, width, height } = find(r, "image")!;
      return { x, y, width, height };
    };
    expect(box(rect)).toEqual(box(plain));
    expect(box(bordered)).toEqual(box(plain));
    expect(find(rect, "image")!.radius).toBe(0);
    expect(find(rounded, "image")!.radius).toBe(200);
    expect(find(bordered, "image")).toMatchObject({ border: { color: "#ffffff", width: 6 } });
  });

  it("caps a rounded radius at half the image's shorter side on every size", () => {
    let capped = 0;
    for (const s of showcase) {
      const img = find(resolve(toSpec({ ...sample, imageMask: "rounded", imageRadius: 200 }), s, measure), "image");
      if (!img) continue;
      const limit = Math.min(img.width, img.height) / 2;
      expect(img.radius, s.id).toBe(Math.min(200, limit));
      if (limit < 200) capped++;
    }
    expect(capped).toBeGreaterThan(0);
  });
});

describe("background graphics", () => {
  it("never places a block or diagonal behind text, judged by the exact shape", () => {
    for (const graphic of ["block", "diagonal"] as const)
      for (const composition of ["auto", "product"] as const)
        for (const s of showcase) {
          const r = expectComplete({ ...zesto, composition, graphic }, s, `${graphic} ${composition} ${s.id}`);
          for (const shape of r.shapes ?? []) {
            expect(shape.layer).toBe("under");
            for (const e of r.elements)
              if (e.kind !== "image" && e.role !== "badge")
                expect(polygonHitsBox(shape.points!, e), `${shape.id} behind ${e.id} on ${s.id}`).toBe(false);
          }
          if (!r.shapes?.length && r.status !== "impossible")
            expect(r.decisions.join(" ")).toMatch(/Background (block|diagonal) skipped/);
        }
  });

  it("does not treat a diagonal's bounding box as filled", () => {
    const triangle: [number, number][] = [
      [100, 0],
      [200, 0],
      [200, 100],
    ];
    expect(polygonHitsBox(triangle, { x: 100, y: 60, width: 30, height: 30 })).toBe(false);
    expect(polygonHitsBox(triangle, { x: 170, y: 20, width: 20, height: 20 })).toBe(true);
    // Touching an edge is not an overlap.
    expect(polygonHitsBox(triangle, { x: 200, y: 0, width: 20, height: 20 })).toBe(false);
  });

  it("draws the frame in the safe-area margin, or skips it with a reason", () => {
    const framed = resolve(toSpec({ ...sample, graphic: "frame", graphicColor: "#3b1a0b" }), kiosk, measure);
    const frame = framed.shapes![0];
    expect(frame).toMatchObject({ shape: "frame", layer: "over" });
    const inner = frame.x + frame.stroke!.width;
    expect(inner).toBeLessThanOrEqual(kiosk.safeArea.left);
    const narrow = { ...custom, safeArea: { top: 4, right: 4, bottom: 4, left: 4 } } as Surface;
    const skipped = resolve(toSpec({ ...sample, graphic: "frame" }), narrow, measure);
    expect(skipped.shapes).toBeUndefined();
    expect(skipped.decisions.join(" ")).toMatch(/Background frame skipped/);
  });

  it("explains a graphic that has no image region to anchor to", () => {
    const r = resolve(toSpec({ ...sample, image: "", graphic: "diagonal" }), kiosk, measure);
    expect(r.shapes).toBeUndefined();
    expect(r.decisions.join(" ")).toMatch(/anchored to the image region, and this layout has no image/);
  });
});

describe("offer badge", () => {
  it("is measured, padded, distinct from the offer text and never over copy", () => {
    const r = expectComplete(zesto, kiosk, "zesto kiosk");
    const badge = find(r, "badge")!;
    const offer = find(r, "price")!;
    expect(badge).toMatchObject({ kind: "text", fill: "#ffd23f", color: "#3b1a0b", align: "center", lines: ["30% OFF"] });
    expect(offer.kind === "text" && offer.lines.join(" ")).toBe("Family bowls from $19");
    expect(badge.width).toBe(badge.height);
    expect(badge.radius).toBe(badge.width / 2);
  });

  it("follows priorities: optional badges yield first on a constrained size, required ones never vanish", () => {
    const tight = byId("tight");
    const optional = expectComplete(zesto, tight, "zesto tight");
    if (!find(optional, "badge")) expect(optional.omitted.map((o) => o.id)).toContain("badge");
    for (const s of showcase) expectComplete({ ...zesto, required: { ...zesto.required, badge: true } }, s, `required badge ${s.id}`);
  });

  it("rejects an unreadable badge instead of drawing it", () => {
    const r = resolve(toSpec({ ...zesto, badgeFill: "#ffd23f", badgeTextColor: "#ffffff" }), kiosk, measure);
    expect(r.status).toBe("impossible");
    expect(r.errors[0]).toMatch(/Badge label does not meet the 4.5:1 contrast requirement/);
  });
});

describe("content completeness with the new elements", () => {
  it.each(["auto", "product", "panel", "type"] as const)("accounts for logo and badge in the %s composition on every showcase size", (composition) => {
    const presence = ["absent", "optional", "required"] as const;
    for (const logoState of presence)
      for (const badgeState of presence)
        for (const s of showcase)
          expectComplete(
            {
              ...zesto,
              composition,
              logo: logoState === "absent" ? "" : logo,
              badge: badgeState === "absent" ? "" : "30% OFF",
              required: { ...zesto.required, logo: logoState === "required", badge: badgeState === "required" },
            },
            s,
            `${composition} logo ${logoState} badge ${badgeState} ${s.id}`,
          );
  });
});

describe("ZESTO food campaign", () => {
  it("recomposes on the assignment four, a tall ad, a wide banner, a custom size and a constrained size", () => {
    const arrangements = new Set<string>();
    for (const s of showcase) {
      const r = expectComplete(zesto, s, `zesto ${s.id}`);
      expect(["ready", "adapted"], `${s.id}: ${r.errors.join(" ")}`).toContain(r.status);
      expect(find(r, "headline")).toBeDefined();
      expect(find(r, "cta")).toBeDefined();
      arrangements.add(`${r.arrangement}:${Math.round((find(r, "image")?.x ?? 0) / s.width * 10)}`);
    }
    // Genuinely different compositions, not one arrangement scaled.
    expect(arrangements.size).toBeGreaterThan(2);
    const kioskResult = resolve(toSpec(zesto), kiosk, measure);
    expect(kioskResult.arrangement).toBe("product");
    expect(kioskResult.shapes?.[0]).toMatchObject({ id: "diagonal", fill: "#f59e3b" });
    expect(find(kioskResult, "logo")).toBeDefined();
  });

  it("simplifies cleanly on the constrained size: omissions are explicit and reasoned", () => {
    const r = resolve(toSpec(zesto), byId("tight"), measure);
    expect(r.omitted.length).toBeGreaterThan(0);
    for (const o of r.omitted) expect(r.decisions.some((d) => d.startsWith(`${o.id} (`))).toBe(true);
  });
});

describe("composition typography defaults", () => {
  it("only truncates the offer when wrapping cannot fit: at 1000 × 420 the price stays visible", () => {
    const r = expectComplete(zesto, custom, "zesto custom");
    const offer = find(r, "price");
    expect(offer).toBeDefined();
    expect(offer!.kind === "text" && offer!.truncated).toBe(false);
    expect(offer!.kind === "text" && offer!.lines.join(" ")).toBe("Family bowls from $19");
  });

  it("never lets composition truncation hide a price: the ladder continues instead", () => {
    for (const s of showcase) {
      const r = resolve(toSpec(zesto), s, measure);
      const offer = find(r, "price");
      if (!offer || offer.kind !== "text") continue;
      expect(offer.lines.join(" "), s.id).toContain("$19");
    }
  });

  it("keeps composition headlines to at most three lines without split words where the column allows", () => {
    for (const s of [kiosk, portrait, byId("iab-300x600")]) {
      const r = resolve(toSpec(zesto), s, measure);
      const headline = find(r, "headline")!;
      if (headline.kind !== "text") continue;
      expect(headline.lines.length, s.id).toBeLessThanOrEqual(3);
      expect(headline.lines.some((l) => l.endsWith("-")), s.id).toBe(false);
    }
  });

  it("scopes the smaller supporting size to compositions; automatic layouts keep the original size", () => {
    const withLine = { ...sample, supporting: "Free delivery" };
    const auto = find(resolve(toSpec(withLine), kiosk, measure), "supporting")!;
    const composed = find(resolve(toSpec({ ...withLine, composition: "product" }), kiosk, measure), "supporting")!;
    const unit = 48; // kiosk base unit
    expect(auto.kind === "text" && auto.scale).toBe(1);
    expect(auto.kind === "text" && auto.fontSize).toBe(Math.round(unit * 0.95 * 10) / 10);
    expect(composed.kind === "text" && composed.scale).toBe(1);
    expect(composed.kind === "text" && composed.fontSize).toBe(Math.round(unit * 0.8 * 10) / 10);
  });

  it("keeps the price visible through an automatic fallback, or omits the offer explicitly", () => {
    // Without an image the product-led family cannot run, so the automatic arrangements are used.
    for (const s of showcase) {
      const r = expectComplete({ ...zesto, image: "", imageAspect: 0 }, s, `fallback ${s.id}`);
      if (r.status === "impossible") continue;
      expect(r.arrangement, s.id).not.toBe("product");
      const offer = find(r, "price");
      if (offer && offer.kind === "text") expect(offer.lines.join(" "), s.id).toContain("$19");
      else expect(r.decisions.some((d) => d.startsWith("price (")), s.id).toBe(true);
    }
  });

  it("never lets the badge overlap more than a fifth of the image's rendered rectangle, or omits it explicitly", () => {
    // Coverage is geometric: overlap with the rectangle the image is drawn in (the square
    // illustration, centred by its known proportions), not detection of the visible silhouette.
    const coverage = (r: ResolvedLayout) => {
      const badge = find(r, "badge")!;
      const image = find(r, "image")!;
      const side = Math.min(image.width, image.height);
      const drawn = { x: image.x + (image.width - side) / 2, y: image.y + (image.height - side) / 2, width: side, height: side };
      const w = Math.max(0, Math.min(badge.x + badge.width, drawn.x + drawn.width) - Math.max(badge.x, drawn.x));
      const h = Math.max(0, Math.min(badge.y + badge.height, drawn.y + drawn.height) - Math.max(badge.y, drawn.y));
      return (w * h) / (side * side);
    };
    for (const s of showcase) {
      const r = expectComplete(zesto, s, `zesto ${s.id}`);
      if (find(r, "badge") && find(r, "image")) expect(coverage(r), s.id).toBeLessThanOrEqual(0.2 + 1e-9);
      else if (!find(r, "badge")) {
        expect(r.omitted.map((o) => o.id), s.id).toContain("badge");
        expect(r.decisions.join(" "), s.id).toMatch(/badge \(badge, priority \d\) omitted/);
      }
      const required = expectComplete({ ...zesto, required: { ...zesto.required, badge: true } }, s, `required ${s.id}`);
      if (required.status !== "impossible") {
        expect(find(required, "badge"), s.id).toBeDefined();
        if (find(required, "image")) expect(coverage(required), s.id).toBeLessThanOrEqual(0.2 + 1e-9);
      }
    }
  });

  it("tries a smaller badge before giving up, never below the minimum text size", () => {
    // A large preferred badge size forces the size steps; the result stays readable and within the limit.
    const big = { ...zesto, textStyles: { ...zesto.textStyles, badge: { weight: 700 as const, size: 1.6 } } };
    for (const s of showcase) {
      const r = expectComplete(big, s, `big badge ${s.id}`);
      const badge = find(r, "badge");
      if (badge && badge.kind === "text") expect(badge.fontSize, s.id).toBeGreaterThanOrEqual(s.minTextSize);
    }
  });

  it("keeps the supporting line subordinate to the headline and the offer", () => {
    for (const s of showcase) {
      const r = resolve(toSpec(zesto), s, measure);
      const [headline, supporting, offer] = ["headline", "supporting", "price"].map((id) => find(r, id));
      if (!supporting || supporting.kind !== "text") continue;
      if (headline?.kind === "text") expect(supporting.fontSize, s.id).toBeLessThanOrEqual(headline.fontSize);
      if (offer?.kind === "text") expect(supporting.fontSize, s.id).toBeLessThanOrEqual(offer.fontSize);
    }
  });

  it("anchors the badge to the drawn product when the image's proportions are known", () => {
    const r = resolve(toSpec(zesto), kiosk, measure);
    const badge = find(r, "badge")!;
    const image = find(r, "image")!;
    // The square illustration is drawn centred in its region: the badge touches that drawn square.
    const side = Math.min(image.width, image.height);
    const drawn = { x: image.x + (image.width - side) / 2, y: image.y + (image.height - side) / 2, width: side, height: side };
    const touches =
      badge.x < drawn.x + drawn.width && badge.x + badge.width > drawn.x && badge.y < drawn.y + drawn.height && badge.y + badge.height > drawn.y;
    expect(touches).toBe(true);
    expect(badge.explanation[0]).toMatch(/overlapping the image's (top-right|top-left) edge/);
    expect(badge.explanation.join(" ")).toMatch(/of the image's rendered rectangle \(limit 20%; measured as rectangle overlap/);
    // Unknown proportions keep the region-corner placement.
    const unknown = resolve(toSpec({ ...zesto, imageAspect: 0 }), kiosk, measure);
    expect(find(unknown, "badge")!.explanation[0]).toMatch(/corner of the image/);
  });
});

describe("persistence and legacy defaults", () => {
  it("gives older projects the new settings as defaults and leaves their layouts unchanged", () => {
    const {
      logo: _l,
      logoAspect: _la,
      badge: _b,
      badgeFill: _bf,
      badgeTextColor: _bt,
      badgeShape: _bs,
      imageMask: _m,
      imageRadius: _r,
      imageBorderWidth: _bw,
      imageBorderColor: _bc,
      graphic: _g,
      graphicColor: _gc,
      ...old
    } = sample;
    const { logo: _pl, badge: _pb, ...priorities } = sample.priorities;
    const { logo: _rl, badge: _rb, ...requiredFlags } = sample.required;
    const { creative } = parseProject({ version: 3, creative: { ...old, priorities, required: requiredFlags }, surface: kiosk });
    expect(creative).toMatchObject({ logo: "", badge: "", imageMask: "auto", imageBorderWidth: 0, graphic: "none" });
    expect(creative.priorities).toMatchObject({ logo: 3, badge: 2 });
    expect(creative.required).toMatchObject({ logo: false, badge: false });
    const spec = toSpec(creative);
    for (const key of ["imageStyle", "graphic", "badge"]) expect(spec).not.toHaveProperty(key);
    for (const s of surfaces.slice(0, 4)) expect(resolve(spec, s, measure)).toEqual(resolve(toSpec(sample), s, measure));
  });

  it("round-trips every new setting through a project file and keeps example copies independent", () => {
    const copy = exampleCopy(exampleAds.find((e) => e.id === "sales-zesto-noodle-bowl")!);
    const edited = { ...copy, imageMask: "circle" as const, imageBorderWidth: 4, graphic: "frame" as const, badgeShape: "pill" as const };
    const file = JSON.parse(JSON.stringify({ version: 3, creative: edited, surface: kiosk }));
    expect(parseProject(file).creative).toEqual(edited);
    expect(zesto.imageMask).toBe("auto");
    expect(zesto.graphic).toBe("diagonal");
  });

  it("rejects invalid visual settings", () => {
    expect(validateCreative({ ...sample, imageMask: "star" })).toContain("Unknown image mask.");
    expect(validateCreative({ ...sample, graphic: "confetti" })).toContain("Unknown background graphic.");
    expect(validateCreative({ ...sample, badge: "x".repeat(30) })).toContain("Badge text must be at most 24 characters.");
    expect(validateCreative({ ...sample, logoAspect: 40 })).toContain("Logo proportions must be a width/height ratio of 0.1–10.");
    expect(validateCreative({ ...sample, imageBorderWidth: 99 })).toContain("Image border must be 0–24 px.");
  });
});
