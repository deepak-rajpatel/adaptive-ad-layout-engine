// Resolved layout: everything a renderer needs, so DOM and Canvas never make layout decisions.
import type { FontKey, Priority, Role } from "./spec";

export type Arrangement = "stack" | "split" | "strip" | "gallery" | "product" | "panel" | "type";
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
  fontWeight: number;
  /** Font stack key; absent means "sans" (the original font). */
  fontFamily?: FontKey;
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
  /** Absent means cover. With contain, the focal point positions the image in its box. */
  fit?: "contain";
  /**
   * Background layer: may extend past the safe area to the surface edges and sit behind
   * panels. Content may never overlap it except on a solid panel (see geometryErrors).
   */
  layer?: "background";
}
export type ResolvedElement = ResolvedText | ResolvedImage;
/** A solid background panel. Text placed on it is contrast-checked against its fill. */
export interface ResolvedPanel extends Box {
  kind: "panel";
  id: string;
  fill: string;
  explanation: string[];
}

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
  /** Solid panels, present only for panel compositions. */
  panels?: ResolvedPanel[];
  omitted: OmittedElement[];
  decisions: string[];
  errors: string[];
  /** Text-on-background contrast ratio. */
  contrast: number;
}

/**
 * Explicit paint order shared by every renderer: background colour (implicit), background
 * images, panels, then content in element order. Future animation transforms apply to this
 * list after resolution; they never feed back into layout validation.
 */
export function paintOrder(layout: ResolvedLayout): (ResolvedElement | ResolvedPanel)[] {
  const back = layout.elements.filter((e) => e.kind === "image" && e.layer === "background");
  const front = layout.elements.filter((e) => !(e.kind === "image" && e.layer === "background"));
  return [...back, ...(layout.panels ?? []), ...front];
}
