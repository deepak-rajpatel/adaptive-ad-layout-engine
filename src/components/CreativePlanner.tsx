import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ImagePlus,
  Layers,
  Star,
  Upload,
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
import { inspectAsset } from "../lib/assetInfo";
import {
  campaignCta,
  campaignTypes,
  offerLimit,
  type CampaignType,
  type Creative,
  type CreativeKey,
} from "../lib/creative";
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
const requiredLabels: Record<CreativeKey, string> = {
  headline: "Headline",
  image: "Image",
  cta: "Call to action",
  offer: "Offer",
  brand: "Brand",
};
const typeLabel = (t: CampaignType) => (t === "LeadMagnet" ? "Lead magnet" : t);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const networkName = (id: NetworkId) =>
  networks.find((n) => n.id === id)?.name ?? id;

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
          plans: plans.filter((p) => p.placement.network === n.id),
          setup: setup.filter((f) => f.network === n.id),
        }))
      : by === "goal"
        ? [
            ...goals.map((g) => ({
              title: g,
              plans: plans.filter(
                (p) =>
                  p.placement.network !== "assignment" &&
                  p.objectives.some((o) => o.goal === g),
              ),
              setup: [],
            })),
            { title: "Assignment surfaces", plans: assignment, setup: [] },
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
  return (
    <article
      className={`plan-card${plan.recommendedForGoal ? " recommended" : ""}`}
      data-placement-id={p.id}
    >
      <header>
        <span className="planner-network">
          {networkName(p.network)} · {plan.format.name}
        </span>
        <h4>{p.name}</h4>
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
          {plan.recommendedForGoal && (
            <span className="plan-recommended">
              <Star size={11} /> Recommended
            </span>
          )}
        </div>
        {!plan.recommendedForGoal && served.length > 0 && (
          <small className="plan-served">Better for {served.join(", ")}</small>
        )}
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
      <p className="plan-size">
        {size
          ? `${size.label} · ${size.recommended.width} × ${size.recommended.height}`
          : `Accepts ${p.accepts.map((a) => a.label).join(", ")}`}
        {plan.crop && ` · ${Math.round(plan.retainedArea * 100)}% of image kept`}
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
        <details className="plan-notes">
          <summary>Notes</summary>
          <ul>
            {plan.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <a href={p.source || plan.format.source} target="_blank" rel="noreferrer">
            Official guidance ↗
          </a>
        </details>
      )}
      {!plan.pngExport.available && (
        <p className="plan-size">No PNG: {plan.pngExport.reason}</p>
      )}
      <footer>
        <label>
          <input type="checkbox" checked={selected} onChange={onToggle} /> Select
        </label>
        <div className="plan-card-actions">
          {plan.pngExport.available && (
            <button className="text-button" onClick={onDownload}>
              <ArrowDownToLine size={13} />{" "}
              {plan.pngExport.kind === "image-asset" ? "Image asset" : "PNG"}
            </button>
          )}
          <button
            className="text-button"
            disabled={!size}
            onClick={onOpenStudio}
          >
            Open in studio <ArrowRight size={13} />
          </button>
        </div>
      </footer>
    </article>
  );
}

export function CreativePlanner({
  creative,
  onChange,
  onOpenStudio,
}: {
  creative: Creative;
  onChange: (c: Creative) => void;
  onOpenStudio: (plan: PlacementPlan) => void;
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
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadSequence = useRef(0);
  const lastImage = useRef<string | null>(null);
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
  // Selected cards when any are selected, otherwise every placement.
  const batch = useMemo(
    () => batchExport(result?.plans ?? [], selected),
    [result, selected],
  );
  const requiredCount = Object.values(creative.required).filter(Boolean).length;
  const plans = result?.plans ?? [];
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

  async function upload(file?: File) {
    if (!file) return;
    const sequence = ++uploadSequence.current;
    setBusy(true);
    setError("");
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
        throw new Error("Choose a PNG, JPEG or WebP image.");
      if (file.size > 10 * 1024 * 1024)
        throw new Error("Use an image under 10 MB for this local preview.");
      // Preserve original dimensions: the studio's imageData helper downsizes to
      // 1200px, which would incorrectly reject a full-resolution vertical asset.
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error("The image file could not be read."));
        reader.readAsDataURL(file);
      });
      await inspectAsset(data);
      if (sequence !== uploadSequence.current) return;
      onChange({ ...creative, image: data });
    } catch (e) {
      if (sequence === uploadSequence.current)
        setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      if (sequence === uploadSequence.current) setBusy(false);
    }
  }
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
  const field = (
    key:
      | "brand"
      | "headline"
      | "longHeadline"
      | "description"
      | "body"
      | "offer"
      | "cta",
    label: string,
    rows = 1,
    maxLength = 300,
  ) => (
    <label className="field">
      <span>
        {label} <small>{Array.from(creative[key]).length} characters</small>
      </span>
      {rows > 1 ? (
        <textarea
          rows={rows}
          maxLength={maxLength}
          value={creative[key]}
          onChange={(e) => onChange({ ...creative, [key]: e.target.value })}
        />
      ) : (
        <input
          maxLength={maxLength}
          value={creative[key]}
          onChange={(e) => onChange({ ...creative, [key]: e.target.value })}
        />
      )}
    </label>
  );
  return (
    <div className="creative-planner">
      <div className="planner-intro">
        <div>
          <span className="eyebrow">
            GOAL → OBJECTIVE → FORMAT → PLACEMENT
          </span>
          <h2>
            Start with your creative.
            <br />
            <span>See every place it can run.</span>
          </h2>
          <p>
            One creative, every verified placement across four networks and
            the four assignment surfaces. Goal and filters only change the
            view.
          </p>
        </div>
        <div className="planner-orbit" aria-hidden="true">
          <Layers size={36} />
          <span>
            One creative
            <br />
            <b>{plans.length || "every"} placements</b>
          </span>
        </div>
      </div>
      <div className="planner-layout">
        <aside className="planner-intake panel">
          <h3>
            <span className="section-number">01</span> Image & copy
          </h3>
          <button
            className="planner-drop"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!busy) void upload(e.dataTransfer.files[0]);
            }}
          >
            <Upload size={24} />
            <strong>
              {busy ? "Inspecting your image…" : "Drop an image, or browse"}
            </strong>
            <small>Optional · PNG, JPG, WebP</small>
          </button>
          <input
            ref={fileInput}
            hidden
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {src && (
            <div className="planner-source">
              <img src={src} alt="Source creative" />
            </div>
          )}
          <div className="planner-image-actions">
            {src ? (
              <button
                className="text-button"
                onClick={() => {
                  lastImage.current = src;
                  onChange({ ...creative, image: "" });
                }}
              >
                Remove image
              </button>
            ) : lastImage.current ? (
              <button
                className="text-button"
                onClick={() =>
                  onChange({ ...creative, image: lastImage.current! })
                }
              >
                Undo remove image
              </button>
            ) : null}
          </div>
          <div className="planner-metadata" aria-live="polite">
            {!src ? (
              <>
                <b>No image</b>
                <span>
                  Optional. Placements that need one are marked; the rest
                  resolve as text only.
                </span>
              </>
            ) : asset ? (
              <>
                <b>Static image</b>
                <span>
                  {asset.width} × {asset.height} ·{" "}
                  {(asset.width / asset.height).toFixed(2)}:1
                </span>
              </>
            ) : (
              <span>
                {error ? "Image unavailable" : "Reading image dimensions…"}
              </span>
            )}
          </div>
          {error && (
            <p className="planner-error" role="alert">
              {error}
            </p>
          )}
          {field("brand", "Brand / business name", 1, 60)}
          {field("headline", "Headline", 2, 160)}
          {field("longHeadline", "Long headline", 2, 160)}
          {field("description", "Description", 2, 300)}
          {field("body", "Primary text", 3, 2000)}
          {field("offer", "Offer (optional)", 1, 300)}
          {Array.from(creative.offer).length > offerLimit && (
            <p className="planner-error" role="alert">
              Shorten the offer to {offerLimit} characters or fewer.
            </p>
          )}
          {field("cta", "Call to action", 1, 60)}
          <label className="field">
            <span>Campaign type</span>
            <select
              value={creative.campaignType}
              onChange={(e) =>
                onChange({
                  ...creative,
                  campaignType: e.target.value as CampaignType,
                })
              }
            >
              {campaignTypes.map((t) => (
                <option key={t} value={t}>
                  {typeLabel(t)}
                </option>
              ))}
            </select>
          </label>
          {creative.cta !== campaignCta[creative.campaignType] && (
            <p className="planner-note">
              Suggested CTA for {typeLabel(creative.campaignType).toLowerCase()}:{" "}
              <b>{campaignCta[creative.campaignType]}</b>{" "}
              <button
                className="text-button"
                onClick={() =>
                  onChange({
                    ...creative,
                    cta: campaignCta[creative.campaignType],
                  })
                }
              >
                Use it
              </button>
            </p>
          )}
          <fieldset className="planner-required">
            <legend>Required elements</legend>
            {(Object.keys(requiredLabels) as CreativeKey[]).map((k) => (
              <label key={k}>
                <input
                  type="checkbox"
                  checked={creative.required[k]}
                  disabled={creative.required[k] && requiredCount === 1}
                  onChange={(e) =>
                    onChange({
                      ...creative,
                      required: { ...creative.required, [k]: e.target.checked },
                    })
                  }
                />{" "}
                {requiredLabels[k]}
              </label>
            ))}
            <small>
              Required elements are never dropped. A blank required element
              makes composed layouts invalid; at least one must stay required.
            </small>
          </fieldset>
          <h3>
            <span className="section-number">02</span> Destination
          </h3>
          <label className="field">
            <span>Destination URL</span>
            <input
              type="url"
              placeholder="https://yourbrand.com/product"
              value={creative.destination}
              onChange={(e) =>
                onChange({ ...creative, destination: e.target.value })
              }
            />
          </label>
          <p className="planner-note">
            Bidding, objectives and account eligibility are configured in each
            network.
          </p>
        </aside>
        <div className="planner-content">
          <section className="panel planner-matrix">
            <div className="planner-section-heading">
              <div>
                <h3>
                  <span className="section-number">03</span> Every placement
                </h3>
                <p>
                  Planning checks from verified specs, not network approval.
                </p>
              </div>
              <div className="planner-export-buttons">
                <button
                  className="button small"
                  disabled={!result || busy || !batch.files.length}
                  title={
                    selected.length
                      ? "Exports the selected placements"
                      : "Exports every placement with a PNG"
                  }
                  onClick={() => void exportFiles(batch.files, batch.skipped)}
                >
                  <ArrowDownToLine size={15} /> Export PNGs (
                  {batch.files.length})
                </button>
                <button
                  className="button small"
                  disabled={!result || busy}
                  onClick={exportPlan}
                >
                  <ArrowDownToLine size={15} /> Export report
                </button>
              </div>
            </div>
            <div className="plan-toolbar">
              <label>
                Goal
                <select
                  value={creative.goal}
                  onChange={(e) =>
                    onChange({ ...creative, goal: e.target.value as Goal })
                  }
                >
                  {goals.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </label>
            </div>
            <details className="plan-more">
              <summary>View options</summary>
            <div className="plan-toolbar">
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
            </div>
            <div className="plan-chips" role="group" aria-label="Network">
              {(["all", ...networks.map((n) => n.id)] as const).map((id) => (
                <button
                  key={id}
                  aria-pressed={network === id}
                  className={`chip${network === id ? " active" : ""}`}
                  onClick={() => setNetwork(id)}
                >
                  {id === "all" ? "All networks" : networkName(id)}
                </button>
              ))}
            </div>
            <div className="plan-chips" role="group" aria-label="Status">
              {(["all", ...fitStatuses] as const).map((s) => (
                <button
                  key={s}
                  aria-pressed={status === s}
                  className={`chip${status === s ? " active" : ""}`}
                  onClick={() => setStatus(s)}
                >
                  {s === "all" ? "All statuses" : s}{" "}
                  {s !== "all" && (
                    <b>{plans.filter((p) => p.fit === s).length}</b>
                  )}
                </button>
              ))}
            </div>
            <div className="plan-toggles">
              <label>
                <input
                  type="checkbox"
                  checked={creative.useGoalPriorities}
                  onChange={(e) =>
                    onChange({ ...creative, useGoalPriorities: e.target.checked })
                  }
                />{" "}
                Goal sets element priorities
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={recommendedOnly}
                  onChange={(e) => setRecommendedOnly(e.target.checked)}
                />{" "}
                Recommended for {creative.goal} only
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={selectedOnly}
                  onChange={(e) => setSelectedOnly(e.target.checked)}
                />{" "}
                Selected only ({selected.length})
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showSetup}
                  onChange={(e) => setShowSetup(e.target.checked)}
                />{" "}
                Show setup-only formats
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={guides}
                  onChange={(e) => setGuides(e.target.checked)}
                />{" "}
                Safe-area guides
              </label>
            </div>
            </details>
            <p className="plan-summary" aria-live="polite">
              {result ? (
                <>
                  <b>{plans.length} placements</b> ·{" "}
                  {fitStatuses
                    .map((s) => [s, plans.filter((p) => p.fit === s).length] as const)
                    .filter(([, n]) => n)
                    .map(([s, n]) => `${n} ${s}`)
                    .join(" · ")}{" "}
                  · {recommendedCount} recommended for {creative.goal}
                </>
              ) : error ? (
                "Upload an image to plan placements."
              ) : (
                "Planning placements…"
              )}
            </p>
            {exportStatus && (
              <p className="planner-note plan-upload" role="status">
                {exportStatus}
              </p>
            )}
            {result && !src && (
              <p className="planner-note">
                Add an image to unlock{" "}
                {plans.filter((p) => p.fit === "Needs image").length}{" "}
                placements.
              </p>
            )}
            {result && hasImage && uploadRec && (
              <p className="planner-note plan-upload">
                {uploadRec.alreadyMet
                  ? "Your image meets every supported crop's minimum resolution."
                  : `Upload at least ${uploadRec.size.width} × ${uploadRec.size.height} to meet every supported crop's minimum resolution.`}{" "}
                Some placements will still need cropping.
                {uploadRec.excluded.length > 0 &&
                  ` Resolution can't fix: ${uploadRec.excluded.map((p) => p.placement.name).join(", ")}.`}
              </p>
            )}
            {sections.map((s) => (
              <section key={s.title} className="plan-group">
                <h4>
                  {s.title} <span>{s.plans.length}</span>
                </h4>
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
                          focalOverrides: f
                            ? { ...rest, [p.placement.id]: f }
                            : rest,
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
                      <header>
                        <span className="planner-network">
                          {networkName(f.network)} · Setup only
                        </span>
                        <h4>{f.name}</h4>
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
              <p className="planner-empty">No placements match these filters.</p>
            )}
          </section>
          <section className="panel planner-previews">
            <div className="planner-focal">
              {(["focalX", "focalY"] as const).map((key) => (
                <label key={key}>
                  {key === "focalX"
                    ? "Horizontal crop focus"
                    : "Vertical crop focus"}
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={creative[key]}
                    onChange={(e) =>
                      onChange({ ...creative, [key]: Number(e.target.value) })
                    }
                  />
                  <span>{creative[key]}%</span>
                </label>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
