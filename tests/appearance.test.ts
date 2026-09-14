// Button appearance: colors, size presets and corner rounding flow through the resolver
// without weakening minimum text size, tap targets or contrast.
import { describe, expect, it } from "vitest";
import { resolve } from "../src/engine/resolver";
import type { ResolvedElement } from "../src/engine/layout";
import type { Measure } from "../src/engine/text";
import type { Surface } from "../src/engine/surfaces";
import { sample, toSpec, validateCreative, type CreativeData } from "../src/engine/creativeModel";
import { surfaces } from "../src/lib/data";
import { parseProject } from "../src/lib/persistence";

const measure: Measure = (text, size) =>
  [...text].reduce((sum, c) => sum + (c === " " ? 0.28 : 0.52) * size, 0);
const kiosk = surfaces.find((s) => s.id === "kiosk")!;
const required = surfaces.slice(0, 4);
const button = (c: CreativeData, s: Surface) =>
  resolve(toSpec(c), s, measure).elements.find((e) => e.kind === "button") as Extract<
    ResolvedElement,
    { kind: "text" | "button" }
  >;

describe("button appearance", () => {
  it("defaults reproduce the original button: identical layouts to a spec without appearance fields", () => {
    const spec = toSpec(sample);
    const { button: _style, ...legacy } = spec;
    expect(spec.theme.buttonText).toBeUndefined();
    for (const s of surfaces.slice(0, 5)) expect(resolve(spec, s, measure)).toEqual(resolve(legacy, s, measure));
    expect(button(sample, kiosk).radius).toBe(8);
  });

  it("size presets scale the button while keeping minimum text and tap targets", () => {
    const small = button({ ...sample, buttonSize: "small" }, kiosk);
    const medium = button(sample, kiosk);
    const large = button({ ...sample, buttonSize: "large" }, kiosk);
    expect(small.fontSize).toBeLessThan(medium.fontSize);
    expect(large.fontSize).toBeGreaterThan(medium.fontSize);
    expect(large.height).toBeGreaterThan(small.height);
    for (const size of ["small", "medium", "large"] as const)
      for (const s of required) {
        const r = resolve(toSpec({ ...sample, buttonSize: size }), s, measure);
        expect(["ready", "adapted"]).toContain(r.status);
        const b = r.elements.find((e) => e.kind === "button")!;
        expect(b.kind === "button" && b.fontSize).toBeGreaterThanOrEqual(s.minTextSize);
        if (s.input !== "none") {
          expect(b.width).toBeGreaterThanOrEqual(s.minTapTarget);
          expect(b.height).toBeGreaterThanOrEqual(s.minTapTarget);
        }
      }
  });

  it("applies corner rounding and caps it at a pill", () => {
    expect(button({ ...sample, buttonRadius: 0 }, kiosk).radius).toBe(0);
    expect(button({ ...sample, buttonRadius: 20 }, kiosk).radius).toBe(20);
    for (const s of required) {
      const b = button({ ...sample, buttonRadius: 40, buttonSize: "small" }, s);
      expect(b.radius).toBeLessThanOrEqual(Math.min(b.height, b.width) / 2);
    }
  });

  it("uses a chosen button text color and contrast-checks it", () => {
    expect(button({ ...sample, buttonText: "#ffffff" }, kiosk).color).toBe("#ffffff");
    expect(button({ ...sample, accent: "#1f4d3a" }, kiosk).fill).toBe("#1f4d3a");
    const clash = resolve(toSpec({ ...sample, buttonText: "#c74620" }), kiosk, measure);
    expect(clash.status).toBe("impossible");
    expect(clash.errors[0]).toMatch(/button 1\.00:1/);
  });

  it("gives old drafts and imports the defaults and keeps their campaign type", () => {
    const { buttonText: _t, buttonSize: _s, buttonRadius: _r, ...old } = sample;
    const project = parseProject({ version: 3, creative: { ...old, campaignType: "Event" }, surface: kiosk });
    expect(project.creative).toMatchObject({
      buttonText: "",
      buttonSize: "medium",
      buttonRadius: 8,
      campaignType: "Event",
    });
  });

  it("rejects invalid appearance values", () => {
    expect(validateCreative({ ...sample, buttonSize: "huge" })).toContain("Button size must be Small, Medium or Large.");
    expect(validateCreative({ ...sample, buttonRadius: 99 }).some((e) => /rounding/.test(e))).toBe(true);
    expect(validateCreative({ ...sample, buttonText: "red" }).some((e) => /Button text color/.test(e))).toBe(true);
  });
});
