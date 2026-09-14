import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronDown,
  FileText,
  ImagePlus,
  Star,
} from "lucide-react";
import { networks } from "../engine/catalog/data";
import {
  batchExport,
  planAll,
  summarizeSkipped,
  uploadRecommendation,
  type BatchExport,
  type ExportFile,
} from "../engine/catalog/plan";
import type { CropRect } from "../engine/crop";
import {
  fitStatuses,
  goals,
  type FitStatus,
  type Format,
  type Goal,
  type NetworkId,
  type PlacementPlan,
} from "../engine/catalog/types";
import type { ResolvedLayout } from "../engine/layout";
import { goalCta, type AssetInfo } from "../engine/placements";
import { goalOrder, intentCopy } from "../engine/creativeModel";
import { inspectAsset } from "../lib/assetInfo";
import type { Creative } from "../lib/creative";
import { measure } from "../lib/measure";
import { renderExport } from "../lib/exporter";
import { download } from "../lib/persistence";
import { renderDom } from "../render/dom";

type GroupBy = "network" | "goal" | "size" | "status";
const groupLabels: Record<GroupBy, string> = {
  network: "Network",
  goal: "Goal",
  size: "Size",
  status: "Status",
};
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const networkName = (id: NetworkId) =>
  networks.find((n) => n.id === id)?.name ?? id;
const assignmentNote =
  "The assignment's four surfaces, composed by the layout engine from your creative.";

const sizeOrder = [
  "9:16 vertical",
  "4:5 portrait",
  "1:1 square",
  "1.91:1 / 16:9 landscape",
  "4:3",
  "Fixed banner sizes",
  "Assignment surfaces",
  "Other",
];
function sizeBucket(p: PlacementPlan) {
  if (p.placement.network === "assignment") return "Assignment surfaces";
  if (p.format.id === "google-display-banner") return "Fixed banner sizes";
  const r = (p.chosenSize ?? p.placement.accepts[0]).ratio;
  const near = (x: number) => Math.abs(r / x - 1) < 0.03;
  if (near(9 / 16)) return "9:16 vertical";
  if (near(4 / 5)) return "4:5 portrait";
  if (near(1)) return "1:1 square";
  if (near(1.91) || near(16 / 9)) return "1.91:1 / 16:9 landscape";
  if (near(4 / 3)) return "4:3";
  return "Other";
}

interface Section {
  title: string;
  note?: string;
  plans: PlacementPlan[];
  setup: Format[];
}
function group(
  plans: PlacementPlan[],
  setup: Format[],
  by: GroupBy,
): Section[] {
  const recommendedFirst = (a: PlacementPlan, b: PlacementPlan) =>
    Number(b.recommendedForGoal) - Number(a.recommendedForGoal);
  const assignment = plans.filter((p) => p.placement.network === "assignment");
  const sections: Section[] =
    by === "network"
      ? networks.map((n) => ({
          title: n.name,
          note: n.id === "assignment" ? assignmentNote : undefined,
          plans: plans.filter((p) => p.placement.network === n.id),
          setup: setup.filter((f) => f.network === n.id),
        }))
      : by === "goal"
        ? [
            ...goals.map((g) => ({
              title: intentCopy[g].label,
              plans: plans.filter(
                (p) =>
                  p.placement.network !== "assignment" &&
                  p.objectives.some((o) => o.goal === g),
              ),
              setup: [],
            })),
            {
              title: "Assignment surfaces",
              note: assignmentNote,
              plans: assignment,
              setup: [],
            },
          ]
        : by === "size"
          ? sizeOrder.map((t) => ({
              title: t,
              plans: plans.filter((p) => sizeBucket(p) === t),
              setup: [],
            }))
          : fitStatuses.map((s) => ({
              title: s,
              plans: plans.filter((p) => p.fit === s),
              setup: [],
            }));
  if (by !== "network" && setup.length)
    sections.push({ title: "Setup-only formats", plans: [], setup });
  return sections
    .map((s) => ({ ...s, plans: [...s.plans].sort(recommendedFirst) }))
    .filter((s) => s.plans.length || s.setup.length);
}

/** Mounts a resolved layout at native size, scaled down to fit the thumbnail box. */
function LayoutThumb({
  layout,
  safeArea,
}: {
  layout: ResolvedLayout;
  safeArea?: { top: number; right: number; bottom: number; left: number };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scale = Math.min(260 / layout.width, 220 / layout.height, 1);
  useEffect(() => {
    const board = renderDom(layout, { guides: !!safeArea, safeArea });
    Object.assign(board.style, {
      transform: `scale(${scale})`,
      transformOrigin: "top left",
    });
    ref.current?.replaceChildren(board);
  }, [layout, safeArea, scale]);
  return (
    <div
      ref={ref}
      className="plan-thumb"
      style={{ width: layout.width * scale, height: layout.height * scale }}
      aria-hidden="true"
    />
  );
}

function PlatformThumb({
  plan,
  creative,
  hasImage,
}: {
  plan: PlacementPlan;
  creative: Creative;
  hasImage: boolean;
}) {
  const size = (plan.chosenSize ?? plan.placement.accepts[0]).recommended;
  const scale = Math.min(260 / size.width, 180 / size.height);
  const focal = creative.focalOverrides[plan.placement.id] ?? {
    x: creative.focalX,
    y: creative.focalY,
  };
  return (
    <div className={`native-mockup native-${slug(plan.format.container)}`}>
      <div
        className="native-media"
        style={{ width: size.width * scale, height: size.height * scale }}
      >
        {hasImage && plan.fit !== "Needs image" ? (
          <img
            src={creative.image}
            alt=""
            style={{ objectPosition: `${focal.x}% ${focal.y}%` }}
          />
        ) : (
          <div className="native-placeholder">
            <ImagePlus size={22} />
            <span>Image required</span>
          </div>
        )}
      </div>
      <div className="native-copy">
        <strong>{creative.headline || "Your headline"}</strong>
        <span className="native-cta">
          {creative.cta || "Learn more"} <ArrowRight size={12} />
        </span>
      </div>
    </div>
  );
}

/** The whole source image with the kept crop outlined and the cropped-away area dimmed. */
function CropPreview({
  src,
  image,
  crop,
}: {
  src: string;
  image: AssetInfo;
  crop: CropRect;
}) {
  const scale = Math.min(260 / image.width, 140 / image.height);
  return (
    <div
      className="crop-preview"
      style={{ width: image.width * scale, height: image.height * scale }}
      role="img"
      aria-label={`Kept area: ${Math.round(crop.width)} × ${Math.round(crop.height)} of ${image.width} × ${image.height}`}
    >
      <img src={src} alt="" />
      <div
        className="crop-keep"
        style={{
          left: crop.x * scale,
          top: crop.y * scale,
          width: crop.width * scale,
          height: crop.height * scale,
        }}
      />
    </div>
  );
}

function PlanCard({
  plan,
  creative,
  hasImage,
  image,
  guides,
  selected,
  onToggle,
  onOpenStudio,
  onFocus,
  onDownload,
}: {
  plan: PlacementPlan;
  creative: Creative;
  hasImage: boolean;
  image: AssetInfo | null;
  guides: boolean;
  selected: boolean;
  onToggle: () => void;
  onOpenStudio: () => void;
  /** Sets this placement's crop focus; null resets it to the creative default. */
  onFocus: (focal: { x: number; y: number } | null) => void;
  onDownload: () => void;
}) {
  const p = plan.placement;
  const served = [...new Set(plan.objectives.map((o) => o.goal))];
  const size = plan.chosenSize;
  const [adjusting, setAdjusting] = useState(false);
  const override = creative.focalOverrides[p.id];
  const focal = override ?? { x: creative.focalX, y: creative.focalY };
  const issues = plan.issues.length;
  const dims = size
    ? `${size.recommended.width} × ${size.recommended.height}`
    : p.accepts.map((a) => a.label).join(", ");
  return (
    <article
      className={`plan-card${selected ? " selected" : ""}${plan.recommendedForGoal ? " recommended" : ""}`}
      data-placement-id={p.id}
    >
      <header className="plan-card-head">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select ${p.name}`}
        />
        <div className="plan-card-title">
          <h3>{p.name}</h3>
          <span>
            {networkName(p.network)} · {plan.format.name}
          </span>
          <span className="plan-dims">{dims}</span>
        </div>
        <div className="plan-badges">
          <span className={`planner-fit fit-${slug(plan.fit)}`}>
            {plan.fit === "Ready" && <Check size={12} />}
            {plan.fit}
          </span>
          {plan.layoutStatus !== "n/a" && (
            <span className={`plan-layout layout-${plan.layoutStatus}`}>
              Layout {plan.layoutStatus}
            </span>
          )}
          {issues > 0 && (
            <span className="plan-issue-count">
              {issues} {issues === 1 ? "issue" : "issues"}
            </span>
          )}
        </div>
      </header>
      <div className="plan-preview">
        {plan.layout &&
        (plan.layoutStatus === "ready" || plan.layoutStatus === "adapted") ? (
          <LayoutThumb
            layout={plan.layout}
            safeArea={guides ? p.surface?.safeArea : undefined}
          />
        ) : p.surface ? (
          <div className="native-placeholder plan-empty-thumb">
            No valid layout at this size
          </div>
        ) : (
          <PlatformThumb plan={plan} creative={creative} hasImage={hasImage} />
        )}
      </div>
      <footer className="plan-card-foot">
        <button className="text-link" disabled={!size} onClick={onOpenStudio}>
          Open in Ad Designer <ArrowRight size={13} />
        </button>
        {plan.pngExport.available && (
          <button className="text-button" onClick={onDownload}>
            <ArrowDownToLine size={13} />{" "}
            {plan.pngExport.kind === "image-asset" ? "Image asset" : "PNG"}
          </button>
        )}
      </footer>
      <details className="plan-details">
        <summary>
          <span>View details</span>
          <ChevronDown size={14} className="chev" />
        </summary>
        <div className="plan-details-body">
          {plan.recommendedForGoal ? (
            <p className="plan-recommended">
              <Star size={11} /> Recommended for your goal
            </p>
          ) : (
            served.length > 0 && (
              <p className="plan-served">
                Better for {served.map((g) => intentCopy[g].label).join(", ")}
              </p>
            )
          )}
          <p className="plan-size">
            {size
              ? `${size.label} · ${size.recommended.width} × ${size.recommended.height}`
              : `Accepts ${p.accepts.map((a) => a.label).join(", ")}`}
            {plan.crop && ` · ${Math.round(plan.retainedArea * 100)}% of image kept`}
          </p>
          <p className="plan-kind">
            {p.surface
              ? "Composed creative: the layout engine arranges your ad at this size."
              : "Platform-assembled: the network combines your image and copy. This preview is illustrative."}
          </p>
          {plan.crop && hasImage && image && (
            <div className="crop-tools">
              {plan.fit === "Needs crop" && (
                <CropPreview src={creative.image} image={image} crop={plan.crop} />
              )}
              <div className="crop-actions">
                <button
                  className="text-button"
                  aria-expanded={adjusting}
                  onClick={() => setAdjusting((v) => !v)}
                >
                  {adjusting ? "Done" : "Adjust crop"}
                </button>
                {override && <span className="plan-served">Custom focus</span>}
              </div>
              {adjusting && (
                <div className="crop-adjust">
                  {(["x", "y"] as const).map((axis) => (
                    <label key={axis}>
                      {axis === "x" ? "Horizontal" : "Vertical"}
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={focal[axis]}
                        onChange={(e) =>
                          onFocus({ ...focal, [axis]: Number(e.target.value) })
                        }
                      />
                      <span>{focal[axis]}%</span>
                    </label>
                  ))}
                  {override && (
                    <button className="text-button" onClick={() => onFocus(null)}>
                      Reset to default
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {plan.issues.length > 0 && (
            <ul className="plan-issues">
              {plan.issues.map((i, n) => (
                <li key={n} className={`issue-${i.severity}`}>
                  {i.message}
                </li>
              ))}
            </ul>
          )}
          {plan.notes.length > 0 && (
            <ul className="plan-note-list">
              {plan.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          {!plan.pngExport.available && (
            <p className="plan-size">No PNG: {plan.pngExport.reason}</p>
          )}
          {(p.source || plan.format.source) && (
            <a href={p.source || plan.format.source} target="_blank" rel="noreferrer">
              Official guidance ↗
            </a>
          )}
        </div>
      </details>
    </article>
  );
}

export function CreativePlanner({
  creative,
  projectName,
  onChange,
  onOpenStudio,
  onEditCreative,
}: {
  creative: Creative;
  projectName: string;
  onChange: (c: Creative) => void;
  onOpenStudio: (plan: PlacementPlan) => void;
  onEditCreative: () => void;
}) {
  const [asset, setAsset] = useState<AssetInfo | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>("network");
  const [network, setNetwork] = useState<NetworkId | "all">("all");
  const [status, setStatus] = useState<FitStatus | "all">("all");
  const [recommendedOnly, setRecommendedOnly] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [guides, setGuides] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const src = creative.image;
  useEffect(() => {
    let cancelled = false;
    setAsset(null);
    setError("");
    if (!src) return;
    inspectAsset(src)
      .then((info) => {
        if (!cancelled) setAsset(info);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);
  // Typing stays responsive: plans recompute from a deferred copy of the creative.
  const deferred = useDeferredValue(creative);
  // With no image, plans still generate (E1); while an image decodes, wait for its size.
  const result = useMemo(
    () =>
      src && !asset
        ? null
        : planAll({
            image: src ? asset : null,
            creative: deferred,
            goal: deferred.goal,
            measure,
          }),
    [src, asset, deferred],
  );
  const hasImage = !!src && !!asset;
  const uploadRec =
    result && hasImage ? uploadRecommendation(result.plans, asset) : null;
  const plans = result?.plans ?? [];
  // Every placement with a PNG, and (separately) the current selection.
  const allBatch = useMemo(() => batchExport(result?.plans ?? [], []), [result]);
  const selectedBatch = useMemo(
    () => batchExport(result?.plans ?? [], selected),
    [result, selected],
  );
  const visible = plans.filter(
    (p) =>
      (network === "all" || p.placement.network === network) &&
      (status === "all" || p.fit === status) &&
      (!recommendedOnly || p.recommendedForGoal) &&
      (!selectedOnly || selected.includes(p.placement.id)),
  );
  const setup =
    showSetup && status === "all" && !recommendedOnly && !selectedOnly
      ? (result?.setupOnly ?? []).filter(
          (f) => network === "all" || f.network === network,
        )
      : [];
  const sections = group(visible, setup, groupBy);
  const recommendedCount = plans.filter((p) => p.recommendedForGoal).length;
  const clearFilters = () => {
    setNetwork("all");
    setStatus("all");
    setRecommendedOnly(false);
    setSelectedOnly(false);
  };

  /** Renders and downloads files one after another (no zip dependency). */
  async function exportFiles(
    files: ExportFile[],
    skipped: BatchExport["skipped"] = [],
  ) {
    const skippedText = summarizeSkipped(skipped);
    if (!files.length) {
      setExportStatus(`Nothing to export. ${skippedText}`.trim());
      return;
    }
    setBusy(true);
    let done = 0;
    try {
      for (const f of files) {
        download(await renderExport(f, creative.image), f.name);
        done++;
        setExportStatus(`Exporting ${done} of ${files.length}…`);
        // Browsers may block rapid consecutive downloads; space them out.
        await new Promise((r) => setTimeout(r, 150));
      }
      setExportStatus(
        `Exported ${done} PNG${done === 1 ? "" : "s"}. ${skippedText}`.trim(),
      );
    } catch (e) {
      setExportStatus(
        `Export stopped after ${done} file${done === 1 ? "" : "s"}: ${e instanceof Error ? e.message : "unknown error"}.`,
      );
    } finally {
      setBusy(false);
    }
  }
  function exportPlan() {
    const report = {
      version: 2,
      kind: "placement-plan-report",
      createdAt: new Date().toISOString(),
      scope:
        "Creative planning only; not ad-network approval. The image is not included in this report.",
      goal: creative.goal,
      destination: creative.destination,
      creative: {
        brand: creative.brand,
        headline: creative.headline,
        longHeadline: creative.longHeadline,
        description: creative.description,
        body: creative.body,
        offer: creative.offer,
        cta: creative.cta,
        focal: { x: creative.focalX, y: creative.focalY },
      },
      image: asset,
      placements: plans.map((p) => ({
        id: p.placement.id,
        network: p.placement.network,
        format: p.format.name,
        name: p.placement.name,
        recommendedForGoal: p.recommendedForGoal,
        fit: p.fit,
        layoutStatus: p.layoutStatus,
        pngExport: p.pngExport,
        chosenSize: p.chosenSize?.label ?? null,
        retainedArea: p.retainedArea,
        issues: p.issues,
        notes: p.notes,
        source: p.placement.source,
        selected: selected.includes(p.placement.id),
      })),
    };
    download(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
      "placement-plan-report.json",
    );
  }

  return (
    <div className={`platforms${selected.length ? " has-selection" : ""}`}>
      <section className="platforms-head">
        <div className="platforms-title">
          <h1>Ad platforms</h1>
          <p>Choose where this ad will appear.</p>
        </div>
        <div className="platforms-context">
          <div className="context-thumb" aria-hidden="true">
            {src ? <img src={src} alt="" /> : <ImagePlus size={20} />}
          </div>
          <div className="context-name">
            <strong>{projectName}</strong>
            <button className="text-link" onClick={onEditCreative}>
              Edit creative
            </button>
          </div>
          <label className="context-goal">
            <span>Goal</span>
            <select
              value={creative.goal}
              onChange={(e) =>
                onChange({ ...creative, goal: e.target.value as Goal })
              }
            >
              {goalOrder.map((g) => (
                <option key={g} value={g}>
                  {intentCopy[g].label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <section className="platforms-filters" aria-label="Filters">
        <select
          aria-label="Network"
          value={network}
          onChange={(e) => setNetwork(e.target.value as NetworkId | "all")}
        >
          <option value="all">All networks</option>
          {networks.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as FitStatus | "all")}
        >
          <option value="all">All statuses</option>
          {fitStatuses.map((s) => (
            <option key={s} value={s}>
              {s} ({plans.filter((p) => p.fit === s).length})
            </option>
          ))}
        </select>
        <details className="plan-more">
          <summary>
            <span>More filters</span>
            <ChevronDown size={14} className="chev" />
          </summary>
          <div className="plan-more-body">
            <div className="plan-segmented" role="group" aria-label="Group by">
              {(Object.keys(groupLabels) as GroupBy[]).map((g) => (
                <button
                  key={g}
                  aria-pressed={groupBy === g}
                  className={groupBy === g ? "active" : ""}
                  onClick={() => setGroupBy(g)}
                >
                  {groupLabels[g]}
                </button>
              ))}
            </div>
            <div className="plan-toggles">
              <label>
                <input
                  type="checkbox"
                  checked={recommendedOnly}
                  onChange={(e) => setRecommendedOnly(e.target.checked)}
                />
                Recommended for {intentCopy[creative.goal].label} only (
                {recommendedCount})
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={selectedOnly}
                  onChange={(e) => setSelectedOnly(e.target.checked)}
                />
                Selected only ({selected.length})
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showSetup}
                  onChange={(e) => setShowSetup(e.target.checked)}
                />
                Show setup-only formats
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={guides}
                  onChange={(e) => setGuides(e.target.checked)}
                />
                Safe-area guides
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={creative.useGoalPriorities}
                  onChange={(e) =>
                    onChange({ ...creative, useGoalPriorities: e.target.checked })
                  }
                />
                Goal sets element priorities
              </label>
            </div>
          </div>
        </details>
        <span className="plan-summary" aria-live="polite">
          {result
            ? `${visible.length} of ${plans.length} placements`
            : error
              ? "Image unavailable"
              : "Planning placements…"}
        </span>
        <div className="platforms-actions">
          <button
            className="button small"
            disabled={!result || busy || !allBatch.files.length}
            onClick={() => void exportFiles(allBatch.files, allBatch.skipped)}
          >
            <ArrowDownToLine size={15} /> Download all PNGs ({allBatch.files.length})
          </button>
          <button
            className="button small"
            disabled={!result || busy}
            onClick={exportPlan}
          >
            <FileText size={15} /> Export report
          </button>
        </div>
      </section>
      <p className="platforms-note">
        Planning checks, not network approval.
        {result && !src &&
          ` Add an image in the Ad Designer to unlock ${plans.filter((p) => p.fit === "Needs image").length} more placements.`}
        {result && hasImage && uploadRec &&
          (uploadRec.alreadyMet
            ? " Your image meets every supported crop's minimum resolution."
            : ` Upload at least ${uploadRec.size.width} × ${uploadRec.size.height} to meet every crop's minimum resolution.`)}
      </p>
      {error && (
        <p className="planner-error" role="alert">
          {error}
        </p>
      )}
      {exportStatus && (
        <p className="planner-note plan-upload" role="status">
          {exportStatus}
        </p>
      )}
      <div className="planner-matrix">
        {sections.map((s) => (
          <section key={s.title} className="plan-group">
            <h2>
              {s.title} <span>{s.plans.length}</span>
            </h2>
            {s.note && <p className="plan-group-note">{s.note}</p>}
            <div className="plan-grid">
              {s.plans.map((p) => (
                <PlanCard
                  key={p.placement.id}
                  plan={p}
                  creative={deferred}
                  hasImage={hasImage}
                  image={hasImage ? asset : null}
                  onDownload={() =>
                    void exportFiles(batchExport([p], [p.placement.id]).files)
                  }
                  onFocus={(f) => {
                    const { [p.placement.id]: _, ...rest } =
                      creative.focalOverrides;
                    onChange({
                      ...creative,
                      focalOverrides: f ? { ...rest, [p.placement.id]: f } : rest,
                    });
                  }}
                  guides={guides}
                  selected={selected.includes(p.placement.id)}
                  onToggle={() =>
                    setSelected((v) =>
                      v.includes(p.placement.id)
                        ? v.filter((id) => id !== p.placement.id)
                        : [...v, p.placement.id],
                    )
                  }
                  onOpenStudio={() => {
                    onChange({ ...creative, cta: creative.cta || goalCta[creative.goal] });
                    onOpenStudio(p);
                  }}
                />
              ))}
              {s.setup.map((f) => (
                <article key={f.id} className="plan-card setup" data-format-id={f.id}>
                  <header className="plan-card-head">
                    <div className="plan-card-title">
                      <h3>{f.name}</h3>
                      <span>{networkName(f.network)} · Setup only</span>
                    </div>
                  </header>
                  <p className="planner-note">{f.unbuildableReason}</p>
                  <a href={f.source} target="_blank" rel="noreferrer">
                    Official guidance ↗
                  </a>
                </article>
              ))}
            </div>
          </section>
        ))}
        {result && !sections.length && (
          <p className="planner-empty">
            No placements match these filters.{" "}
            <button className="text-link" onClick={clearFilters}>
              Clear filters
            </button>
          </p>
        )}
      </div>
      {selected.length > 0 && (
        <div className="selection-bar" role="region" aria-label="Selected placements">
          <strong>{selected.length} selected</strong>
          <button className="text-link" onClick={() => setSelected([])}>
            Clear selection
          </button>
          <button
            className="button primary small"
            disabled={busy || !selectedBatch.files.length}
            onClick={() =>
              void exportFiles(selectedBatch.files, selectedBatch.skipped)
            }
          >
            <ArrowDownToLine size={15} /> Download selected (
            {selectedBatch.files.length})
          </button>
        </div>
      )}
    </div>
  );
}
