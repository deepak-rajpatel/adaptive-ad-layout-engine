import { useMemo, useRef } from "react";
import { ArrowRight, Plus, Upload } from "lucide-react";
import type { ResolvedLayout } from "../engine/layout";
import type { Surface } from "../engine/surfaces";
import { resolve } from "../engine/resolver";
import { sample, toSpec } from "../lib/creative";
import { surfaces } from "../lib/data";
import { measure } from "../lib/measure";
import type { SavedCreative } from "../lib/persistence";
import { editedAgo } from "../lib/time";
import { Preview } from "./Preview";

/**
 * Home: first visit (no user work) or returning (a real draft and/or saved creatives).
 * Everything shown comes from the current draft and the saved library; nothing is sample data
 * except the explicitly labelled example.
 */
export function HomePage({
  draft,
  recent,
  storageLabel,
  onContinue,
  onCreate,
  onExample,
  onImport,
  onOpen,
  onViewAll,
}: {
  /** The current draft when it is real user work; null otherwise. */
  draft: { name: string; editedAt: string; surface: Surface; result: ResolvedLayout } | null;
  recent: { item: SavedCreative; result: ResolvedLayout }[];
  storageLabel: string;
  onContinue: () => void;
  onCreate: () => void;
  onExample: () => void;
  onImport: (file: File) => void;
  onOpen: (item: SavedCreative) => void;
  onViewAll: () => void;
}) {
  const importRef = useRef<HTMLInputElement>(null);
  const kiosk = surfaces[3];
  const example = useMemo(() => resolve(toSpec(sample), kiosk, measure), [kiosk]);
  const returning = !!draft || recent.length > 0;
  const importInput = (
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
  );
  const importButton = (
    <button className="text-link" onClick={() => importRef.current?.click()}>
      <Upload size={15} /> Import a project
    </button>
  );

  if (!returning)
    return (
      <section className="home home-first" aria-labelledby="home-title">
        <h1 id="home-title">Create one ad. Adapt it to multiple screens.</h1>
        <p className="home-lede">
          Add your message and an optional image. Preview how your ad adjusts to
          mobile, kiosk, and banner sizes.
        </p>
        <div className="home-choices">
          <article className="home-card">
            <span className="home-plus" aria-hidden="true">
              <Plus size={26} />
            </span>
            <h2>Create an ad</h2>
            <p>Start with your own message, then customise your ad.</p>
            <button className="button primary wide" onClick={onCreate}>
              Create an ad
            </button>
          </article>
          <article className="home-card">
            <div className="home-thumb">
              <Preview surface={kiosk} result={example} maxHeight={150} />
            </div>
            <h2>Explore an example</h2>
            <p>See how the same ad adapts to different screen sizes.</p>
            <button className="button outline wide" onClick={onExample}>
              Try an example
            </button>
          </article>
        </div>
        <div className="home-import">{importButton}</div>
        <p className="home-storage">Drafts save automatically in this browser.</p>
        {importInput}
      </section>
    );

  return (
    <section className="home home-returning" aria-labelledby="home-title">
      <h1 id="home-title">Welcome back.</h1>
      <p className="home-lede">Pick up where you left off, or start something new.</p>
      <div className={`home-top ${draft ? "" : "single"}`}>
        {draft && (
          <article className="home-card continue-card">
            <div className="home-thumb">
              <Preview surface={draft.surface} result={draft.result} maxHeight={180} />
            </div>
            <div className="continue-body">
              <span className="home-label">Current draft</span>
              <h2>{draft.name}</h2>
              <p>
                {draft.editedAt} · {draft.surface.name}
              </p>
              <button className="button primary" onClick={onContinue}>
                Continue editing <ArrowRight size={16} />
              </button>
            </div>
          </article>
        )}
        <article className="home-card new-card">
          <span className="home-plus" aria-hidden="true">
            <Plus size={24} />
          </span>
          <h2>Create a new ad</h2>
          <button className="button outline" onClick={onCreate}>
            Create an ad
          </button>
          <div className="new-card-links">
            <button className="text-link" onClick={onExample}>
              Try an example
            </button>
            {importButton}
          </div>
        </article>
      </div>
      {recent.length > 0 && (
        <section className="home-recent" aria-labelledby="recent-title">
          <div className="home-recent-head">
            <h2 id="recent-title">Recent creatives</h2>
            <button className="text-link" onClick={onViewAll}>
              View all <ArrowRight size={14} />
            </button>
          </div>
          <div className="home-recent-grid">
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
      <p className="home-storage">{storageLabel}</p>
      {importInput}
    </section>
  );
}
