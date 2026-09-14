// Generates a plan for every catalog placement from one creative. Pure: no DOM, no React.
import { coverCrop, type CropRect } from "../crop";
import { effectivePriorities, hasContent, toSpec, type CreativeData } from "../creativeModel";
import type { ResolvedImage, ResolvedLayout } from "../layout";
import { validDestination } from "../placements";
import { resolve } from "../resolver";
import type { Surface } from "../surfaces";
import type { Measure } from "../text";
import { formatById, formats, objectiveById, placements as catalog } from "./data";
import type {
  AcceptedSize,
  CopyField,
  Format,
  Goal,
  Issue,
  Placement,
  PlacementPlan,
  PngExport,
  Size,
} from "./types";

/** Enforced limits count Unicode code points: identical in every browser and in Node. */
export const countChars = (text: string) => Array.from(text).length;

export interface PlanInput {
  /** Decoded source image size, or null when the creative has no image. */
  image: Size | null;
  creative: CreativeData;
  goal: Goal;
  measure: Measure;
}
export interface PlanResult {
  plans: PlacementPlan[];
  /** Formats listed for completeness; nothing is generated for them. */
  setupOnly: Format[];
}

interface Candidate {
  size: AcceptedSize;
  index: number;
  feasible: boolean;
  retained: number;
  crop: CropRect | null;
  layout: ResolvedLayout | null;
  heroPresent: boolean;
  /** Below 1 when the crop is smaller than the minimum; used to report the closest size. */
  closeness: number;
  /** Frame (platform) or image box (composed) the crop must fill at the minimum. */
  target: Size;
  reasons: string[];
}

const focalFor = (c: CreativeData, id: string) => c.focalOverrides[id] ?? { x: c.focalX, y: c.focalY };
const round = (n: number) => Math.round(n);
const dims = (s: Size) => `${round(s.width)} × ${round(s.height)}`;

function withoutHero(spec: ReturnType<typeof toSpec>) {
  return { ...spec, elements: spec.elements.filter((e) => e.role !== "hero") };
}

function composedLayout(p: Placement, size: Size, creative: CreativeData, focal: { x: number; y: number }, hero: boolean, measure: Measure) {
  const surface = { ...p.surface!, id: p.id, name: p.name, width: size.width, height: size.height } as Surface;
  const spec = toSpec({ ...creative, focalX: focal.x, focalY: focal.y });
  return resolve(hero ? spec : withoutHero(spec), surface, measure);
}

function candidate(p: Placement, size: AcceptedSize, index: number, image: Size, input: PlanInput): Candidate {
  const focal = focalFor(input.creative, p.id);
  const area = image.width * image.height;
  const base = { size, index, reasons: [] as string[] };
  if (!p.surface) {
    const crop = coverCrop(image.width, image.height, size.recommended.width, size.recommended.height, focal.x, focal.y);
    const target = size.minimum;
    return {
      ...base,
      crop,
      layout: null,
      heroPresent: true,
      retained: (crop.width * crop.height) / area,
      feasible: crop.width >= target.width - 0.5 && crop.height >= target.height - 0.5,
      closeness: Math.min(crop.width / target.width, crop.height / target.height),
      target,
    };
  }
  const layout = composedLayout(p, size.recommended, input.creative, focal, true, input.measure);
  if (layout.status === "invalid" || layout.status === "impossible")
    return { ...base, crop: null, layout, heroPresent: false, retained: 0, feasible: false, closeness: 0, target: size.minimum, reasons: layout.errors };
  const hero = layout.elements.find((e): e is ResolvedImage => e.kind === "image");
  if (!hero)
    return { ...base, crop: null, layout, heroPresent: false, retained: 0, feasible: true, closeness: 1, target: size.minimum };
  const crop = coverCrop(image.width, image.height, hero.width, hero.height, focal.x, focal.y);
  // The minimum is scaled to the image box on both dimensions (D1).
  const scale = Math.max(size.minimum.width / size.recommended.width, size.minimum.height / size.recommended.height);
  const target = { width: hero.width * scale, height: hero.height * scale };
  return {
    ...base,
    crop,
    layout,
    heroPresent: true,
    retained: (crop.width * crop.height) / area,
    feasible: crop.width >= target.width - 0.5 && crop.height >= target.height - 0.5,
    closeness: Math.min(crop.width / target.width, crop.height / target.height),
    target,
  };
}

const better = (a: Candidate, b: Candidate) =>
  Number(b.heroPresent) - Number(a.heroPresent) ||
  Number(b.layout?.status === "ready") - Number(a.layout?.status === "ready") ||
  b.retained - a.retained ||
  b.size.recommended.width * b.size.recommended.height - a.size.recommended.width * a.size.recommended.height ||
  a.index - b.index;

function copyIssues(fields: readonly CopyField[], creative: CreativeData): Issue[] {
  const issues: Issue[] = [];
  const value = (f: CopyField) => creative[f.key];
  for (const f of fields) {
    const text = value(f).trim();
    const n = countChars(text);
    if (!n) {
      if (f.required) issues.push({ severity: "error", field: f.key, message: `Add ${f.label.toLowerCase()}.` });
      continue;
    }
    // No network publishes its counting method, so length checks are advisory (D3).
    if (f.limit !== undefined && n > f.limit)
      issues.push({ severity: "warning", field: f.key, message: `${f.label} is ${n} characters; the limit is ${f.limit}. Counted by the planner; counting method unverified.` });
    else if (f.truncatesAt !== undefined && n > f.truncatesAt)
      issues.push({ severity: "warning", field: f.key, message: `${f.label} may be truncated after ${f.truncatesAt} characters (currently ${n}).` });
  }
  return issues;
}

/** Plans one placement. Exported for tests and single-card updates. */
export function planPlacement(p: Placement, planInput: PlanInput): PlacementPlan {
  // Layouts follow the goal being planned for.
  const input = { ...planInput, creative: { ...planInput.creative, goal: planInput.goal } };
  const format = formatById.get(p.formatId)!;
  const objectives = format.objectives.map((id) => objectiveById.get(id)!);
  const issues: Issue[] = [];
  const notes = p.note ? [p.note] : [];
  const plan: PlacementPlan = {
    placement: p,
    format,
    objectives,
    recommendedForGoal: objectives.some((o) => o.goal === input.goal),
    chosenSize: null,
    fit: "Unsupported",
    layoutStatus: p.surface ? "invalid" : "n/a",
    layout: null,
    retainedArea: 0,
    crop: null,
    minimumScale: null,
    pngExport: { available: false, reason: "" },
    issues,
    notes,
  };
  const textOnly = () => {
    plan.fit = "Text only";
    plan.chosenSize = p.accepts[0];
    if (p.surface) {
      plan.layout = composedLayout(p, p.accepts[0].recommended, input.creative, focalFor(input.creative, p.id), false, input.measure);
      plan.layoutStatus = plan.layout.status;
      if (plan.layout.status === "invalid" || plan.layout.status === "impossible")
        issues.push(...plan.layout.errors.map((message): Issue => ({ severity: "error", message })));
    }
  };

  // Status precedence (E4): media "none", then a missing image, then the image algorithm.
  if (p.media === "none") {
    textOnly();
    notes.push("This format doesn't use a source image.");
  } else if (!input.image) {
    if (p.media === "required") {
      plan.fit = "Needs image";
      issues.push({ severity: "error", field: "image", message: "Add an image to use this placement." });
    } else textOnly();
  } else {
    const image = input.image;
    const candidates = p.accepts.map((s, i) => candidate(p, s, i, image, input));
    // Crops scale linearly with the source, so each candidate needs a fixed growth factor.
    const scales = candidates.flatMap((c) =>
      c.crop ? [Math.max(c.target.width / c.crop.width, c.target.height / c.crop.height)] : [],
    );
    plan.minimumScale = scales.length ? Math.min(...scales) : null;
    const chosen = candidates.filter((c) => c.feasible).sort(better)[0];
    if (chosen) {
      plan.chosenSize = chosen.size;
      plan.crop = chosen.crop;
      plan.layout = chosen.layout;
      plan.retainedArea = chosen.retained;
      if (chosen.layout) plan.layoutStatus = chosen.layout.status;
      const ratioMatches = Math.abs(image.width / image.height / chosen.size.ratio - 1) <= chosen.size.tolerance;
      plan.fit = p.surface
        ? chosen.heroPresent && chosen.retained >= 0.98 ? "Ready" : "Needs crop"
        : ratioMatches ? "Ready" : "Needs crop";
      if (p.surface && !chosen.heroPresent)
        notes.push("Image omitted by the layout: it did not fit beside the required text at this size.");
    } else {
      const closest = [...candidates].sort((a, b) => b.closeness - a.closeness || a.index - b.index)[0];
      if (closest.layout && !closest.crop) {
        plan.layout = closest.layout;
        plan.layoutStatus = closest.layout.status;
        issues.push(...closest.reasons.map((message): Issue => ({ severity: "error", message })));
      } else if (closest.crop) {
        const s = Math.max(closest.target.width / closest.crop.width, closest.target.height / closest.crop.height);
        const need = { width: Math.ceil(image.width * s), height: Math.ceil(image.height * s) };
        issues.push({
          severity: "error",
          field: "image",
          message: `Source crop is ${dims(closest.crop)}; this placement needs at least ${dims(closest.target)}${p.surface ? " for its image area" : ""} at ${closest.size.label}. Upload an image of at least ${dims(need)}.`,
        });
      }
    }
  }
  issues.push(...copyIssues(p.copyFields, input.creative));
  const noOffer = !hasContent(input.creative.offer);
  if (input.goal === "Sales" && noOffer && objectives.some((o) => o.goal === "Sales"))
    issues.push({ severity: "warning", field: "offer", message: "Sales formats usually include an offer (price, discount or incentive)." });
  if (p.surface && effectivePriorities(input.creative).fallback)
    notes.push("No offer provided; using Consideration priorities.");
  if (p.destination && !validDestination(input.creative.destination))
    issues.push({ severity: "error", field: "destination", message: "Add a valid HTTP or HTTPS destination URL." });
  const order = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  plan.pngExport = pngExportFor(plan);
  return plan;
}

/** E3: copy problems never block a PNG; geometry and missing inputs do. */
function pngExportFor(plan: PlacementPlan): PngExport {
  const tooSmall = "The image is below this placement's minimum resolution.";
  if (plan.fit === "Needs image") return { available: false, reason: "Needs an image." };
  if (plan.placement.surface) {
    if (plan.fit === "Unsupported") return { available: false, reason: tooSmall };
    return plan.layoutStatus === "ready" || plan.layoutStatus === "adapted"
      ? { available: true, kind: "composed-creative" }
      : { available: false, reason: "No valid layout at this size." };
  }
  if (plan.fit === "Text only")
    return { available: false, reason: "Copy-only placement: included in the plan report." };
  if (plan.fit === "Unsupported") return { available: false, reason: tooSmall };
  return { available: true, kind: "image-asset" };
}

export interface ExportFile {
  plan: PlacementPlan;
  name: string;
  kind: "composed-creative" | "image-asset";
  width: number;
  height: number;
}
export interface BatchExport {
  files: ExportFile[];
  skipped: { plan: PlacementPlan; reason: string }[];
}
/**
 * Files for the selected placements (all when none are selected). Composed creatives export at
 * surface size; image assets at the recommended size, never enlarged beyond the source crop.
 */
export function batchExport(plans: readonly PlacementPlan[], selected: readonly string[] = []): BatchExport {
  const chosen = selected.length ? plans.filter((p) => selected.includes(p.placement.id)) : plans;
  const files: ExportFile[] = [];
  const skipped: BatchExport["skipped"] = [];
  for (const plan of chosen) {
    const e = plan.pngExport;
    if (!e.available) {
      skipped.push({ plan, reason: e.reason });
      continue;
    }
    let width: number;
    let height: number;
    if (e.kind === "composed-creative") {
      ({ width, height } = plan.layout!);
    } else {
      const rec = plan.chosenSize!.recommended;
      const s = Math.min(1, plan.crop!.width / rec.width);
      width = Math.round(rec.width * s);
      height = Math.round(rec.height * s);
    }
    const suffix = e.kind === "image-asset" ? "-image-asset" : "";
    files.push({ plan, kind: e.kind, width, height, name: `${plan.placement.id}-${width}x${height}${suffix}.png` });
  }
  return { files, skipped };
}
/** "Skipped 5: 3 × Copy-only placement…; 2 × Needs an image." */
export function summarizeSkipped(skipped: BatchExport["skipped"]): string {
  if (!skipped.length) return "";
  const counts = new Map<string, number>();
  for (const s of skipped) counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
  return `Skipped ${skipped.length}: ${[...counts].map(([reason, n]) => `${n} × ${reason.replace(/\.$/, "")}`).join("; ")}.`;
}

export interface UploadRecommendation {
  /** Smallest source size, at the current aspect ratio, meeting every crop minimum. */
  size: Size;
  alreadyMet: boolean;
  /** Placements that no source resolution can fix (for example, impossible layouts). */
  excluded: PlacementPlan[];
}
/** "Upload at least W×H" (B2). Returns null when there is no image. */
export function uploadRecommendation(plans: readonly PlacementPlan[], image: Size | null): UploadRecommendation | null {
  if (!image) return null;
  const scale = Math.max(1, ...plans.flatMap((p) => (p.minimumScale === null ? [] : [p.minimumScale])));
  return {
    size: { width: Math.ceil(image.width * scale), height: Math.ceil(image.height * scale) },
    alreadyMet: scale <= 1,
    excluded: plans.filter((p) => p.minimumScale === null && p.fit === "Unsupported"),
  };
}

export function planAll(input: PlanInput, placements: readonly Placement[] = catalog): PlanResult {
  return {
    plans: placements.map((p) => planPlacement(p, input)),
    setupOnly: formats.filter((f) => !f.buildable),
  };
}
