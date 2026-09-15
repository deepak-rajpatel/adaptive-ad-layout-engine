import { describe, expect, it } from "vitest";
import { parseProject, readLibrary, writeLibrary } from "../src/lib/persistence";
import { sample, surfaces } from "../src/lib/data";
// A creative as saved under schema 2, before `price` became `offer`.
const { offer, priorities, ...rest } = sample;
const v2 = { ...rest, price: offer, priorities: { headline: priorities.headline, image: priorities.image, cta: priorities.cta, brand: priorities.brand, price: priorities.offer } };
describe("portable project validation", () => {
  it("round-trips a creative and surface", () => {
    const data = { creative: sample, surface: surfaces[0] };
    expect(parseProject(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });
  it("rejects malformed imports instead of crashing the editor", () => {
    for (const value of [
      null,
      [],
      {},
      { creative: sample },
      { creative: { ...sample, focalX: Infinity }, surface: surfaces[0] },
    ])
      expect(() => parseProject(value)).toThrow();
  });
  it("upgrades projects saved before the brief-aligned model", () => {
    const legacy = {
      creative: { ...v2, priorities: { brand: 30, headline: 100, image: 70, price: 50, cta: 100 } },
      surface: { id: "kiosk", name: "Retail kiosk", width: 600, height: 600, safe: 32, minFont: 14, minTarget: 44, minContrast: 4.5 },
    };
    const { creative, surface } = parseProject(legacy);
    expect(creative.priorities).toEqual({ brand: 4, headline: 1, image: 2, offer: 3, cta: 1, supporting: 3, decoration: 5, logo: 3, badge: 2 });
    expect(surface).toMatchObject({ safeArea: { top: 32, right: 32, bottom: 32, left: 32 }, minTextSize: 14, input: "touch", minTapTarget: 44 });
  });
  it("migrates legacy projects whose headline priority is not above 5", () => {
    const legacySurface = { id: "portrait", name: "Mobile portrait", width: 360, height: 640, safe: 24, minFont: 14, minTarget: 44, minContrast: 4.5 };
    const { creative } = parseProject({
      creative: { ...v2, priorities: { headline: 1, image: 80, cta: 100, brand: 40, price: 60 } },
      surface: legacySurface,
    });
    expect(creative.priorities).toEqual({ headline: 5, image: 2, cta: 1, brand: 4, offer: 3, supporting: 3, decoration: 5, logo: 3, badge: 2 });
    // Version 1 exports are legacy even when every priority happens to be 1–5.
    const v1 = parseProject({ version: 1, creative: { ...v2, priorities: { headline: 5, image: 3, cta: 5, brand: 1, price: 2 } }, surface: legacySurface });
    expect(v1.creative.priorities.brand).toBe(5);
  });
  it("leaves current-schema projects untouched and converts out-of-range priorities", () => {
    const current = { ...sample, priorities: { headline: 5, image: 5, cta: 5, brand: 5, offer: 5, supporting: 5, decoration: 5, logo: 5, badge: 5 } } as const;
    expect(parseProject({ version: 3, creative: current, surface: surfaces[0] }).creative).toEqual(current);
    const mixed = parseProject({ creative: { ...sample, priorities: { ...sample.priorities, image: 70 } }, surface: surfaces[0] });
    expect(mixed.creative.priorities.image).toBe(2);
  });
  it("reports, rather than silently hiding, library entries it cannot read", () => {
    const store = new Map<string, string>();
    const good = { id: "a", name: "A", collection: "C", favorite: false, updated_at: "2026-09-14T00:00:00Z", creative: sample, surface: surfaces[0] };
    store.set("omniframe:library:v1", JSON.stringify([good, { ...good, id: "b", creative: null }]));
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null };
    try {
      const { items, skipped } = readLibrary();
      expect(items.map((i) => i.id)).toEqual(["a"]);
      expect(skipped).toBe(1);
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
  it("preserves unreadable records through saves and favorite changes", () => {
    const store = new Map<string, string>();
    const good = { id: "a", name: "A", collection: "C", favorite: false, updated_at: "2026-09-14T00:00:00Z", creative: sample, surface: surfaces[0] };
    const unreadable = { ...good, id: "b", creative: null };
    store.set("omniframe:library:v1", JSON.stringify([good, unreadable]));
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    };
    try {
      writeLibrary([{ ...good, id: "c" }, ...readLibrary().items]);
      writeLibrary(readLibrary().items.map((item) => ({ ...item, favorite: true })));
      const stored = JSON.parse(store.get("omniframe:library:v1")!);
      expect(stored).toHaveLength(3);
      expect(stored.find((item: { id: string }) => item.id === "b")).toEqual(unreadable);
      expect(readLibrary().skipped).toBe(1);
      store.set("omniframe:library:v1", "broken JSON");
      expect(() => writeLibrary([good])).toThrow();
      expect(store.get("omniframe:library:v1")).toBe("broken JSON");
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
  it("removes executable reference URLs from imported metadata", () => {
    expect(
      parseProject({
        creative: sample,
        surface: { ...surfaces[0], source: "javascript:alert(1)" },
      }).surface.source,
    ).toBeUndefined();
  });
  it("rejects object-valued display metadata", () => {
    expect(() =>
      parseProject({
        creative: sample,
        surface: { ...surfaces[0], name: { nested: "invalid" } },
      }),
    ).toThrow();
  });
});
