import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const engineDir = resolve(dirname(fileURLToPath(import.meta.url)), "../src/engine");
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? files(join(dir, d.name)) : d.name.endsWith(".ts") ? [join(dir, d.name)] : [],
  );

describe("engine purity", () => {
  it("imports only other engine modules and uses no DOM globals", () => {
    const problems: string[] = [];
    for (const file of files(engineDir)) {
      const source = readFileSync(file, "utf8");
      const name = relative(engineDir, file);
      for (const [, spec] of source.matchAll(/from\s+["']([^"']+)["']/g)) {
        const target = spec.startsWith(".") ? resolve(dirname(file), spec) : null;
        if (!target || !target.startsWith(engineDir)) problems.push(`${name} imports "${spec}"`);
      }
      if (/\b(document|window|localStorage|navigator)\s*\./.test(source))
        problems.push(`${name} uses a DOM global`);
    }
    expect(problems).toEqual([]);
  });
});
