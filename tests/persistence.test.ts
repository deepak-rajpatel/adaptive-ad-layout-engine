import { describe, expect, it } from "vitest";
import { parseProject } from "../src/lib/persistence";
import { sample, surfaces } from "../src/lib/data";
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
