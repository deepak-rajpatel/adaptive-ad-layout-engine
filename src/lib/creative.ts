// The editor's content model and its conversion into a declarative AdSpec.
import { validateSpec, type AdSpec, type HexColor, type Priority } from "../engine/spec";

export type CreativeKey = "brand" | "headline" | "image" | "price" | "cta";
export interface Creative {
  brand: string;
  headline: string;
  price: string;
  cta: string;
  image: string;
  background: string;
  foreground: string;
  accent: string;
  focalX: number;
  focalY: number;
  /** 1 is most important, matching the brief. */
  priorities: Record<CreativeKey, Priority>;
}

/** Priorities follow the brief's example spec: headline/image 1, CTA/price 2, logo 3. */
export const sample: Creative = {
  brand: "VOXORA",
  headline: "Sound without limits.",
  price: "From $129",
  cta: "Shop now",
  image: "/headphones.jpg",
  background: "#f5f0e7",
  foreground: "#262d24",
  accent: "#c74620",
  focalX: 50,
  focalY: 50,
  priorities: { headline: 1, image: 1, cta: 2, price: 2, brand: 3 },
};

export function toSpec(c: Creative): AdSpec {
  return {
    elements: [
      { id: "headline", type: "text", role: "primary", priority: c.priorities.headline, required: true, content: c.headline },
      { id: "image", type: "image", role: "hero", priority: c.priorities.image, content: c.image },
      { id: "cta", type: "button", role: "action", priority: c.priorities.cta, required: true, content: c.cta },
      { id: "brand", type: "text", role: "branding", priority: c.priorities.brand, content: c.brand },
      { id: "price", type: "text", role: "secondary", priority: c.priorities.price, truncate: true, content: c.price },
    ],
    theme: {
      background: c.background as HexColor,
      foreground: c.foreground as HexColor,
      accent: c.accent as HexColor,
    },
    focal: { x: c.focalX, y: c.focalY },
  };
}

export function validateCreative(value: unknown): string[] {
  if (!value || typeof value !== "object") return ["Creative must be an object."];
  const c = value as Creative;
  if (!c.priorities || typeof c.priorities !== "object")
    return ["Creative priorities must be an object."];
  return validateSpec(toSpec(c));
}
