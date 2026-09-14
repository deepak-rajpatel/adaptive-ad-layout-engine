// Placement catalog types: Goal → network objective → format → placement.
import type { CropRect } from "../crop";
import type { ResolvedLayout } from "../layout";
import type { SurfaceBase } from "../surfaces";

export type Goal = "Awareness" | "Consideration" | "Leads" | "Sales";
export const goals: readonly Goal[] = ["Awareness", "Consideration", "Leads", "Sales"];

export type NetworkId = "meta" | "google" | "taboola" | "linkedin" | "tiktok" | "assignment";
export interface Network {
  id: NetworkId;
  name: string;
}

export interface NetworkObjective {
  id: string;
  network: NetworkId;
  /** The network's own term. */
  name: string;
  goal: Goal;
  source: string;
  verifiedAt: string;
}

export type Container =
  | "In-feed"
  | "Vertical"
  | "Recommendation"
  | "Multi-asset"
  | "Display"
  | "Carousel"
  | "Assignment";
/** Composed: the resolver lays out text and image. Platform: the network assembles the ad. */
export type Assembly = "composed" | "platform";

export interface Format {
  id: string;
  network: NetworkId;
  name: string;
  container: Container;
  assembly: Assembly;
  /** NetworkObjective ids this format serves. */
  objectives: readonly string[];
  /** False: listed as setup-only with a reason; no placements are generated. */
  buildable: boolean;
  unbuildableReason?: string;
  source: string;
  verifiedAt: string;
}

export interface Size {
  width: number;
  height: number;
}
export interface AcceptedSize {
  label: string;
  /** width / height */
  ratio: number;
  recommended: Size;
  minimum: Size;
  /** Relative ratio tolerance for "Ready" on platform-assembled placements. */
  tolerance: number;
}

export type CopyKey = "headline" | "longHeadline" | "description" | "body" | "brand" | "cta";
export interface CopyField {
  key: CopyKey;
  /** The platform's own name for the field. */
  label: string;
  /** Maximum length (error-level, capped at warning while the counting rule is unverified). */
  limit?: number;
  /** Visible length before truncation (warning). */
  truncatesAt?: number;
  required: boolean;
}

/** Requirement for a user-supplied source image (not the network's upload format). */
export type MediaNeed = "required" | "optional" | "none";

type TemplateFields = Omit<SurfaceBase, "id" | "name" | "width" | "height">;
/** A Surface without identity or size; keeps the input/tap-target union. */
export type SurfaceTemplate =
  | (TemplateFields & { input: "touch" | "pointer"; minTapTarget: number })
  | (TemplateFields & { input: "none"; minTapTarget?: never });

export interface Placement {
  id: string;
  formatId: string;
  network: NetworkId;
  name: string;
  /** At least one; candidates for size selection, in catalog order. */
  accepts: readonly AcceptedSize[];
  copyFields: readonly CopyField[];
  media: MediaNeed;
  /** Composed placements: resolver constraints. */
  surface?: SurfaceTemplate;
  /** Platform placements: share of the frame covered by platform UI, for the overlay. */
  uiOverlay?: { top: number; right: number; bottom: number; left: number };
  /** Needs a valid destination URL. */
  destination: boolean;
  /** Information only; never counted as an issue. */
  note?: string;
  source: string;
  verifiedAt: string;
}

export type FitStatus = "Ready" | "Needs crop" | "Needs image" | "Text only" | "Unsupported";
export const fitStatuses: readonly FitStatus[] = [
  "Ready",
  "Needs crop",
  "Needs image",
  "Text only",
  "Unsupported",
];
export type LayoutStatus = ResolvedLayout["status"] | "n/a";

export interface Issue {
  severity: "error" | "warning" | "info";
  field?: CopyKey | "image" | "destination" | "offer";
  message: string;
}

export interface PlacementPlan {
  placement: Placement;
  format: Format;
  objectives: NetworkObjective[];
  recommendedForGoal: boolean;
  chosenSize: AcceptedSize | null;
  fit: FitStatus;
  /** Composed only; "n/a" for platform-assembled placements. */
  layoutStatus: LayoutStatus;
  layout: ResolvedLayout | null;
  /** Share of the source image kept (0–1). */
  retainedArea: number;
  /** Source-pixel crop: the frame (platform) or the resolved image box (composed). */
  crop: CropRect | null;
  /**
   * Factor the source image must grow by (same aspect ratio) for at least one accepted size
   * to meet its minimum; at most 1 when already met. Null when no crop applies.
   */
  minimumScale: number | null;
  issues: Issue[];
  notes: string[];
}
