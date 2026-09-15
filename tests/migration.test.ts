import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolve } from "../src/engine/resolver";
import type { Measure } from "../src/engine/text";
import { coverCrop } from "../src/engine/crop";
import { assignmentSurfaces } from "../src/engine/catalog/assignmentSurfaces";
import { sample, toSpec } from "../src/lib/creative";
import { surfaces } from "../src/lib/data";
import {
  draftKey,
  mergeLegacyPlannerSettings,
  parseProject,
  plannerSettingsKey,
  retireLegacyPlannerSettings,
  schemaVersion,
} from "../src/lib/persistence";

const measure: Measure = (text, size) =>
  [...text].reduce((sum, c) => sum + (c === " " ? 0.28 : 0.52) * size, 0);
/** Layouts resolved by the pre-migration code (schema 2, `price`), captured before the move. */
const golden = JSON.parse(
  readFileSync(new URL("./fixtures/v2-golden.json", import.meta.url), "utf8"),
) as { name: string; project: { creative: Record<string, unknown> }; layouts: Record<string, unknown> }[];
const plain = (v: unknown) => JSON.parse(JSON.stringify(v));

function withStorage(initial: Record<string, string>, run: (store: Map<string, string>) => void, failWrites = false) {
  const store = new Map(Object.entries(initial));
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (failWrites) throw new Error("quota");
      store.set(k, v);
    },
    removeItem: (k: string) => store.delete(k),
  };
  try {
    run(store);
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
}

describe("schema 3 migration", () => {
  it("renders migrated v2 projects identically on the four assignment surfaces", () => {
    expect(golden.map((g) => g.name)).toEqual(["sample", "variant"]);
    for (const g of golden) {
      const { creative } = parseProject(g.project);
      expect(creative.useGoalPriorities).toBe(false);
      for (const s of assignmentSurfaces)
        expect(plain(resolve(toSpec(creative), s, measure))).toEqual(g.layouts[s.id]);
    }
  });
  it("renames price to offer, including its priority, without truncating", () => {
    const long = golden[1].project;
    const { creative } = parseProject(long);
    expect(creative.offer).toBe(long.creative.price);
    expect(creative.offer.length).toBeGreaterThan(40);
    // Original priorities are kept exactly; the two newer elements get their defaults.
    expect(creative.priorities).toEqual({ headline: 1, image: 2, cta: 1, offer: 3, brand: 5, supporting: 3, decoration: 5, logo: 3, badge: 2 });
    expect(creative).not.toHaveProperty("price");
    expect(creative.required).toEqual({ headline: true, cta: true, brand: false, image: false, offer: false, supporting: false, decoration: false, logo: false, badge: false });
  });
  it("migrates v1 and legacy projects through to schema 3", () => {
    const legacySurface = { id: "portrait", name: "Mobile portrait", width: 360, height: 640, safe: 24, minFont: 14, minTarget: 44, minContrast: 4.5 };
    const v2Creative = golden[0].project.creative;
    const { creative } = parseProject({
      version: 1,
      // Version 1 used 1–100 where higher meant more important.
      creative: { ...v2Creative, priorities: { headline: 100, image: 70, cta: 100, brand: 30, price: 50 } },
      surface: legacySurface,
    });
    expect(creative.priorities).toEqual({ headline: 1, image: 2, cta: 1, brand: 4, offer: 3, supporting: 3, decoration: 5, logo: 3, badge: 2 });
    expect(creative.offer).toBe("From $129");
    expect(creative.useGoalPriorities).toBe(false);
  });
  it("leaves schema 3 projects and version-less schema 3 library rows untouched", () => {
    const project = { version: schemaVersion, creative: sample, surface: surfaces[0] };
    expect(parseProject(project).creative).toEqual(sample);
    expect(parseProject({ creative: sample, surface: surfaces[0] }).creative).toEqual(sample);
  });
  it("shares one crop helper with the canvas renderer's cover math", () => {
    // 1000×500 source into a 200×200 box, focus 25%/50%: the visible source square is 500×500.
    expect(coverCrop(1000, 500, 200, 200, 25, 50)).toEqual({ x: 125, y: 0, width: 500, height: 500 });
  });
});

describe("legacy planner settings", () => {
  const old = JSON.stringify({ goal: "Sales", destination: "https://example.com", body: "Hello" });
  it("merges the old planner key into the creative", () => {
    withStorage({ [plannerSettingsKey]: old }, () => {
      const merged = mergeLegacyPlannerSettings(sample);
      expect(merged).toMatchObject({ goal: "Sales", destination: "https://example.com", body: "Hello" });
    });
  });
  it("deletes the old key only after the schema 3 draft reads back", () => {
    withStorage({ [plannerSettingsKey]: old }, (store) => {
      expect(retireLegacyPlannerSettings()).toBe(false); // no draft saved yet
      expect(store.has(plannerSettingsKey)).toBe(true);
      store.set(draftKey, JSON.stringify({ version: schemaVersion, creative: sample, surface: surfaces[0] }));
      expect(retireLegacyPlannerSettings()).toBe(true);
      expect(store.has(plannerSettingsKey)).toBe(false);
    });
  });
  it("keeps the old key when the saved draft is unreadable", () => {
    withStorage({ [plannerSettingsKey]: old, [draftKey]: "broken" }, (store) => {
      expect(retireLegacyPlannerSettings()).toBe(false);
      expect(store.has(plannerSettingsKey)).toBe(true);
    });
  });
});
