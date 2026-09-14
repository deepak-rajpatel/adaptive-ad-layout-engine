// Resolver timing with a deterministic width stub: excludes browser font measurement and rendering.
import { bench, describe } from "vitest";
import { resolve } from "../src/engine/resolver";
import { sample, toSpec } from "../src/lib/creative";
import { surfaces } from "../src/lib/data";

const measure = (text: string, size: number) =>
  [...text].reduce((sum, c) => sum + (c === " " ? 0.28 : 0.52) * size, 0);
const spec = toSpec(sample);
const required = surfaces.slice(0, 4);
const kiosk = surfaces[3];

describe("resolve", () => {
  for (const s of required) bench(`${s.name} (${s.width}×${s.height})`, () => void resolve(spec, s, measure));
  bench("all presets", () => {
    for (const s of surfaces) resolve(spec, s, measure);
  });
  bench("kiosk at 300 px (degradation path)", () => void resolve(spec, { ...kiosk, height: 300 }, measure));
});
