import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ImagePlus,
  Layers,
  Upload,
} from "lucide-react";
import {
  assessPlacement,
  goalCta,
  placements,
  type AssetInfo,
  type FitStatus,
  type Goal,
  type Placement,
} from "../engine/placements";
import { inspectAsset } from "../lib/assetInfo";
import type { Creative } from "../lib/creative";
import { download, readLocal, writeLocal } from "../lib/persistence";

const settingsKey = "omniframe:planner:v1";
function initialSettings() {
  const v = readLocal<unknown>(settingsKey, null);
  const value =
    v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  return {
    goal:
      typeof value.goal === "string" && Object.hasOwn(goalCta, value.goal)
        ? (value.goal as Goal)
        : ("Awareness" as Goal),
    destination: typeof value.destination === "string" ? value.destination : "",
    body: typeof value.body === "string" ? value.body : "",
  };
}
export function CreativePlanner({
  creative,
  onChange,
  onOpenStudio,
}: {
  creative: Creative;
  onChange: (c: Creative) => void;
  onOpenStudio: (p: Placement) => void;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [asset, setAsset] = useState<AssetInfo | null>(null);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);
  const [network, setNetwork] = useState("All networks");
  const [status, setStatus] = useState("All statuses");
  const [selected, setSelected] = useState<string[]>([
    "meta-feed",
    "meta-story",
    "taboola-native",
  ]);
  const [guides, setGuides] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadSequence = useRef(0);
  const src = creative.image;
  useEffect(() => {
    let cancelled = false;
    setAsset(null);
    setError("");
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
  useEffect(() => {
    try {
      writeLocal(settingsKey, settings);
      setSaveError("");
    } catch {
      setSaveError(
        "Planner fields could not be saved locally. Export the plan to keep them.",
      );
    }
  }, [settings]);
  const results = useMemo(
    () =>
      asset
        ? placements.map((p) =>
            assessPlacement(asset, p, creative.headline, settings.destination),
          )
        : [],
    [asset, creative.headline, settings.destination],
  );
  const filtered = results.filter(
    (r) =>
      (network === "All networks" || r.placement.network === network) &&
      (status === "All statuses" || r.status === status),
  );
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
  function exportPlan() {
    const plan = {
      version: 1,
      createdAt: new Date().toISOString(),
      scope:
        "Creative planning only; not ad-network approval. Media files are not included.",
      creative: {
        brand: creative.brand,
        headline: creative.headline,
        cta: goalCta[settings.goal],
      },
      strategy: settings,
      asset,
      focal: { x: creative.focalX, y: creative.focalY },
      placements: results.map((r) => ({
        ...r,
        selected: selected.includes(r.placement.id),
      })),
    };
    download(
      new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" }),
      "omniframe-placement-plan.json",
    );
  }
  return (
    <div className="creative-planner">
      <div className="planner-intro">
        <div>
          <span className="eyebrow">
            CREATIVE → CONTAINER → PLACEMENT → STRATEGY
          </span>
          <h2>
            Start with your creative.
            <br />
            <span>Discover where it belongs.</span>
          </h2>
          <p>
            One source asset. Five networks. A clear path from idea to
            adaptation.
          </p>
        </div>
        <div className="planner-orbit" aria-hidden="true">
          <Layers size={36} />
          <span>
            One creative
            <br />
            <b>many possibilities</b>
          </span>
        </div>
      </div>
      <div className="planner-layout">
        <aside className="planner-intake panel">
          <h3>
            <span className="section-number">01</span> Asset & message
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
              {busy ? "Inspecting your asset…" : "Drop a creative, or browse"}
            </strong>
            <small>PNG, JPG, WebP</small>
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
          <div className="planner-source">
            <img src={src} alt="Source creative" />
          </div>
          <div className="planner-metadata" aria-live="polite">
            {asset ? (
              <>
                <b>Static image</b>
                <span>
                  {asset.width} × {asset.height} ·{" "}
                  {(asset.width / asset.height).toFixed(2)}:1
                </span>
              </>
            ) : (
              <span>
                {error ? "Asset unavailable" : "Reading asset dimensions…"}
              </span>
            )}
          </div>
          {error && (
            <p className="planner-error" role="alert">
              {error}
            </p>
          )}
          {saveError && (
            <p className="planner-error" role="alert">
              {saveError}
            </p>
          )}
          <label className="field">
            <span>Brand</span>
            <input
              maxLength={60}
              value={creative.brand}
              onChange={(e) => onChange({ ...creative, brand: e.target.value })}
            />
          </label>
          <label className="field">
            <span>
              Headline{" "}
              <small>{Array.from(creative.headline).length} characters</small>
            </span>
            <textarea
              rows={2}
              maxLength={160}
              value={creative.headline}
              onChange={(e) =>
                onChange({ ...creative, headline: e.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Primary text</span>
            <textarea
              rows={3}
              maxLength={2000}
              placeholder="Tell the story around your image…"
              value={settings.body}
              onChange={(e) =>
                setSettings({ ...settings, body: e.target.value })
              }
            />
          </label>
          {Array.from(settings.body).length > 125 && (
            <p className="planner-note">
              Text beyond 125 characters may be collapsed in some feed previews.
              This is a preview guideline.
            </p>
          )}
          <h3>
            <span className="section-number">02</span> Campaign intent
          </h3>
          <label className="field">
            <span>Goal</span>
            <select
              value={settings.goal}
              onChange={(e) =>
                setSettings({ ...settings, goal: e.target.value as Goal })
              }
            >
              {Object.keys(goalCta).map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Destination URL</span>
            <input
              type="url"
              placeholder="https://yourbrand.com/product"
              value={settings.destination}
              onChange={(e) =>
                setSettings({ ...settings, destination: e.target.value })
              }
            />
          </label>
          <p className="planner-note">
            Suggested CTA: <b>{goalCta[settings.goal]}</b>. Goal guides the
            creative brief; network objectives, bidding and account eligibility
            are configured separately.
          </p>
        </aside>
        <div className="planner-content">
          <section className="panel planner-matrix">
            <div className="planner-section-heading">
              <div>
                <h3>
                  <span className="section-number">03</span> Placement
                  opportunities
                </h3>
                <p>
                  Geometry fit is a starting point. Each profile explains what
                  remains.
                </p>
              </div>
              <button
                className="button small"
                disabled={!asset || busy}
                onClick={exportPlan}
              >
                <ArrowDownToLine size={15} /> Export plan
              </button>
            </div>
            <div className="planner-stats">
              {(["Fits", "Needs work", "Unsupported"] as FitStatus[]).map(
                (s) => (
                  <button
                    key={s}
                    className={status === s ? "active" : ""}
                    aria-pressed={status === s}
                    onClick={() => setStatus(status === s ? "All statuses" : s)}
                  >
                    <b>{results.filter((r) => r.status === s).length}</b>
                    <span>{s}</span>
                  </button>
                ),
              )}
            </div>
            <div className="planner-filters">
              <label>
                Network{" "}
                <select
                  value={network}
                  onChange={(e) => setNetwork(e.target.value)}
                >
                  {[
                    "All networks",
                    "Meta",
                    "Google",
                    "Taboola",
                    "LinkedIn",
                    "TikTok",
                  ].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label>
                Status{" "}
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {["All statuses", "Fits", "Needs work", "Unsupported"].map(
                    (s) => (
                      <option key={s}>{s}</option>
                    ),
                  )}
                </select>
              </label>
              <span>Select up to 3 to compare</span>
            </div>
            <div className="planner-rows">
              {filtered.map(({ placement: p, status: fit, reasons }) => (
                <div className="planner-row" key={p.id}>
                  <input
                    type="checkbox"
                    aria-label={`Compare ${p.name}`}
                    checked={selected.includes(p.id)}
                    disabled={!selected.includes(p.id) && selected.length >= 3}
                    onChange={() =>
                      setSelected((v) =>
                        v.includes(p.id)
                          ? v.filter((id) => id !== p.id)
                          : [...v, p.id],
                      )
                    }
                  />
                  <div>
                    <span className="planner-network">
                      {p.network} · {p.container}
                    </span>
                    <strong>{p.name}</strong>
                    <small>
                      {p.width} × {p.height}
                    </small>
                    <details>
                      <summary>
                        {fit === "Fits"
                          ? "What was checked"
                          : `${reasons.length} item${reasons.length > 1 ? "s" : ""} to review`}
                      </summary>
                      <ul>
                        {reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                      <a href={p.source} target="_blank" rel="noreferrer">
                        Official guidance ↗
                      </a>
                    </details>
                  </div>
                  <span
                    className={`planner-fit fit-${fit.toLowerCase().replace(" ", "-")}`}
                  >
                    {fit === "Fits" && <Check size={12} />}
                    {fit}
                  </span>
                </div>
              ))}
              {!filtered.length && (
                <p className="planner-empty">
                  {asset
                    ? "No placements match these filters."
                    : "Upload or load an asset to see placement opportunities."}
                </p>
              )}
            </div>
            <p className="planner-note">
              Planning profiles, not launch approval. File weight, codecs,
              content policy and account eligibility require network review.
              “Unsupported” applies to the selected profile, not every format on
              that network.
            </p>
          </section>
          <section className="panel planner-previews">
            <div className="planner-section-heading">
              <div>
                <h3>
                  <span className="section-number">04</span> In context
                </h3>
                <p>
                  Illustrative native previews. The platform supplies its own
                  interface.
                </p>
              </div>
              <label className="planner-guide-toggle">
                <input
                  type="checkbox"
                  checked={guides}
                  onChange={(e) => setGuides(e.target.checked)}
                />{" "}
                Safe-zone guides
              </label>
            </div>
            <div className="planner-preview-grid">
              {selected
                .map((id) => placements.find((p) => p.id === id)!)
                .map((p) => (
                  <article key={p.id} className="planner-preview-card">
                    <span className="planner-network">{p.network}</span>
                    <h4>{p.name}</h4>
                    <div
                      className={`native-mockup native-${p.container.toLowerCase()}`}
                    >
                      <div className="native-brand">
                        <span>{creative.brand.slice(0, 1) || "B"}</span>
                        <div>
                          <b>{creative.brand || "Your brand"}</b>
                          <small>Sponsored</small>
                        </div>
                        <span>···</span>
                      </div>
                      {settings.body && p.container === "In-feed" && (
                        <p className="native-body">
                          {Array.from(settings.body).slice(0, 125).join("")}
                          {Array.from(settings.body).length > 125
                            ? "… more"
                            : ""}
                        </p>
                      )}
                      <div
                        className="native-media"
                        style={{ aspectRatio: `${p.width} / ${p.height}` }}
                      >
                        {!asset ? (
                          <div className="native-placeholder">
                            <ImagePlus size={28} />
                            <span>Image asset required</span>
                          </div>
                        ) : (
                          <img
                            src={src}
                            alt={`${p.name} crop preview`}
                            style={{
                              objectPosition: `${creative.focalX}% ${creative.focalY}%`,
                            }}
                          />
                        )}
                        {guides && p.container === "Vertical" && (
                          <div className="native-safe">
                            <span>Keep key content inside</span>
                          </div>
                        )}
                      </div>
                      <div className="native-copy">
                        <small>
                          {settings.destination || "Destination URL"}
                        </small>
                        <strong>{creative.headline || "Your headline"}</strong>
                        <span className="native-cta">
                          {goalCta[settings.goal]} <ArrowRight size={13} />
                        </span>
                      </div>
                    </div>
                    <p className="planner-note">
                      {p.container === "Vertical"
                        ? "Safe-zone overlay is approximate; inspect embedded text and focal content manually."
                        : p.container === "Multi-asset" ||
                            p.container === "Carousel"
                          ? "One asset preview; the complete format needs additional assets."
                          : "Copy and media are separate native components."}
                    </p>
                    <button
                      className="text-button"
                      disabled={!asset}
                      onClick={() => {
                        onChange({ ...creative, cta: goalCta[settings.goal] });
                        onOpenStudio(p);
                      }}
                    >
                      Compose in layout studio <ArrowRight size={14} />
                    </button>
                  </article>
                ))}
            </div>
            {!selected.length && (
              <p className="planner-empty">
                Select a placement above to preview your creative in context.
              </p>
            )}
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
