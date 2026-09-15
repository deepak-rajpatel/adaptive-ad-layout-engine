import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Goal } from "../engine/placements";
import type { ExampleAd } from "../engine/examples";
import { ExampleCard, GoalFilters, examplesFor, useExamplePreviews } from "./ExampleCard";

/**
 * Home's example row: one horizontally scrollable strip (native scrolling and swiping,
 * scroll snapping), labelled previous/next buttons, no auto-advance. Changing the filter
 * returns the row to its start. Scrolling stays inside the row.
 */
export function ExampleGallery({ onUse }: { onUse: (example: ExampleAd) => void }) {
  const [goal, setGoal] = useState<Goal | null>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const row = useRef<HTMLDivElement>(null);
  const previews = useExamplePreviews();
  const shown = examplesFor(goal);
  const updateEdges = () => {
    const el = row.current;
    if (!el) return;
    setEdges({
      start: el.scrollLeft <= 2,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
    });
  };
  useEffect(() => {
    const el = row.current;
    if (el) el.scrollLeft = 0;
    updateEdges();
  }, [goal]);
  useEffect(() => {
    window.addEventListener("resize", updateEdges);
    return () => window.removeEventListener("resize", updateEdges);
  }, []);
  const page = (direction: 1 | -1) => {
    const el = row.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: "smooth" });
  };
  return (
    <section className="example-gallery" aria-labelledby="examples-title">
      <div className="gallery-head">
        <div>
          <h2 id="examples-title">Find your next starting point</h2>
          <p>Eight editable examples. Make one yours.</p>
        </div>
        <GoalFilters goal={goal} onChange={setGoal} label="Filter examples by goal" />
        <div className="gallery-nav">
          <button
            className="icon-button"
            aria-label="Previous examples"
            disabled={edges.start}
            onClick={() => page(-1)}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            className="icon-button"
            aria-label="Next examples"
            disabled={edges.end}
            onClick={() => page(1)}
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
      <div
        ref={row}
        className="gallery-row"
        role="region"
        aria-label="Examples (scroll sideways for more)"
        tabIndex={0}
        onScroll={updateEdges}
      >
        {shown.map((ex) => (
          <ExampleCard
            key={ex.id}
            example={ex}
            result={previews.get(ex.id)!}
            previewHeight={262}
            onUse={onUse}
          />
        ))}
      </div>
    </section>
  );
}
