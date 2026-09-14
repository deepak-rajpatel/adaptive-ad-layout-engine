import { useState } from "react";
import type { Goal } from "../engine/placements";
import type { ExampleAd } from "../engine/examples";
import { Modal } from "./Modal";
import { ExampleCard, GoalFilters, examplesFor, useExamplePreviews } from "./ExampleCard";

/** Picks an example to start from (used on Create). Closing it changes nothing. */
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
  const previews = useExamplePreviews();
  return (
    <Modal title="Choose an example" close={onClose} className="example-dialog">
      <p className="modal-description">
        Start with an editable example and see it adapt to different screens.
      </p>
      <GoalFilters goal={goal} onChange={setGoal} label="Filter examples by goal" />
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="example-grid">
        {examplesFor(goal).map((ex) => (
          <ExampleCard
            key={ex.id}
            example={ex}
            result={previews.get(ex.id)!}
            previewHeight={170}
            onUse={onUse}
          />
        ))}
      </div>
    </Modal>
  );
}
