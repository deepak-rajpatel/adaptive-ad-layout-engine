// The editor's content model (plain data) and its conversion into a declarative AdSpec.
import { validateSpec, type AdSpec, type HexColor, type Priority } from "./spec";
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

/** Priorities follow the brief's example spec: headline/image 1, CTA/offer 2, logo 3. */
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
export function toSpec(c: CreativeData): AdSpec {
  const req = (key: CreativeKey) => (c.required[key] ? { required: true } : {});
  return {
    elements: [
      { id: "headline", type: "text", role: "primary", priority: c.priorities.headline, ...req("headline"), content: c.headline },
      { id: "image", type: "image", role: "hero", priority: c.priorities.image, ...req("image"), content: c.image },
      { id: "cta", type: "button", role: "action", priority: c.priorities.cta, ...req("cta"), content: c.cta },
      { id: "brand", type: "text", role: "branding", priority: c.priorities.brand, ...req("brand"), content: c.brand },
      { id: "price", type: "text", role: "secondary", priority: c.priorities.offer, ...req("offer"), truncate: true, content: c.offer },
    ],
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
