export type ElementId = "brand" | "headline" | "image" | "price" | "cta";
export type Arrangement = "stack" | "split" | "strip" | "gallery";
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
  priorities: Record<ElementId, number>;
}
export interface Surface {
  id: string;
  name: string;
  width: number;
  height: number;
  safe: number;
  minFont: number;
  minTarget: number;
  minContrast: number;
  category?: string;
  note?: string;
  source?: string;
}
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface ResolvedElement extends Box {
  id: ElementId;
  fontSize: number;
  lines: string[];
  lineHeight: number;
}
export interface Resolution {
  status: "ready" | "adapted" | "impossible" | "invalid";
  arrangement?: Arrangement;
  elements: ResolvedElement[];
  omitted: ElementId[];
  decisions: string[];
  errors: string[];
  contrast: number;
  buttonText: string;
}
export type Measure = (text: string, size: number, weight: number) => number;
