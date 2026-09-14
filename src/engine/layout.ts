// Resolved layout: everything a renderer needs, so DOM and Canvas never make layout decisions.
import type { Priority, Role } from "./spec";

export type Arrangement = "stack" | "split" | "strip" | "gallery";
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface ResolvedBase extends Box {
  id: string;
  role: Role;
  priority: Priority;
  /** Plain-language reasons for this element's slot, size, and any degradation. */
  explanation: string[];
}
export interface ResolvedText extends ResolvedBase {
  kind: "text" | "button";
  lines: string[];
  fontSize: number;
  lineHeight: number;
  fontWeight: 600 | 700;
  align: "left" | "center";
  color: string;
  /** Button fill; absent for plain text. */
  fill?: string;
  radius: number;
  /** Rendered size as a share of the preferred size (1 = not shrunk). */
  scale: number;
  truncated: boolean;
}
export interface ResolvedImage extends ResolvedBase {
  kind: "image";
  src: string;
  focalX: number;
  focalY: number;
  radius: number;
}
export type ResolvedElement = ResolvedText | ResolvedImage;

export interface OmittedElement {
  id: string;
  role: Role;
  priority: Priority;
}
export interface ResolvedLayout {
  /** ready: everything at preferred size. adapted: shrunk, truncated, or omitted. */
  status: "ready" | "adapted" | "impossible" | "invalid";
  width: number;
  height: number;
  background: string;
  arrangement?: Arrangement;
  elements: ResolvedElement[];
  omitted: OmittedElement[];
  decisions: string[];
  errors: string[];
  /** Text-on-background contrast ratio. */
  contrast: number;
}
