import { resolve } from "../src/engine/resolve.ts";
import { sample, surfaces } from "../src/lib/data.ts";
const measure = (text: string, size: number) =>
  [...text].reduce(
    (sum, character) => sum + (character === " " ? 0.28 : 0.52) * size,
    0,
  );
for (let i = 0; i < 100; i++) resolve(sample, surfaces[i % 5], measure);
const durations: number[] = [];
for (let i = 0; i < 1000; i++) {
  const start = performance.now();
  resolve(sample, surfaces[i % 5], measure);
  durations.push(performance.now() - start);
}
durations.sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      runtime: process.version,
      runs: durations.length,
      measurement:
        "deterministic test stub; excludes browser font measurement and rendering",
      meanMs: +(
        durations.reduce((a, b) => a + b, 0) / durations.length
      ).toFixed(3),
      p95Ms: +durations[949].toFixed(3),
    },
    null,
    2,
  ),
);
