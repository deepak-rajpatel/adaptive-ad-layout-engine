// Compile-time guarantees. `tsc -b` fails if any @ts-expect-error line stops being an error.
import { describe, expect, it } from "vitest";
import { defineAd, type ElementSpec } from "../src/engine/spec";
import { defineSurface, insets } from "../src/engine/surfaces";
import type { SurfaceTemplate } from "../src/engine/catalog/types";

describe("type-level spec safety", () => {
  it("rejects invalid role/type pairs, unknown roles, priorities, and truncation targets", () => {
    const invalid: ElementSpec[] = [
      // @ts-expect-error a hero must be an image
      { id: "h", role: "hero", type: "text", priority: 1, content: "x" },
      // @ts-expect-error unknown role
      { id: "q", role: "qr-code", type: "text", priority: 1, content: "x" },
      // @ts-expect-error priority is 1–5
      { id: "p", role: "primary", type: "text", priority: 9, content: "x" },
      // @ts-expect-error only secondary text may truncate
      { id: "c", role: "action", type: "button", priority: 2, truncate: true, content: "x" },
    ];
    expect(invalid).toHaveLength(4);
  });
  it("rejects a tap target on a non-interactive surface", () => {
    expect(() =>
      // @ts-expect-error input "none" cannot declare minTapTarget
      defineSurface({ id: "tv", name: "TV", width: 800, height: 200, safeArea: insets(8), minTextSize: 24, minContrast: 4.5, viewingDistance: "far", input: "none", minTapTarget: 44 }),
    ).toThrow();
  });
  it("keeps the input/tap-target union on placement surface templates", () => {
    // @ts-expect-error input "none" cannot declare minTapTarget
    const t: SurfaceTemplate = { safeArea: insets(8), minTextSize: 24, minContrast: 4.5, viewingDistance: "far", input: "none", minTapTarget: 44 };
    expect(t.input).toBe("none");
  });
  it("accepts a valid spec and keeps its literal types", () => {
    const ad = defineAd({
      elements: [
        { id: "headline", type: "text", role: "primary", priority: 1, required: true, content: "Hi" },
        { id: "cta", type: "button", role: "action", priority: 2, required: true, content: "Go" },
      ],
      theme: { background: "#ffffff", foreground: "#111111", accent: "#0b57d0" },
      focal: { x: 50, y: 50 },
    });
    const role: "primary" | "action" = ad.elements[0].role;
    expect(role).toBe("primary");
  });
});
