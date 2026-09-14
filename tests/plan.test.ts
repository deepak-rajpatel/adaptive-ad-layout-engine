import { describe, expect, it } from "vitest";
import { coverCrop } from "../src/engine/crop";
import { sample } from "../src/engine/creativeModel";
import { validDestination } from "../src/engine/placements";
import { validateSurface, type Surface } from "../src/engine/surfaces";
import type { Measure } from "../src/engine/text";
import type { ResolvedImage } from "../src/engine/layout";
import { formatById, formats, objectiveById, placements } from "../src/engine/catalog/data";
import { planAll, planPlacement, type PlanInput } from "../src/engine/catalog/plan";
import type { Placement } from "../src/engine/catalog/types";

const measure: Measure = (text, size) =>
  [...text].reduce((sum, c) => sum + (c === " " ? 0.28 : 0.52) * size, 0);
const creative = { ...sample, destination: "https://example.com", longHeadline: "Studio sound for every day", description: "Wireless headphones with 40-hour battery." };
const input = (image: PlanInput["image"], over: Partial<PlanInput> = {}): PlanInput => ({ image, creative, goal: "Awareness", measure, ...over });
const byId = (id: string) => placements.find((p) => p.id === id)!;

describe("catalog integrity", () => {
  it("has unique ids and valid references with sources", () => {
    const ids = placements.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(formats.map((f) => f.id)).size).toBe(formats.length);
    for (const p of placements) {
      const f = formatById.get(p.formatId);
      expect(f, p.id).toBeDefined();
      expect(f!.buildable, p.id).toBe(true);
      expect(p.accepts.length, p.id).toBeGreaterThan(0);
      expect(p.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (p.network !== "assignment") expect(p.source).toMatch(/^https:\/\//);
      expect(f!.assembly === "composed", p.id).toBe(!!p.surface);
    }
    for (const f of formats) for (const o of f.objectives) expect(objectiveById.get(o), `${f.id} → ${o}`).toBeDefined();
    for (const f of formats.filter((f) => !f.buildable)) {
      expect(f.unbuildableReason).toBeTruthy();
      expect(placements.some((p) => p.formatId === f.id)).toBe(false);
    }
  });
  it("gives every composed placement a valid surface at each accepted size", () => {
    for (const p of placements.filter((p) => p.surface))
      for (const s of p.accepts)
        expect(validateSurface({ ...p.surface!, id: p.id, name: p.name, ...s.recommended } as Surface), p.id).toEqual([]);
  });
  it("offers no TikTok placement until its specs are verified", () => {
    expect(placements.some((p) => p.network === "tiktok")).toBe(false);
    expect(formatById.get("tiktok-carousel")!.buildable).toBe(false);
  });
});

describe("size selection", () => {
  it("accepts a 4:5 and a 1:1 image on Meta feed without cropping", () => {
    const portrait = planPlacement(byId("meta-feed"), input({ width: 1080, height: 1350 }));
    expect(portrait.fit).toBe("Ready");
    expect(portrait.chosenSize!.label).toBe("4:5");
    const square = planPlacement(byId("meta-feed"), input({ width: 1080, height: 1080 }));
    expect(square.fit).toBe("Ready");
    expect(square.chosenSize!.label).toBe("1:1");
  });
  it("reports a crop, with the share kept, when no ratio matches", () => {
    const plan = planPlacement(byId("taboola-native"), input({ width: 1000, height: 2000 }));
    expect(plan.fit).toBe("Needs crop");
    expect(plan.retainedArea).toBeGreaterThan(0);
    expect(plan.retainedArea).toBeLessThan(0.98);
  });
  it("chooses a feasible size before a higher-retention one that is too small", () => {
    const fixture: Placement = {
      ...byId("meta-right-column"),
      id: "fixture",
      accepts: [
        { label: "1:1", ratio: 1, recommended: { width: 1000, height: 1000 }, minimum: { width: 1000, height: 1000 }, tolerance: 0.02 },
        { label: "4:5", ratio: 0.8, recommended: { width: 800, height: 1000 }, minimum: { width: 100, height: 125 }, tolerance: 0.02 },
      ],
    };
    const plan = planPlacement(fixture, input({ width: 900, height: 1000 }));
    expect(plan.chosenSize!.label).toBe("4:5");
    expect(plan.fit).toBe("Needs crop");
  });
  it("is unsupported only when no size is feasible, and says what is needed", () => {
    const plan = planPlacement(byId("linkedin-single-image"), input({ width: 300, height: 300 }));
    expect(plan.fit).toBe("Unsupported");
    const issue = plan.issues.find((i) => i.field === "image")!;
    expect(issue.message).toMatch(/needs at least .* Upload an image of at least/);
  });
});

describe("status independence and copy", () => {
  it("keeps fit independent of copy problems and notes", () => {
    const plan = planPlacement(byId("meta-feed"), input({ width: 1080, height: 1350 }, { creative: { ...creative, headline: "  " } }));
    expect(plan.fit).toBe("Ready");
    expect(plan.notes.length).toBeGreaterThan(0);
    expect(plan.issues[0]).toMatchObject({ severity: "error", field: "headline" });
  });
  it("flags copy over a limit as an advisory warning", () => {
    const plan = planPlacement(byId("google-rda"), input({ width: 1200, height: 628 }, { creative: { ...creative, headline: "x".repeat(31) } }));
    const issue = plan.issues.find((i) => i.field === "headline")!;
    expect(issue.severity).toBe("warning");
    expect(issue.message).toContain("limit is 30");
    expect(issue.message).toContain("counted by the planner".replace("c", "C"));
  });
  it("requires a valid destination on network placements, not on assignment surfaces", () => {
    const noUrl = input({ width: 1200, height: 1200 }, { creative: { ...creative, destination: "" } });
    expect(planPlacement(byId("meta-feed"), noUrl).issues.some((i) => i.field === "destination")).toBe(true);
    expect(planPlacement(byId("assignment-kiosk"), noUrl).issues.some((i) => i.field === "destination")).toBe(false);
    expect(validDestination("javascript:alert(1)")).toBe(false);
  });
});

describe("goals", () => {
  it("re-ranks without changing what is generated", () => {
    const image = { width: 1200, height: 1200 };
    const awareness = planAll(input(image, { goal: "Awareness" })).plans;
    const sales = planAll(input(image, { goal: "Sales" })).plans;
    expect(sales.map((p) => p.placement.id)).toEqual(awareness.map((p) => p.placement.id));
    expect(awareness.length).toBe(placements.length);
    const right = (plans: typeof sales) => plans.find((p) => p.placement.id === "meta-right-column")!;
    expect(right(awareness).recommendedForGoal).toBe(false);
    expect(right(sales).recommendedForGoal).toBe(true);
    expect(sales.filter((p) => p.placement.network === "assignment").every((p) => !p.recommendedForGoal)).toBe(true);
  });
});

describe("composed placements", () => {
  it("measures the crop on the resolved image box, matching the renderer", () => {
    const image = { width: 1254, height: 1254 };
    const plan = planPlacement(byId("assignment-kiosk"), input(image));
    expect(plan.layoutStatus).toMatch(/ready|adapted/);
    const hero = plan.layout!.elements.find((e): e is ResolvedImage => e.kind === "image")!;
    expect(plan.crop).toEqual(coverCrop(image.width, image.height, hero.width, hero.height, hero.focalX, hero.focalY));
  });
  it("resolves every banner and assignment surface with the sample", () => {
    const plans = planAll(input({ width: 1254, height: 1254 })).plans.filter((p) => p.placement.surface);
    for (const p of plans) expect(["ready", "adapted"], p.placement.id).toContain(p.layoutStatus);
  });
  it("uses a per-placement focus without moving other crops", () => {
    const image = { width: 2000, height: 1000 };
    const base = planAll(input(image)).plans;
    const moved = planAll(input(image, { creative: { ...creative, focalOverrides: { "meta-feed": { x: 0, y: 50 } } } })).plans;
    const crop = (plans: typeof base, id: string) => plans.find((p) => p.placement.id === id)!.crop;
    expect(crop(moved, "meta-feed")!.x).toBe(0);
    expect(crop(base, "meta-feed")!.x).toBeGreaterThan(0);
    expect(crop(moved, "taboola-native")).toEqual(crop(base, "taboola-native"));
  });
});

describe("missing image", () => {
  it("marks image-dependent placements and resolves the rest as text only", () => {
    const plans = planAll(input(null)).plans;
    for (const p of plans) {
      if (p.placement.media === "required") expect(p.fit, p.placement.id).toBe("Needs image");
      else {
        expect(p.fit, p.placement.id).toBe("Text only");
        expect(p.layout!.elements.some((e) => e.kind === "image")).toBe(false);
      }
    }
  });
});
