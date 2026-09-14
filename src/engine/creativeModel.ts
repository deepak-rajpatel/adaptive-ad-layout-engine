// The editor's content model (plain data) and its conversion into a declarative AdSpec.
import {
  buttonSizes,
  validateSpec,
  type AdSpec,
  type ButtonSize,
  type ElementSpec,
  type HexColor,
  type Priority,
} from "./spec";
import type { Goal } from "./placements";

export type CreativeKey = "brand" | "headline" | "image" | "offer" | "cta";
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
}

export const defaultRequired: Record<CreativeKey, boolean> = {
  headline: true,
  cta: true,
  brand: false,
  image: false,
  offer: false,
};

/**
 * Intent-driven priorities (1 = most important). Used when `useGoalPriorities` is on.
 * Sales is the brief's product ad, so it keeps the brief's example priorities exactly.
 * Intent only changes data the resolver receives, never geometry.
 */
export const goalPriorities: Record<Goal, Record<CreativeKey, Priority>> = {
  Awareness: { brand: 1, image: 1, headline: 2, cta: 3, offer: 4 },
  Consideration: { headline: 1, image: 2, cta: 2, offer: 3, brand: 4 },
  Leads: { headline: 1, cta: 1, offer: 2, image: 2, brand: 3 },
  Sales: { headline: 1, image: 1, cta: 2, offer: 2, brand: 3 },
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
  priorities: { headline: 1, image: 1, cta: 2, offer: 2, brand: 3 },
  required: defaultRequired,
  goal: "Sales",
  useGoalPriorities: true,
  campaignType: "Product",
  destination: "",
  body: "",
  longHeadline: "",
  description: "",
  focalOverrides: {},
};

// The offer keeps the element id "price" so resolved layouts, explanations and renderer
// class names stay identical for projects saved before the rename.
// Blank optional elements are left out; blank required ones stay in so validation reports them.
export function toSpec(c: CreativeData): AdSpec {
  const p = effectivePriorities(c).priorities;
  const req = (key: CreativeKey) => (c.required[key] ? { required: true } : {});
  const keep = (key: CreativeKey) => c.required[key] || hasContent(c[key]);
  const elements: ElementSpec[] = [];
  if (keep("headline")) elements.push({ id: "headline", type: "text", role: "primary", priority: p.headline, ...req("headline"), content: c.headline });
  if (keep("image")) elements.push({ id: "image", type: "image", role: "hero", priority: p.image, ...req("image"), content: c.image });
  if (keep("cta")) elements.push({ id: "cta", type: "button", role: "action", priority: p.cta, ...req("cta"), content: c.cta });
  if (keep("brand")) elements.push({ id: "brand", type: "text", role: "branding", priority: p.brand, ...req("brand"), content: c.brand });
  if (keep("offer")) elements.push({ id: "price", type: "text", role: "secondary", priority: p.offer, ...req("offer"), truncate: true, content: c.offer });
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
  };
}

const keys: readonly CreativeKey[] = ["brand", "headline", "image", "offer", "cta"];
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
  return [...errors, ...validateSpec(toSpec(c))];
}
