import { useMemo, useState } from "react";
import type { Goal } from "../engine/placements";
import { resolve } from "../engine/resolver";
import { exampleAds, type ExampleAd } from "../engine/examples";
import { toSpec } from "../lib/creative";
import { surfaces } from "../lib/data";
import { measure } from "../lib/measure";
import { Modal } from "./Modal";
import { Preview } from "./Preview";

const filters: { label: string; goal: Goal | null }[] = [
  { label: "All", goal: null },
  { label: "Sales", goal: "Sales" },
  { label: "Leads", goal: "Leads" },
  { label: "Awareness", goal: "Awareness" },
  { label: "Traffic", goal: "Consideration" },
];
const goalLabel = (g: Goal) => (g === "Consideration" ? "Traffic" : g);

/** Picks an example to start from. Closing it changes nothing. */
export function ExampleChooser({
  error,
  onUse,
  onClose,
}: {
  /** Shown inside the dialog when loading was refused (e.g. the draft could not be kept). */
  error: string;
  onUse: (example: ExampleAd) => void;
  onClose: () => void;
}) {
  const [goal, setGoal] = useState<Goal | null>(null);
  const kiosk = surfaces[3];
  // Real resolver output for every thumbnail, at the surface the example opens on.
  const previews = useMemo(
    () => new Map(exampleAds.map((ex) => [ex.id, resolve(toSpec(ex.creative), kiosk, measure)])),
    [kiosk],
  );
  const shown = exampleAds.filter((ex) => !goal || ex.goal === goal);
  return (
    <Modal title="Choose an example" close={onClose} className="example-dialog">
      <p className="modal-description">
        Start with an editable example and see it adapt to different screens.
      </p>
      <div className="example-filters" role="group" aria-label="Filter examples by goal">
        {filters.map((f) => (
          <button
            key={f.label}
            className={`chip${goal === f.goal ? " active" : ""}`}
            aria-pressed={goal === f.goal}
            onClick={() => setGoal(f.goal)}
          >
            {f.label}
          </button>
        ))}
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="example-grid">
        {shown.map((ex) => (
          <article key={ex.id} className="example-card" data-example-id={ex.id}>
            <div className="example-thumb">
              <Preview surface={kiosk} result={previews.get(ex.id)!} maxHeight={170} />
            </div>
            <h3>{ex.name}</h3>
            <p>{goalLabel(ex.goal)}</p>
            <button className="button outline" onClick={() => onUse(ex)}>
              Use this example
            </button>
          </article>
        ))}
      </div>
    </Modal>
  );
}
