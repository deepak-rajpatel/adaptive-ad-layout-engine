// Shared example browsing pieces: goal filters, resolved previews and the example card.
// Used by the Home gallery and the Create page's chooser.
import { useMemo } from "react";
import type { Goal } from "../engine/placements";
import type { ResolvedLayout } from "../engine/layout";
import { resolve } from "../engine/resolver";
import { exampleAds, type ExampleAd } from "../engine/examples";
import { toSpec } from "../lib/creative";
import { surfaces } from "../lib/data";
import { measure } from "../lib/measure";
import { Preview } from "./Preview";

/** Examples open on the retail kiosk, so their thumbnails show exactly that layout. */
export const exampleSurface = surfaces[3];

export const goalFilters: { label: string; goal: Goal | null }[] = [
  { label: "All", goal: null },
  { label: "Sales", goal: "Sales" },
  { label: "Leads", goal: "Leads" },
  { label: "Awareness", goal: "Awareness" },
  { label: "Traffic", goal: "Consideration" },
];
export const goalLabel = (g: Goal) => (g === "Consideration" ? "Traffic" : g);
export const examplesFor = (goal: Goal | null) =>
  exampleAds.filter((ex) => !goal || ex.goal === goal);

/** Real resolver output for every example on the surface it opens with. */
export function useExamplePreviews(): Map<string, ResolvedLayout> {
  return useMemo(
    () =>
      new Map(
        exampleAds.map((ex) => [ex.id, resolve(toSpec(ex.creative), exampleSurface, measure)]),
      ),
    [],
  );
}

export function GoalFilters({
  goal,
  onChange,
  label,
}: {
  goal: Goal | null;
  onChange: (goal: Goal | null) => void;
  label: string;
}) {
  return (
    <div className="example-filters" role="group" aria-label={label}>
      {goalFilters.map((f) => (
        <button
          key={f.label}
          className={`chip${goal === f.goal ? " active" : ""}`}
          aria-pressed={goal === f.goal}
          onClick={() => onChange(f.goal)}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

export function ExampleCard({
  example,
  result,
  previewHeight,
  onUse,
}: {
  example: ExampleAd;
  result: ResolvedLayout;
  previewHeight: number;
  onUse: (example: ExampleAd) => void;
}) {
  return (
    <article className="example-card" data-example-id={example.id}>
      <div className="example-thumb">
        <Preview surface={exampleSurface} result={result} maxHeight={previewHeight} />
      </div>
      <h3>{example.name}</h3>
      <p className="example-goal">{goalLabel(example.goal)}</p>
      <button
        className="button outline"
        aria-label={`Use this example: ${example.name}`}
        onClick={() => onUse(example)}
      >
        Use this example
      </button>
    </article>
  );
}
