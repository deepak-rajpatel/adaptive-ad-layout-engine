// The four surfaces the assignment brief requires. Canonical data for the studio presets
// and the placement catalog.
import { defineSurface, insets, type Surface } from "../surfaces";

export const requiredCategory = "Required surfaces";
const mobile = {
  minTextSize: 14,
  minContrast: 4.5,
  viewingDistance: "near",
  input: "touch",
  minTapTarget: 44,
} as const;

export const assignmentSurfaces: Surface[] = [
  defineSurface({
    ...mobile,
    id: "portrait",
    name: "Mobile portrait",
    width: 320,
    height: 480,
    safeArea: { top: 24, right: 16, bottom: 24, left: 16 },
    category: requiredCategory,
    note: "Mobile interstitial profile from the brief: 320 × 480 with a 44 px tap target.",
  }),
  defineSurface({
    ...mobile,
    id: "landscape",
    name: "Mobile landscape",
    width: 480,
    height: 320,
    safeArea: { top: 16, right: 24, bottom: 16, left: 24 },
    category: requiredCategory,
  }),
  defineSurface({
    id: "broadcast",
    name: "Broadcast lower-third",
    width: 1920,
    height: 250,
    safeArea: { top: 20, right: 192, bottom: 20, left: 192 },
    minTextSize: 32,
    minContrast: 4.5,
    viewingDistance: "far",
    input: "none",
    category: requiredCategory,
    note: "Brief profile: 1920 × 250, far viewing distance, 32 px minimum text. Left and right insets follow a 10% title-safe margin. Not interactive, so no tap target applies.",
  }),
  defineSurface({
    id: "kiosk",
    name: "Retail kiosk",
    width: 1080,
    height: 1080,
    safeArea: insets(48),
    minTextSize: 24,
    minContrast: 4.5,
    viewingDistance: "medium",
    input: "touch",
    minTapTarget: 60,
    category: requiredCategory,
    note: "Brief profile: 1080 × 1080 touch-only screen with a 60 px tap target.",
  }),
];
