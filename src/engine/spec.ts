// Ad specification: content and layout intent, declared once and independent of any surface.

/** Each role has exactly one legal element type. The mapping is enforced at compile time. */
export interface RoleTypes {
  primary: "text";
  secondary: "text";
  hero: "image";
  action: "button";
  branding: "text";
}
export type Role = keyof RoleTypes;
export type ElementType = RoleTypes[Role];
/** 1 is the most important. Higher numbers degrade first. */
export type Priority = 1 | 2 | 3 | 4 | 5;
export type HexColor = `#${string}`;

interface ElementFor<R extends Role> {
  id: string;
  role: R;
  type: RoleTypes[R];
  priority: Priority;
  /** Text copy, or the image source for `hero`. */
  content: string;
  /** Required elements are never omitted; the layout is impossible instead. */
  required?: boolean;
  /** Only secondary text may be truncated with an ellipsis as a degradation step. */
  truncate?: R extends "secondary" ? boolean : never;
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
export interface AdSpec<E extends readonly ElementSpec[] = readonly ElementSpec[]> {
  elements: E;
  theme: AdTheme;
  button?: ButtonStyle;
  /** Image focal point in percent, used for cover cropping. */
  focal: { x: number; y: number };
}

export const roles: readonly Role[] = [
  "primary",
  "secondary",
  "hero",
  "action",
  "branding",
];
const typeOf: RoleTypes = {
  primary: "text",
  secondary: "text",
  hero: "image",
  action: "button",
  branding: "text",
};

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
    const limit = el.role === "hero" ? 3_000_000 : 300;
    if (typeof el.content !== "string" || !el.content.trim() || el.content.length > limit)
      errors.push(`${label}: provide content (maximum ${el.role === "hero" ? "3 MB" : "300 characters"}).`);
    else if (
      el.role === "hero" &&
      !/^(\/[^/]|https:\/\/|data:image\/(png|jpeg|webp);base64,)/.test(el.content)
    )
      errors.push(`${label}: use a local asset, HTTPS image, or embedded PNG, JPEG, or WebP.`);
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
