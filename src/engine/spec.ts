// Ad specification: content and layout intent, declared once and independent of any surface.

/** Each role has exactly one legal element type. The mapping is enforced at compile time. */
export interface RoleTypes {
  primary: "text";
  secondary: "text";
  hero: "image";
  action: "button";
  branding: "text";
  /** A short supporting line ("This weekend only"). */
  supporting: "text";
  /** Optional decorative artwork. Yields before any content and is never cropped. */
  decoration: "image";
  /** Image logo. Its intrinsic proportions (`aspect`) are always kept. */
  logo: "image";
  /** One short promotional badge ("30% OFF") on its own solid fill. */
  badge: "text";
}
export type Role = keyof RoleTypes;
export type ElementType = RoleTypes[Role];
/** 1 is the most important. Higher numbers degrade first. */
export type Priority = 1 | 2 | 3 | 4 | 5;
export type HexColor = `#${string}`;

/** A small curated set of locally installed font stacks (see fonts.ts). */
export type FontKey = "sans" | "serif" | "humanist";
export const fontKeys: readonly FontKey[] = ["sans", "serif", "humanist"];
export type FontWeight = 400 | 600 | 700;
export const fontWeights: readonly FontWeight[] = [400, 600, 700];
/**
 * Typography preferences for one text element. `size` multiplies the resolver's preferred
 * size; the surface minimum and the degradation ladder still apply. Omitted fields keep the
 * original defaults (sans, the role's weight, preferred size, left or centred, theme colour).
 */
export interface TextStyle {
  font?: FontKey;
  weight?: FontWeight;
  /** 0.6–1.6. */
  size?: number;
  align?: "left" | "center";
  color?: HexColor;
}
export type ImageFit = "cover" | "contain";

interface ElementFor<R extends Role> {
  id: string;
  role: R;
  type: RoleTypes[R];
  priority: Priority;
  /** Text copy, or the image source for image roles. */
  content: string;
  /** Required elements are never omitted; the layout is impossible instead. */
  required?: boolean;
  /** Only secondary text may be truncated with an ellipsis as a degradation step. */
  truncate?: R extends "secondary" ? boolean : never;
  /** Text and button styling. */
  style?: RoleTypes[R] extends "image" ? never : TextStyle;
  /** Image fit. Omitted: cover for the hero, contain for decoration and logo. */
  fit?: RoleTypes[R] extends "image" ? ImageFit : never;
  /** Intrinsic width / height of an image (used to keep a logo's proportions), 0.1–10. */
  aspect?: RoleTypes[R] extends "image" ? number : never;
}
/** Discriminated union over roles, so `{ role: "hero", type: "text" }` does not compile. */
export type ElementSpec = { [R in Role]: ElementFor<R> }[Role];

export interface AdTheme {
  background: HexColor;
  foreground: HexColor;
  /** Button fill. */
  accent: HexColor;
  /** Button label color. Omitted: automatic (white or near-black, whichever reads better on the fill). */
  buttonText?: HexColor;
}
export type ButtonSize = "small" | "medium" | "large";
export const buttonSizes: readonly ButtonSize[] = ["small", "medium", "large"];
/**
 * Button styling intent. The size preset scales the CTA's preferred text and padding; the
 * surface's minimum text size and tap target still apply. Omitted: medium with 8 px corners.
 */
export interface ButtonStyle {
  size: ButtonSize;
  /** Corner radius in px; the resolver caps it at a pill (half the button's shorter side). */
  radius: number;
}
/**
 * Reusable composition families. A family is a preference: the resolver tries it first and
 * falls back to the automatic arrangements when it cannot satisfy the constraints.
 * - product: a dominant image region beside or below the copy, bleeding to the edges.
 * - panel: a full-bleed photo with the copy on a solid panel (contrast checked on the panel).
 * - type: large typography with optional decoration beside or below the copy.
 */
export type CompositionFamily = "product" | "panel" | "type";
export const compositionFamilies: readonly CompositionFamily[] = ["product", "panel", "type"];
export interface Composition {
  family: CompositionFamily;
  /** Preferred share of the surface given to the image (or decoration), 0.25–0.7. */
  imageShare: number;
  /** Solid panel behind the copy (panel family). Omitted: the theme background. */
  panel?: HexColor;
}
/** Hero image styling. The border is drawn inside the image edge, so geometry never grows. */
export type ImageMask = "rect" | "rounded" | "circle";
export const imageMasks: readonly ImageMask[] = ["rect", "rounded", "circle"];
export interface ImageStyle {
  /** Omitted: the original corners (8 px, or square for full-bleed images). */
  mask?: ImageMask;
  /** Corner radius for "rounded", 0–200 px; capped at half the shorter side. */
  radius?: number;
  border?: { color: HexColor; width: number };
}
/**
 * Decorative background graphic. Block and diagonal are anchored to the image region and sit
 * behind it; the frame sits in the safe-area margin. Graphics are never content: they are
 * dropped (with a reason) rather than allowed behind text.
 */
export type GraphicKind = "block" | "diagonal" | "frame";
export const graphicKinds: readonly GraphicKind[] = ["block", "diagonal", "frame"];
export interface Graphic {
  kind: GraphicKind;
  color: HexColor;
}
/** Badge fill and shape. The label colour comes from the badge element's style (else automatic). */
export interface BadgeStyle {
  fill: HexColor;
  shape: "pill" | "circle";
}
export interface AdSpec<E extends readonly ElementSpec[] = readonly ElementSpec[]> {
  elements: E;
  theme: AdTheme;
  button?: ButtonStyle;
  /** Image focal point in percent, used for cover cropping. */
  focal: { x: number; y: number };
  /** Omitted: automatic arrangement only (the original behaviour). */
  composition?: Composition;
  /** Gap multiplier, 0.6–1.6. Omitted: 1. */
  spacing?: number;
  imageStyle?: ImageStyle;
  graphic?: Graphic;
  /** Required when the spec has a badge element. */
  badge?: BadgeStyle;
}

export const roles: readonly Role[] = [
  "primary",
  "secondary",
  "hero",
  "action",
  "branding",
  "supporting",
  "decoration",
  "logo",
  "badge",
];
const typeOf: RoleTypes = {
  primary: "text",
  secondary: "text",
  hero: "image",
  action: "button",
  branding: "text",
  supporting: "text",
  decoration: "image",
  logo: "image",
  badge: "text",
};
const hex = (v: unknown) => typeof v === "string" && /^#[\da-f]{6}$/i.test(v);
const between = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

export class SpecError extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join(" "));
    this.name = "SpecError";
  }
}

/** Runtime validation for specs that arrive as data (imports, storage, network). */
export function validateSpec(value: unknown): string[] {
  if (!value || typeof value !== "object") return ["Ad spec must be an object."];
  const spec = value as AdSpec;
  const errors: string[] = [];
  if (!Array.isArray(spec.elements) || !spec.elements.length)
    return ["Ad spec needs at least one element."];
  const seenIds = new Set<string>();
  const seenRoles = new Set<string>();
  for (const [i, el] of spec.elements.entries()) {
    const label = `Element ${typeof el?.id === "string" ? `"${el.id}"` : i + 1}`;
    if (!el || typeof el !== "object") {
      errors.push(`${label} must be an object.`);
      continue;
    }
    if (typeof el.id !== "string" || !/^[a-z][\w-]{0,40}$/i.test(el.id))
      errors.push(`${label}: id must be 1–41 letters, digits, dashes or underscores.`);
    else if (seenIds.has(el.id)) errors.push(`${label}: duplicate id.`);
    seenIds.add(el.id);
    if (!roles.includes(el.role)) {
      errors.push(`${label}: unknown role "${String(el.role)}".`);
      continue;
    }
    if (seenRoles.has(el.role))
      errors.push(`${label}: only one "${el.role}" element is supported.`);
    seenRoles.add(el.role);
    const role: Role = el.role;
    if (el.type !== typeOf[role])
      errors.push(`${label}: role "${role}" requires type "${typeOf[role]}", not "${String(el.type)}".`);
    if (![1, 2, 3, 4, 5].includes(el.priority))
      errors.push(`${label}: priority must be an integer from 1 (highest) to 5.`);
    if (el.truncate !== undefined && el.role !== "secondary")
      errors.push(`${label}: only secondary text can be truncated.`);
    const isImage = typeOf[role] === "image";
    const limit = isImage ? 3_000_000 : 300;
    if (typeof el.content !== "string" || !el.content.trim() || el.content.length > limit)
      errors.push(`${label}: provide content (maximum ${isImage ? "3 MB" : "300 characters"}).`);
    else if (
      isImage &&
      !/^(\/[^/]|https:\/\/|data:image\/(png|jpeg|webp);base64,)/.test(el.content)
    )
      errors.push(`${label}: use a local asset, HTTPS image, or embedded PNG, JPEG, or WebP.`);
    if (el.fit !== undefined && (!isImage || !["cover", "contain"].includes(el.fit)))
      errors.push(`${label}: fit must be "cover" or "contain" on an image.`);
    if (el.aspect !== undefined && (!isImage || !between(el.aspect, 0.1, 10)))
      errors.push(`${label}: aspect must be an image width/height ratio of 0.1–10.`);
    if (el.style !== undefined) {
      const st = el.style as TextStyle;
      if (isImage || !st || typeof st !== "object") errors.push(`${label}: style applies to text and buttons only.`);
      else {
        if (st.font !== undefined && !fontKeys.includes(st.font)) errors.push(`${label}: unknown font.`);
        if (st.weight !== undefined && !fontWeights.includes(st.weight)) errors.push(`${label}: weight must be 400, 600 or 700.`);
        if (st.size !== undefined && !between(st.size, 0.6, 1.6)) errors.push(`${label}: size must be 0.6–1.6× the preferred size.`);
        if (st.align !== undefined && !["left", "center"].includes(st.align)) errors.push(`${label}: align must be left or center.`);
        if (st.color !== undefined && !hex(st.color)) errors.push(`${label}: color must be a six-digit hex color.`);
      }
    }
  }
  if (!spec.elements.some((el) => el?.required))
    errors.push("At least one element must be required.");
  for (const key of ["background", "foreground", "accent"] as const)
    if (!/^#[\da-f]{6}$/i.test(spec.theme?.[key] ?? ""))
      errors.push(`Theme ${key} must be a six-digit hex color.`);
  if (spec.theme?.buttonText !== undefined && !/^#[\da-f]{6}$/i.test(spec.theme.buttonText))
    errors.push("Theme buttonText must be a six-digit hex color.");
  if (spec.button !== undefined) {
    if (!buttonSizes.includes(spec.button?.size))
      errors.push('Button size must be "small", "medium" or "large".');
    const r = spec.button?.radius;
    if (typeof r !== "number" || !Number.isFinite(r) || r < 0 || r > 100)
      errors.push("Button radius must be between 0 and 100 px.");
  }
  for (const key of ["x", "y"] as const) {
    const v = spec.focal?.[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100)
      errors.push(`Focal ${key} must be between 0 and 100.`);
  }
  if (spec.composition !== undefined) {
    const c = spec.composition;
    if (!c || !compositionFamilies.includes(c.family))
      errors.push('Composition family must be "product", "panel" or "type".');
    if (!between(c?.imageShare, 0.25, 0.7)) errors.push("Composition image share must be 0.25–0.7.");
    if (c?.panel !== undefined && !hex(c.panel)) errors.push("Panel color must be a six-digit hex color.");
  }
  if (spec.spacing !== undefined && !between(spec.spacing, 0.6, 1.6))
    errors.push("Spacing must be 0.6–1.6.");
  if (spec.imageStyle !== undefined) {
    const st = spec.imageStyle;
    if (!st || typeof st !== "object") errors.push("Image style must be an object.");
    else {
      if (st.mask !== undefined && !imageMasks.includes(st.mask)) errors.push('Image mask must be "rect", "rounded" or "circle".');
      if (st.radius !== undefined && !between(st.radius, 0, 200)) errors.push("Image corner radius must be 0–200 px.");
      if (st.border !== undefined && (!hex(st.border?.color) || !between(st.border?.width, 0, 24)))
        errors.push("Image border needs a six-digit hex color and a width of 0–24 px.");
    }
  }
  if (spec.graphic !== undefined && (!graphicKinds.includes(spec.graphic?.kind) || !hex(spec.graphic?.color)))
    errors.push('Background graphic needs a kind ("block", "diagonal" or "frame") and a six-digit hex color.');
  if (spec.badge !== undefined && (!hex(spec.badge?.fill) || !["pill", "circle"].includes(spec.badge?.shape)))
    errors.push('Badge style needs a six-digit hex fill and a shape of "pill" or "circle".');
  if (spec.elements.some((el) => el?.role === "badge") && spec.badge === undefined)
    errors.push("A badge element needs a badge style (fill and shape).");
  return errors;
}

/**
 * Declares an ad once. Invalid role/type pairs, priorities outside 1–5, and truncation
 * on non-secondary text fail at compile time; data-level problems (duplicate ids, empty
 * copy, unsafe image URLs) throw a SpecError immediately.
 */
export function defineAd<const E extends readonly ElementSpec[]>(
  spec: AdSpec<E>,
): AdSpec<E> {
  const errors = validateSpec(spec);
  if (errors.length) throw new SpecError(errors);
  return spec;
}
