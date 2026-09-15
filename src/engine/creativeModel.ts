// The editor's content model (plain data) and its conversion into a declarative AdSpec.
import {
  buttonSizes,
  compositionFamilies,
  graphicKinds,
  imageMasks,
  validateSpec,
  type AdSpec,
  type ButtonSize,
  type CompositionFamily,
  type ElementSpec,
  type GraphicKind,
  type HexColor,
  type ImageFit,
  type ImageMask,
  type Priority,
  type TextStyle,
} from "./spec";
import type { Goal } from "./placements";

/** Stable element keys; each maps to one element id in the spec ("offer" keeps the id "price"). */
export type CreativeKey =
  | "brand"
  | "headline"
  | "supporting"
  | "image"
  | "offer"
  | "cta"
  | "decoration"
  | "logo"
  | "badge";
/** Elements that take typography settings. */
export type TextKey = "brand" | "headline" | "supporting" | "offer" | "cta" | "badge";
export const textKeys: readonly TextKey[] = ["brand", "headline", "supporting", "offer", "cta", "badge"];
/** "auto" keeps the original image corners. */
export type ImageMaskChoice = "auto" | ImageMask;
export const imageMaskChoices: readonly ImageMaskChoice[] = ["auto", ...imageMasks];
export type GraphicChoice = "none" | GraphicKind;
export const graphicChoices: readonly GraphicChoice[] = ["none", ...graphicKinds];
const hex6 = (v: unknown) => typeof v === "string" && /^#[\da-f]{6}$/i.test(v);
const numberIn = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
/** "auto" is the original automatic arrangement; the others are preferred composition families. */
export type CompositionChoice = "auto" | CompositionFamily;
export const compositionChoices: readonly CompositionChoice[] = ["auto", ...compositionFamilies];
export type Spacing = "compact" | "normal" | "airy";
export const spacings: readonly Spacing[] = ["compact", "normal", "airy"];
export const spacingScale: Record<Spacing, number> = { compact: 0.75, normal: 1, airy: 1.3 };
export type CampaignType =
  | "Product"
  | "Service"
  | "Brand"
  | "Event"
  | "Hiring"
  | "LeadMagnet";
export const campaignTypes: readonly CampaignType[] = [
  "Product",
  "Service",
  "Brand",
  "Event",
  "Hiring",
  "LeadMagnet",
];
export const goals: readonly Goal[] = ["Awareness", "Consideration", "Leads", "Sales"];
/** Display order for goal menus and tiles: Sales (the brief's product ad) first. */
export const goalOrder: readonly Goal[] = ["Sales", "Leads", "Consideration", "Awareness"];
/** Offers longer than this are kept but flagged in the editor. */
export const offerLimit = 40;

export interface CreativeData {
  brand: string;
  headline: string;
  /** Price, discount or incentive ("From $129", "Free webinar"). */
  offer: string;
  cta: string;
  image: string;
  background: string;
  foreground: string;
  /** Button fill. */
  accent: string;
  /** Button label color; "" = automatic (readable on the fill). */
  buttonText: string;
  buttonSize: ButtonSize;
  /** Button corner rounding in px (0–40; the resolver caps it at a pill). */
  buttonRadius: number;
  focalX: number;
  focalY: number;
  /** 1 is most important, matching the brief. */
  priorities: Record<CreativeKey, Priority>;
  /** Required elements are never omitted by the resolver. */
  required: Record<CreativeKey, boolean>;
  goal: Goal;
  /** When on, the goal sets element priorities (planned); migrated projects keep it off. */
  useGoalPriorities: boolean;
  campaignType: CampaignType;
  destination: string;
  /** Primary text shown around native placements. */
  body: string;
  longHeadline: string;
  description: string;
  /** Per-placement focal points, keyed by placement id. */
  focalOverrides: Record<string, { x: number; y: number }>;
  /** Optional supporting line ("This weekend only"). */
  supporting: string;
  /** Optional decorative artwork (image path); replaceable, never cropped. */
  decoration: string;
  /** Preferred composition; "auto" keeps the original automatic arrangements. */
  composition: CompositionChoice;
  /** Preferred image (or decoration) prominence in percent, 25–70. */
  imageShare: number;
  /** Panel colour for the photo-and-panel composition; "" = the background colour. */
  panelColor: string;
  spacing: Spacing;
  /** Hero image fit: cover (fill, cropped at the focal point) or contain (whole image). */
  imageFit: ImageFit;
  /** Typography per text element. Missing entries keep the defaults. */
  textStyles: Partial<Record<TextKey, TextStyle>>;
  /** Image logo (path or embedded image); "" = none. Brand text, logo, or both. */
  logo: string;
  /** The logo's intrinsic width / height, measured on upload. */
  logoAspect: number;
  /** Promotional badge label ("30% OFF"); "" = no badge. Separate from the offer text. */
  badge: string;
  badgeFill: string;
  /** Badge label colour; "" = automatic (readable on the fill). */
  badgeTextColor: string;
  badgeShape: "pill" | "circle";
  /** Hero image mask; "auto" keeps the original corners. */
  imageMask: ImageMaskChoice;
  /** Corner radius for the rounded mask, px. */
  imageRadius: number;
  /** Image border width in px; 0 = no border. */
  imageBorderWidth: number;
  imageBorderColor: string;
  /** Background graphic behind the image region (or a frame in the margin). */
  graphic: GraphicChoice;
  graphicColor: string;
  /** The hero image's measured width / height (0 = unknown). Lets the badge hug a cut-out. */
  imageAspect: number;
}

export const defaultRequired: Record<CreativeKey, boolean> = {
  headline: true,
  cta: true,
  brand: false,
  image: false,
  offer: false,
  supporting: false,
  decoration: false,
  logo: false,
  badge: false,
};
/** Defaults for the brand, image-style, background and badge settings: add nothing to the spec. */
export const visualDefaults = {
  logo: "",
  logoAspect: 1,
  badge: "",
  badgeFill: "#ffd23f",
  badgeTextColor: "",
  badgeShape: "circle",
  imageMask: "auto",
  imageRadius: 24,
  imageBorderWidth: 0,
  imageBorderColor: "#ffffff",
  graphic: "none",
  graphicColor: "#f59e3b",
  imageAspect: 0,
} as const satisfies Partial<CreativeData>;

/**
 * Intent-driven priorities (1 = most important). Used when `useGoalPriorities` is on.
 * Sales is the brief's product ad, so it keeps the brief's example priorities exactly.
 * Intent only changes data the resolver receives, never geometry.
 */
export const goalPriorities: Record<Goal, Record<CreativeKey, Priority>> = {
  // Supporting copy sits mid-ladder; decoration is always the first thing to yield.
  // The logo ranks with brand text; the badge ranks with the offer it promotes.
  Awareness: { brand: 1, logo: 1, image: 1, headline: 2, cta: 3, supporting: 3, offer: 4, badge: 4, decoration: 5 },
  Consideration: { headline: 1, image: 2, cta: 2, offer: 3, badge: 3, supporting: 3, brand: 4, logo: 4, decoration: 5 },
  Leads: { headline: 1, cta: 1, offer: 2, badge: 2, image: 2, brand: 3, logo: 3, supporting: 3, decoration: 5 },
  Sales: { headline: 1, image: 1, cta: 2, offer: 2, badge: 2, brand: 3, logo: 3, supporting: 3, decoration: 5 },
};

/** CTA labels offered in the editor (Taboola's list; "None" is left out because the CTA is required). */
export const ctaOptions: readonly string[] = [
  "Read More", "Learn More", "Shop Now", "Download Now", "Install Now", "Sign Up",
  "Get Quote", "Book Now", "Play Now", "Watch Now", "Listen Now", "Apply Now",
  "Contact Us", "Order Now", "Search Now", "Try Now", "See More", "Get Offer",
  "View More", "Spin Now",
];

/** What each intent asks for: the secondary-text label and the suggested CTAs (first = default). */
export const intentCopy: Record<Goal, { label: string; offerLabel: string; offerHint: string; ctas: readonly string[] }> = {
  Awareness: { label: "Brand awareness", offerLabel: "Tagline", offerHint: "Optional, e.g. Since 1998", ctas: ["Learn More", "See More", "Watch Now"] },
  Consideration: { label: "Traffic / consideration", offerLabel: "Teaser", offerHint: "e.g. 5-minute read", ctas: ["Read More", "Learn More", "View More"] },
  Leads: { label: "Lead generation", offerLabel: "Incentive", offerHint: "e.g. Free quote in 24 h", ctas: ["Sign Up", "Get Quote", "Contact Us", "Book Now", "Apply Now"] },
  Sales: { label: "Sales", offerLabel: "Price or offer", offerHint: "e.g. From $129", ctas: ["Shop Now", "Order Now", "Get Offer"] },
};
/** Default CTA suggestion per campaign type. Suggestions never change the CTA automatically. */
export const campaignCta: Record<CampaignType, string> = {
  Product: "Shop now",
  Service: "Contact us",
  Brand: "Learn more",
  Event: "Register",
  Hiring: "Apply now",
  LeadMagnet: "Download",
};
export const hasContent = (text: string) => text.trim().length > 0;

/**
 * The priorities toSpec applies. With goal priorities on, Sales without an offer falls back
 * to Consideration (`fallback: true`); manual priorities are used as they are.
 */
export function effectivePriorities(c: CreativeData): { priorities: Record<CreativeKey, Priority>; fallback: boolean } {
  if (!c.useGoalPriorities) return { priorities: c.priorities, fallback: false };
  if (c.goal === "Sales" && !hasContent(c.offer))
    return { priorities: goalPriorities.Consideration, fallback: true };
  return { priorities: goalPriorities[c.goal], fallback: false };
}

/**
 * The brief's product ad. Intent is Sales, whose priorities equal the brief's example
 * (headline/image 1, CTA/offer 2, logo 3), so the demo layouts are unchanged.
 */
export const sample: CreativeData = {
  brand: "VOXORA",
  headline: "Sound without limits.",
  offer: "From $129",
  cta: "Shop now",
  image: "/headphones.jpg",
  background: "#f5f0e7",
  foreground: "#262d24",
  accent: "#c74620",
  // Automatic label color, medium size and 8 px corners reproduce the original button exactly.
  buttonText: "",
  buttonSize: "medium",
  buttonRadius: 8,
  focalX: 50,
  focalY: 50,
  priorities: { headline: 1, image: 1, cta: 2, offer: 2, brand: 3, supporting: 3, decoration: 5, logo: 3, badge: 2 },
  required: defaultRequired,
  goal: "Sales",
  useGoalPriorities: true,
  campaignType: "Product",
  destination: "",
  body: "",
  longHeadline: "",
  description: "",
  focalOverrides: {},
  // Composition and typography defaults reproduce the original layouts exactly.
  supporting: "",
  decoration: "",
  composition: "auto",
  imageShare: 50,
  panelColor: "",
  spacing: "normal",
  imageFit: "cover",
  textStyles: {},
  ...visualDefaults,
};

// The offer keeps the element id "price" so resolved layouts, explanations and renderer
// class names stay identical for projects saved before the rename.
// Blank optional elements are left out; blank required ones stay in so validation reports them.
// New elements (supporting, decoration) are appended after the original five so the original
// declaration order, and therefore the omission order on ties, is unchanged.
// Default styling, composition and spacing add nothing to the spec, so old layouts are identical.
export function toSpec(c: CreativeData): AdSpec {
  const p = effectivePriorities(c).priorities;
  const req = (key: CreativeKey) => (c.required[key] ? { required: true } : {});
  const keep = (key: CreativeKey) => c.required[key] || hasContent(c[key]);
  const styleFor = (key: TextKey) => {
    const st = c.textStyles?.[key];
    if (!st || typeof st !== "object") return {};
    // Buttons take font, weight and size; their colours and centring come from Appearance.
    // The badge's label colour has its own control, so only its font, weight and size come from here.
    const picked: TextStyle =
      key === "cta" || key === "badge" ? { font: st.font, weight: st.weight, size: st.size } : { ...st };
    const style = Object.fromEntries(Object.entries(picked).filter(([, v]) => v !== undefined)) as TextStyle;
    return Object.keys(style).length ? { style } : {};
  };
  const elements: ElementSpec[] = [];
  if (keep("headline")) elements.push({ id: "headline", type: "text", role: "primary", priority: p.headline, ...req("headline"), content: c.headline, ...styleFor("headline") });
  if (keep("image")) elements.push({ id: "image", type: "image", role: "hero", priority: p.image, ...req("image"), content: c.image, ...(c.imageFit === "contain" ? { fit: "contain" as const } : {}), ...(c.imageAspect ? { aspect: c.imageAspect } : {}) });
  if (keep("cta")) elements.push({ id: "cta", type: "button", role: "action", priority: p.cta, ...req("cta"), content: c.cta, ...styleFor("cta") });
  if (keep("brand")) elements.push({ id: "brand", type: "text", role: "branding", priority: p.brand, ...req("brand"), content: c.brand, ...styleFor("brand") });
  if (keep("offer")) elements.push({ id: "price", type: "text", role: "secondary", priority: p.offer, ...req("offer"), truncate: true, content: c.offer, ...styleFor("offer") });
  if (keep("supporting")) elements.push({ id: "supporting", type: "text", role: "supporting", priority: p.supporting ?? 3, ...req("supporting"), content: c.supporting, ...styleFor("supporting") });
  if (keep("decoration")) elements.push({ id: "decoration", type: "image", role: "decoration", priority: p.decoration ?? 5, ...req("decoration"), content: c.decoration });
  if (keep("logo")) elements.push({ id: "logo", type: "image", role: "logo", priority: p.logo ?? 3, ...req("logo"), content: c.logo, aspect: c.logoAspect });
  if (keep("badge")) {
    const badgeStyle = styleFor("badge").style ?? {};
    const style: TextStyle = { ...badgeStyle, ...(c.badgeTextColor ? { color: c.badgeTextColor as HexColor } : {}) };
    elements.push({ id: "badge", type: "text", role: "badge", priority: p.badge ?? 2, ...req("badge"), content: c.badge, ...(Object.keys(style).length ? { style } : {}) });
  }
  const imageStyle = {
    ...(c.imageMask && c.imageMask !== "auto" ? { mask: c.imageMask, ...(c.imageMask === "rounded" ? { radius: c.imageRadius } : {}) } : {}),
    ...(c.imageBorderWidth > 0 ? { border: { color: c.imageBorderColor as HexColor, width: c.imageBorderWidth } } : {}),
  };
  return {
    elements,
    theme: {
      background: c.background as HexColor,
      foreground: c.foreground as HexColor,
      accent: c.accent as HexColor,
      ...(c.buttonText ? { buttonText: c.buttonText as HexColor } : {}),
    },
    button: { size: c.buttonSize, radius: c.buttonRadius },
    focal: { x: c.focalX, y: c.focalY },
    ...(c.composition && c.composition !== "auto"
      ? {
          composition: {
            family: c.composition,
            imageShare: c.imageShare / 100,
            ...(c.panelColor ? { panel: c.panelColor as HexColor } : {}),
          },
        }
      : {}),
    ...(c.spacing && c.spacing !== "normal" ? { spacing: spacingScale[c.spacing] } : {}),
    ...(Object.keys(imageStyle).length ? { imageStyle } : {}),
    ...(c.graphic && c.graphic !== "none" ? { graphic: { kind: c.graphic, color: c.graphicColor as HexColor } } : {}),
    ...(keep("badge") ? { badge: { fill: c.badgeFill as HexColor, shape: c.badgeShape } } : {}),
  };
}

const keys: readonly CreativeKey[] = ["brand", "headline", "supporting", "image", "offer", "cta", "decoration", "logo", "badge"];
const inRange = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;

export function validateCreative(value: unknown): string[] {
  if (!value || typeof value !== "object") return ["Creative must be an object."];
  const c = value as CreativeData;
  if (!c.priorities || typeof c.priorities !== "object")
    return ["Creative priorities must be an object."];
  if (!c.required || typeof c.required !== "object" || !keys.every((k) => typeof c.required[k] === "boolean"))
    return ["Creative required flags must be true or false for every element."];
  const errors: string[] = [];
  if (!goals.includes(c.goal)) errors.push("Goal must be Awareness, Consideration, Leads or Sales.");
  if (!campaignTypes.includes(c.campaignType)) errors.push("Unknown campaign type.");
  if (typeof c.useGoalPriorities !== "boolean") errors.push("Goal priorities setting must be true or false.");
  if (!buttonSizes.includes(c.buttonSize)) errors.push("Button size must be Small, Medium or Large.");
  if (typeof c.buttonRadius !== "number" || !Number.isFinite(c.buttonRadius) || c.buttonRadius < 0 || c.buttonRadius > 40)
    errors.push("Button corner rounding must be 0–40 px.");
  if (typeof c.buttonText !== "string" || (c.buttonText !== "" && !/^#[\da-f]{6}$/i.test(c.buttonText)))
    errors.push("Button text color must be automatic or a six-digit hex color.");
  for (const key of ["destination", "body", "longHeadline", "description"] as const)
    if (typeof c[key] !== "string" || c[key].length > 2000) errors.push(`Invalid ${key}.`);
  if (
    !c.focalOverrides ||
    typeof c.focalOverrides !== "object" ||
    !Object.values(c.focalOverrides).every((f) => f && inRange(f.x) && inRange(f.y))
  )
    errors.push("Crop focus overrides must be between 0 and 100.");
  if (typeof c.supporting !== "string" || c.supporting.length > 160)
    errors.push("Supporting line must be text of at most 160 characters.");
  if (typeof c.decoration !== "string") errors.push("Decoration must be an image path or empty.");
  if (!compositionChoices.includes(c.composition)) errors.push("Unknown composition.");
  if (typeof c.imageShare !== "number" || !Number.isFinite(c.imageShare) || c.imageShare < 25 || c.imageShare > 70)
    errors.push("Image prominence must be 25–70%.");
  if (typeof c.panelColor !== "string" || (c.panelColor !== "" && !/^#[\da-f]{6}$/i.test(c.panelColor)))
    errors.push("Panel colour must be automatic or a six-digit hex color.");
  if (!spacings.includes(c.spacing)) errors.push("Spacing must be Compact, Normal or Airy.");
  if (c.imageFit !== "cover" && c.imageFit !== "contain") errors.push("Image fit must be Fill or Fit.");
  if (
    !c.textStyles ||
    typeof c.textStyles !== "object" ||
    Array.isArray(c.textStyles) ||
    !Object.entries(c.textStyles).every(([k, v]) => textKeys.includes(k as TextKey) && !!v && typeof v === "object")
  )
    errors.push("Text styles must be settings keyed by text element.");
  if (typeof c.logo !== "string") errors.push("Logo must be an image path or empty.");
  if (!numberIn(c.logoAspect, 0.1, 10)) errors.push("Logo proportions must be a width/height ratio of 0.1–10.");
  if (typeof c.badge !== "string" || c.badge.length > 24) errors.push("Badge text must be at most 24 characters.");
  if (!hex6(c.badgeFill)) errors.push("Badge fill must be a six-digit hex color.");
  if (c.badgeTextColor !== "" && !hex6(c.badgeTextColor)) errors.push("Badge text color must be automatic or a six-digit hex color.");
  if (c.badgeShape !== "pill" && c.badgeShape !== "circle") errors.push("Badge shape must be Pill or Circle.");
  if (!imageMaskChoices.includes(c.imageMask)) errors.push("Unknown image mask.");
  if (!numberIn(c.imageRadius, 0, 200)) errors.push("Image corner radius must be 0–200 px.");
  if (!numberIn(c.imageBorderWidth, 0, 24)) errors.push("Image border must be 0–24 px.");
  if (!hex6(c.imageBorderColor)) errors.push("Image border color must be a six-digit hex color.");
  if (!graphicChoices.includes(c.graphic)) errors.push("Unknown background graphic.");
  if (!hex6(c.graphicColor)) errors.push("Background graphic color must be a six-digit hex color.");
  if (!(c.imageAspect === 0 || numberIn(c.imageAspect, 0.1, 10)))
    errors.push("Image proportions must be unknown (0) or a width/height ratio of 0.1–10.");
  if (errors.length) return errors;
  return validateSpec(toSpec(c));
}
