import { useMemo, useRef } from "react";
import { ArrowRight, Plus, Upload } from "lucide-react";
import type { ResolvedLayout } from "../engine/layout";
import type { Surface } from "../engine/surfaces";
import { exampleAds, type ExampleAd } from "../engine/examples";
import { resolve } from "../engine/resolver";
import { toSpec } from "../lib/creative";
import { surfaces } from "../lib/data";
import { measure } from "../lib/measure";
import type { SavedCreative } from "../lib/persistence";
import { editedAgo } from "../lib/time";
import { ExampleGallery } from "./ExampleGallery";
import { Preview } from "./Preview";

/** Hero demonstration: one example creative on three assignment surfaces, via the real resolver. */
const demoCreative = toSpec(exampleAds[0].creative);
const demoSurfaces = { portrait: surfaces[0], kiosk: surfaces[3], broadcast: surfaces[2] };

function DemoFrame({ surface, result, maxHeight }: { surface: Surface; result: ResolvedLayout; maxHeight: number }) {
  return (
    <figure className="hero-frame">
      <figcaption>
        {surface.width} × {surface.height}
      </figcaption>
      <Preview surface={surface} result={result} maxHeight={maxHeight} />
    </figure>
  );
}

function HeroDemo({ compact = false }: { compact?: boolean }) {
  const h = compact ? { portrait: 150, kiosk: 120, broadcast: 48 } : { portrait: 260, kiosk: 220, broadcast: 90 };
  const layouts = useMemo(
    () => ({
      portrait: resolve(demoCreative, demoSurfaces.portrait, measure),
      kiosk: resolve(demoCreative, demoSurfaces.kiosk, measure),
      broadcast: resolve(demoCreative, demoSurfaces.broadcast, measure),
    }),
    [],
  );
  return (
    <div
      className={`hero-demo${compact ? " compact" : ""}`}
      aria-label="The same creative adapted to three screens"
      role="group"
    >
      <div className="hero-demo-top">
        <DemoFrame surface={demoSurfaces.portrait} result={layouts.portrait} maxHeight={h.portrait} />
        <DemoFrame surface={demoSurfaces.kiosk} result={layouts.kiosk} maxHeight={h.kiosk} />
      </div>
      <DemoFrame surface={demoSurfaces.broadcast} result={layouts.broadcast} maxHeight={h.broadcast} />
      {!compact && <p className="hero-demo-note">Same creative, different surfaces.</p>}
    </div>
  );
}

/**
 * Home: hero with Create an ad, then (only with real work) recent creatives, the example
 * gallery, and a compact create-from-scratch strip. Nothing shown is fabricated: recent
 * items come from the draft and the saved library; the hero demo is live resolver output.
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
    <section className={`home${returning ? " is-returning" : ""}`} aria-labelledby="home-title">
      <div className="home-hero">
        <div className="home-hero-text">
          <p className="home-eyebrow">Ad creation</p>
          <h1 id="home-title">One ad. Every screen.</h1>
          <p className="home-lede">Create an ad that adapts to mobile, banners and kiosks.</p>
          <div className="home-hero-actions">
            <button className="button primary home-cta" onClick={onCreate}>
              <Plus size={18} /> Create an ad
            </button>
            <button className="button home-import" onClick={() => importRef.current?.click()}>
              <Upload size={15} /> Import project
            </button>
          </div>
        </div>
        <HeroDemo compact={returning} />
      </div>

      {returning && (
        <section className="home-recent" aria-labelledby="recent-title">
          <div className="home-recent-head">
            <h2 id="recent-title">Your recent creatives</h2>
            <button className="text-link" onClick={onViewAll}>
              View all <ArrowRight size={14} />
            </button>
          </div>
          <div className={`home-recent-grid${draft && recent.length === 0 ? " single" : ""}`}>
            {draft && (
              <article className="recent-card continue-card">
                <div className="home-thumb">
                  <Preview surface={draft.surface} result={draft.result} maxHeight={recent.length ? 150 : 96} />
                </div>
                <div className="continue-info">
                  <span className="home-label">Current draft</span>
                  <strong>{draft.name}</strong>
                  <small>
                    {draft.editedAt} · {draft.surface.name}
                  </small>
                </div>
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
          <h2 id="scratch-title">Have something in mind?</h2>
          <p>Start with your own message and an optional image.</p>
        </div>
        <button className="button primary" onClick={onCreate}>
          Create from scratch <ArrowRight size={16} />
        </button>
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
