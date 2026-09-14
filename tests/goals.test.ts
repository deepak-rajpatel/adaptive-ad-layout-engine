import { describe, expect, it } from "vitest";
import { resolve } from "../src/engine/resolver";
import type { Measure } from "../src/engine/text";
import {
  goalPriorities,
  sample,
  toSpec,
  validateCreative,
  type CreativeData,
} from "../src/engine/creativeModel";
import { placements } from "../src/engine/catalog/data";
import { planAll, planPlacement } from "../src/engine/catalog/plan";
import type { Surface } from "../src/engine/surfaces";

const measure: Measure = (text, size) =>
  [...text].reduce((sum, c) => sum + (c === " " ? 0.28 : 0.52) * size, 0);
const base: CreativeData = { ...sample, destination: "https://example.com", useGoalPriorities: true };
const banner = placements.find((p) => p.id === "google-320x50")!;
const bannerSurface = { ...banner.surface!, id: banner.id, name: banner.name, width: 320, height: 50 } as Surface;
const image = { width: 1254, height: 1254 };
const plan = (creative: CreativeData, goal = creative.goal) =>
  planAll({ image, creative, goal, measure }).plans;

describe("goal priorities", () => {
  it("apply only when switched on", () => {
    const off = toSpec({ ...base, useGoalPriorities: false, goal: "Sales" });
    expect(off.elements.find((e) => e.id === "price")!.priority).toBe(sample.priorities.offer);
    const on = toSpec({ ...base, goal: "Sales" });
    expect(on.elements.find((e) => e.id === "price")!.priority).toBe(goalPriorities.Sales.offer);
  });
  it("recompose the same surface differently for Awareness and Sales", () => {
    const awareness = resolve(toSpec({ ...base, goal: "Awareness" }), bannerSurface, measure);
    const sales = resolve(toSpec({ ...base, goal: "Sales" }), bannerSurface, measure);
    expect(awareness.omitted.map((o) => o.id)).not.toEqual(sales.omitted.map((o) => o.id));
  });
  it("fall back to Consideration for Sales without an offer, with a note and a warning", () => {
    const noOffer = { ...base, offer: "", goal: "Sales" as const };
    expect(toSpec(noOffer).elements.find((e) => e.id === "headline")!.priority).toBe(goalPriorities.Consideration.headline);
    const kiosk = plan(noOffer).find((p) => p.placement.id === "assignment-kiosk")!;
    expect(kiosk.notes).toContain("No offer provided; using Consideration priorities.");
    const feed = plan(noOffer).find((p) => p.placement.id === "meta-feed")!;
    expect(feed.issues.find((i) => i.field === "offer")!.severity).toBe("warning");
  });
  it("keep manual priorities without the fallback note when switched off", () => {
    const manual = { ...base, useGoalPriorities: false, offer: "", goal: "Sales" as const };
    const kiosk = plan(manual).find((p) => p.placement.id === "assignment-kiosk")!;
    expect(kiosk.notes).not.toContain("No offer provided; using Consideration priorities.");
    expect(plan(manual).find((p) => p.placement.id === "meta-feed")!.issues.some((i) => i.field === "offer")).toBe(true);
  });
});

describe("optional and required elements", () => {
  it("leaves blank optional elements out of the spec without issues", () => {
    const spec = toSpec({ ...base, brand: "", offer: "" });
    expect(spec.elements.map((e) => e.id)).toEqual(["headline", "image", "cta"]);
    expect(validateCreative({ ...base, brand: "", offer: "" })).toEqual([]);
  });
  it("makes composed layouts invalid when a required element is blank", () => {
    const kiosk = placements.find((p) => p.id === "assignment-kiosk")!;
    const r = planPlacement(kiosk, { image, creative: { ...base, headline: " " }, goal: "Awareness", measure });
    expect(r.layoutStatus).toBe("invalid");
  });
  it("rejects a creative with no required element", () => {
    const none = { headline: false, image: false, cta: false, brand: false, offer: false };
    expect(validateCreative({ ...base, required: none }).join(" ")).toMatch(/required/);
  });
});

describe("campaign type and non-product creatives", () => {
  it("changes no generated plan", () => {
    const summary = (c: CreativeData) => plan(c).map((p) => [p.placement.id, p.fit, p.layoutStatus]);
    expect(summary({ ...base, campaignType: "Event" })).toEqual(summary({ ...base, campaignType: "Product" }));
  });
  it("resolves an event creative with no image and no offer", () => {
    const event: CreativeData = { ...base, campaignType: "Event", image: "", offer: "", headline: "Design Week 2026", cta: "Register" };
    const plans = planAll({ image: null, creative: event, goal: "Awareness", measure }).plans;
    for (const p of plans.filter((p) => p.placement.surface))
      expect(["ready", "adapted"], p.placement.id).toContain(p.layoutStatus);
    expect(plans.filter((p) => p.fit === "Needs image").every((p) => p.placement.media === "required")).toBe(true);
  });
});
