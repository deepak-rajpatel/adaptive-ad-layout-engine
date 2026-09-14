// Surface profiles: physical constraints of where an ad is shown. No layout decisions here.
import type { Box } from "./layout";

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export type ViewingDistance = "near" | "medium" | "far";
export type InputMode = "touch" | "pointer" | "none";

export interface SurfaceBase {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Per-side inset content must stay inside (device notches, broadcast title-safe, bleed). */
  safeArea: Insets;
  /** Hard floor for every rendered text size, in surface pixels. */
  minTextSize: number;
  /** Minimum WCAG contrast ratio for text against its background. */
  minContrast: number;
  viewingDistance: ViewingDistance;
  category?: string;
  note?: string;
  source?: string;
}
/**
 * Interactive surfaces must declare a tap target; non-interactive ones (broadcast, composed
 * social images) cannot, so "input: none" plus "minTapTarget" is a compile-time error.
 */
export type Surface = SurfaceBase &
  (
    | { input: "touch" | "pointer"; minTapTarget: number }
    | { input: "none"; minTapTarget?: never }
  );

/** Smallest text size accepted for each viewing distance. */
export const distanceTextFloor: Record<ViewingDistance, number> = {
  near: 10,
  medium: 16,
  far: 24,
};

export const insets = (all: number): Insets => ({
  top: all,
  right: all,
  bottom: all,
  left: all,
});
export const tapTarget = (s: Surface) => (s.input === "none" ? 0 : s.minTapTarget);
export const safeBox = (s: Surface): Box => ({
  x: s.safeArea.left,
  y: s.safeArea.top,
  width: s.width - s.safeArea.left - s.safeArea.right,
  height: s.height - s.safeArea.top - s.safeArea.bottom,
});

const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

export function validateSurface(value: unknown): string[] {
  if (!value || typeof value !== "object") return ["Surface must be an object."];
  const s = value as Surface;
  const errors: string[] = [];
  if (typeof s.id !== "string" || !/^[a-z\d_-]{1,100}$/i.test(s.id))
    errors.push("Surface ID must contain 1–100 letters, digits, dashes, or underscores.");
  if (typeof s.name !== "string" || !s.name.trim() || s.name.length > 100)
    errors.push("Surface name must contain 1–100 characters.");
  for (const key of ["category", "note", "source"] as const)
    if (s[key] !== undefined && (typeof s[key] !== "string" || s[key]!.length > 1000))
      errors.push(`Invalid surface ${key}.`);
  for (const key of ["width", "height"] as const)
    if (!finite(s[key]) || s[key] < 32 || s[key] > 2400)
      errors.push(`${key} must be 32–2400 px.`);
  const a = s.safeArea;
  if (!a || typeof a !== "object" || !(["top", "right", "bottom", "left"] as const).every((k) => finite(a[k]) && a[k] >= 0))
    errors.push("Safe area needs top, right, bottom, and left insets of 0 px or more.");
  else if (finite(s.width) && finite(s.height) && (a.left + a.right > s.width - 32 || a.top + a.bottom > s.height - 32))
    errors.push("Safe area leaves less than 32 px of usable space.");
  if (!["near", "medium", "far"].includes(s.viewingDistance))
    errors.push("Viewing distance must be near, medium, or far.");
  if (!finite(s.minTextSize) || s.minTextSize < 8 || s.minTextSize > 120)
    errors.push("Minimum text size must be 8–120 px.");
  else if (s.viewingDistance in distanceTextFloor && s.minTextSize < distanceTextFloor[s.viewingDistance])
    errors.push(`A ${s.viewingDistance} viewing distance needs a minimum text size of at least ${distanceTextFloor[s.viewingDistance]} px.`);
  if (!["touch", "pointer", "none"].includes(s.input))
    errors.push("Input must be touch, pointer, or none.");
  else if (s.input === "none") {
    if (s.minTapTarget !== undefined)
      errors.push("A non-interactive surface cannot declare a tap target.");
  } else if (!finite(s.minTapTarget) || s.minTapTarget < 24 || s.minTapTarget > 200)
    errors.push("Minimum tap target must be 24–200 px for touch or pointer surfaces.");
  if (!finite(s.minContrast) || s.minContrast < 1 || s.minContrast > 21)
    errors.push("Contrast must be 1–21.");
  return errors;
}

export class SurfaceError extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join(" "));
    this.name = "SurfaceError";
  }
}
export function defineSurface<const S extends Surface>(surface: S): S {
  const errors = validateSurface(surface);
  if (errors.length) throw new SurfaceError(errors);
  return surface;
}
