import { useRef } from "react";
import { ArrowRight, Plus, Upload } from "lucide-react";
import type { ResolvedLayout } from "../engine/layout";
import type { Surface } from "../engine/surfaces";
import type { ExampleAd } from "../engine/examples";
import type { SavedCreative } from "../lib/persistence";
import { editedAgo } from "../lib/time";
import { ExampleGallery } from "./ExampleGallery";
import { Preview } from "./Preview";

/**
 * Home: heading with Create an ad, then (only with real work) recent creatives, the example
 * gallery, and a compact create-from-scratch section. Nothing shown is fabricated: recent
 * items come from the draft and the saved library; examples are labelled as examples.
 */
export function HomePage({
  draft,
  recent,
  storageLabel,
  onContinue,
  onCreate,
  onUseExample,
  onImport,
  onOpen,
  onViewAll,
}: {
  /** The current draft when it is real user work; null otherwise. */
  draft: { name: string; editedAt: string; surface: Surface; result: ResolvedLayout } | null;
  /** Recent saved creatives, excluding any identical to the current draft. */
  recent: { item: SavedCreative; result: ResolvedLayout }[];
  storageLabel: string;
  onContinue: () => void;
  onCreate: () => void;
  onUseExample: (example: ExampleAd) => void;
  onImport: (file: File) => void;
  onOpen: (item: SavedCreative) => void;
  onViewAll: () => void;
}) {
  const importRef = useRef<HTMLInputElement>(null);
  const returning = !!draft || recent.length > 0;
  return (
    <section className="home" aria-labelledby="home-title">
      <div className="home-hero">
        <div>
          <h1 id="home-title">Create one ad. Adapt it to multiple screens.</h1>
          <p className="home-lede">
            Add your message and an optional image. Preview how your ad adjusts to
            mobile, kiosk, and banner sizes.
          </p>
        </div>
        <button className="button primary home-cta" onClick={onCreate}>
          <Plus size={17} /> Create an ad
        </button>
      </div>

      {returning && (
        <section className="home-recent" aria-labelledby="recent-title">
          <div className="home-recent-head">
            <h2 id="recent-title">Your recent creatives</h2>
            <button className="text-link" onClick={onViewAll}>
              View all <ArrowRight size={14} />
            </button>
          </div>
          <div className="home-recent-grid">
            {draft && (
              <article className="recent-card continue-card">
                <div className="home-thumb">
                  <Preview surface={draft.surface} result={draft.result} maxHeight={150} />
                </div>
                <span className="home-label">Current draft</span>
                <strong>{draft.name}</strong>
                <small>
                  {draft.editedAt} · {draft.surface.name}
                </small>
                <button className="button primary small" onClick={onContinue}>
                  Continue editing <ArrowRight size={15} />
                </button>
              </article>
            )}
            {recent.map(({ item, result }) => (
              <button
                key={item.id}
                className="recent-card"
                onClick={() => onOpen(item)}
                aria-label={`Open ${item.name}`}
              >
                <div className="home-thumb">
                  <Preview surface={item.surface} result={result} maxHeight={150} />
                </div>
                <strong>{item.name}</strong>
                <small>{editedAgo(item.updated_at)}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      <ExampleGallery onUse={onUseExample} />

      <section className="home-scratch" aria-labelledby="scratch-title">
        <div>
          <h2 id="scratch-title">Have your own idea?</h2>
          <p>Start with your message and an optional image.</p>
        </div>
        <div className="home-scratch-actions">
          <button className="button primary" onClick={onCreate}>
            Create an ad
          </button>
          <button className="button" onClick={() => importRef.current?.click()}>
            <Upload size={15} /> Import a project
          </button>
        </div>
      </section>

      <p className="home-storage">
        {returning ? storageLabel : "Drafts save automatically in this browser."}
      </p>
      <input
        ref={importRef}
        hidden
        type="file"
        accept="application/json,.json"
        aria-label="Import a project file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImport(file);
          e.target.value = "";
        }}
      />
    </section>
  );
}
