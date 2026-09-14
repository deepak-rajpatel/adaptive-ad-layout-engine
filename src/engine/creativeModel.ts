// The editor's content model (plain data) and its conversion into a declarative AdSpec.
import { validateSpec, type AdSpec, type ElementSpec, type HexColor, type Priority } from "./spec";
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
  accent: string;
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

/** Goal-driven priorities (1 = most important). Used when `useGoalPriorities` is on. */
export const goalPriorities: Record<Goal, Record<CreativeKey, Priority>> = {
  Awareness: { image: 1, headline: 1, brand: 2, cta: 3, offer: 4 },
  Consideration: { headline: 1, image: 2, cta: 2, offer: 3, brand: 4 },
  Leads: { headline: 1, cta: 1, image: 2, offer: 3, brand: 4 },
  Sales: { offer: 1, cta: 1, headline: 2, image: 2, brand: 4 },
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
 * Priorities follow the brief's example spec: headline/image 1, CTA/offer 2, logo 3.
 * Goal priorities stay off for the sample so the brief's demo layouts are unchanged;
 * the planner offers a toggle.
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
  focalX: 50,
  focalY: 50,
  priorities: { headline: 1, image: 1, cta: 2, offer: 2, brand: 3 },
  required: defaultRequired,
  goal: "Awareness",
  useGoalPriorities: false,
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
    },
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
