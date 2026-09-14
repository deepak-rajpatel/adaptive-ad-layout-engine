// Surface presets are plain data consumed by the same resolver; no preset has its own code path.
import { defineSurface, insets, type Surface } from "../engine/surfaces";
export { sample } from "./creative";

const required = "Required surfaces";
const mobile = {
  minTextSize: 14,
  minContrast: 4.5,
  viewingDistance: "near",
  input: "touch",
  minTapTarget: 44,
} as const;

export const surfaces: Surface[] = [
  defineSurface({
    ...mobile,
    id: "portrait",
    name: "Mobile portrait",
    width: 320,
    height: 480,
    safeArea: { top: 24, right: 16, bottom: 24, left: 16 },
    category: required,
    note: "Mobile interstitial profile from the brief: 320 × 480 with a 44 px tap target.",
  }),
  defineSurface({
    ...mobile,
    id: "landscape",
    name: "Mobile landscape",
    width: 480,
    height: 320,
    safeArea: { top: 16, right: 24, bottom: 16, left: 24 },
    category: required,
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
    category: required,
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
    category: required,
    note: "Brief profile: 1080 × 1080 touch-only screen with a 60 px tap target.",
  }),
  defineSurface({
    id: "tight",
    name: "Constrained banner",
    width: 240,
    height: 80,
    safeArea: insets(8),
    minTextSize: 12,
    minContrast: 4.5,
    viewingDistance: "near",
    input: "touch",
    minTapTarget: 32,
    category: "Stress tests",
  }),
  ...(
    [
      [300, 250, "Medium rectangle"],
      [728, 90, "Leaderboard"],
      [160, 600, "Wide skyscraper"],
      [300, 600, "Half-page"],
      [320, 50, "Mobile leaderboard"],
      [320, 100, "Large mobile banner"],
      [336, 280, "Large rectangle"],
      [970, 250, "Billboard"],
      [970, 90, "Super leaderboard"],
      [120, 600, "Standard skyscraper"],
      [300, 1050, "Portrait"],
      [468, 60, "Full banner"],
      [300, 50, "Small mobile banner"],
    ] as const
  ).map(([width, height, name]) =>
    // Constraints scale with the unit, not per-size templates: thin banners get tighter
    // insets and the WCAG 2.5.8 minimum target; larger units keep 32 px targets.
    defineSurface({
      id: `iab-${width}x${height}`,
      name: `${name} · ${width}×${height}`,
      width,
      height,
      safeArea: insets(height <= 60 ? 4 : height <= 100 ? 6 : 12),
      minTextSize: height <= 60 ? 10 : 12,
      minContrast: 4.5,
      viewingDistance: "near",
      input: "pointer",
      minTapTarget: height <= 100 ? 24 : 32,
      category: "IAB display",
      note: "IAB standard display size. Checks canvas dimensions and layout constraints only; file weight, animation, and ad-network policies need separate review.",
    }),
  ),
  ...(
    [
      ["social-square", 1080, 1080, "Square feed & carousel · 1:1", insets(64), 36],
      ["social-portrait", 1080, 1350, "Vertical mobile feed · 4:5", insets(64), 36],
      ["social-story", 1080, 1920, "Stories, Reels, TikTok, Shorts · 9:16", { top: 250, right: 64, bottom: 340, left: 64 }, 36],
      ["social-landscape", 1200, 628, "Horizontal / landscape · 1.91:1", insets(48), 30],
      ["social-hires-square", 1200, 1200, "High-res square display", insets(64), 36],
    ] as const
  ).map(([id, width, height, name, safeArea, minTextSize]) =>
    // Social canvases are viewed at roughly a third of their pixel size on phones, so the
    // 36 px floor is about 12 CSS px. The platform draws its own tappable CTA: input "none".
    defineSurface({
      id,
      name,
      width,
      height,
      safeArea,
      minTextSize,
      minContrast: 4.5,
      viewingDistance: "near",
      input: "none",
      category: "Social & digital",
      note:
        id === "social-story"
          ? "Composed 9:16 image. Top and bottom insets keep copy clear of platform profile, caption, and reply UI (approximate; confirm each platform's current safe zone). The platform supplies the tappable CTA."
          : "Composed image preview. Platforms add their own UI and tappable CTA around it; placement policies require separate review.",
    }),
  ),
  defineSurface({
    id: "taboola-concept",
    name: "Taboola · Native concept",
    width: 1200,
    height: 675,
    safeArea: insets(32),
    minTextSize: 24,
    minContrast: 4.5,
    viewingDistance: "near",
    input: "none",
    category: "Native advertising",
    source: "https://developers.taboola.com/backstage-api/docs/item-thumbnail_url",
    note: "Concept only: Taboola assembles image, title, and branding separately. This composed canvas is not the actual native ad or a submission-ready thumbnail. Dimensions follow its preferred 16:9 image ratio; submit assets separately.",
  }),
  defineSurface({
    ...mobile,
    id: "custom",
    name: "Custom surface",
    width: 480,
    height: 480,
    safeArea: insets(24),
    category: "Your dimensions",
  }),
];
export const presetById = (id: string) => surfaces.find((s) => s.id === id);
