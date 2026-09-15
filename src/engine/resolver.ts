// Constraint resolver: (AdSpec, Surface, Measure) -> ResolvedLayout. Pure TypeScript, no DOM.
import {
  validateSpec,
  type AdSpec,
  type AdTheme,
  type ButtonSize,
  type CompositionFamily,
  type ElementSpec,
  type Role,
  type TextStyle,
} from "./spec";
import { safeBox, tapTarget, validateSurface, type Surface } from "./surfaces";
import { contrast, textOn } from "./contrast";
import { fontLabels } from "./fonts";
import { truncateLine, wrap, type Measure } from "./text";
import type {
  Arrangement,
  Box,
  OmittedElement,
  ResolvedElement,
  ResolvedLayout,
  ResolvedPanel,
} from "./layout";

type TextRole = Exclude<Role, "hero" | "decoration">;
type AutoArrangement = "stack" | "gallery" | "split" | "strip";
export const isImageRole = (role: Role) => role === "hero" || role === "decoration";
/** Visual reading order inside every arrangement. */
const readingOrder: Role[] = ["branding", "primary", "supporting", "hero", "secondary", "action", "decoration"];
/** Preferred text size as a multiple of the surface's base unit. */
const preferredEm: Record<TextRole, number> = {
  branding: 0.78,
  primary: 2.2,
  supporting: 0.95,
  secondary: 1.3,
  action: 0.85,
};
export const fontWeightFor = (role: Role): 600 | 700 =>
  role === "primary" || role === "secondary" ? 700 : 600;
const styleOf = (el: ElementSpec): TextStyle =>
  isImageRole(el.role) ? {} : ((el as { style?: TextStyle }).style ?? {});
const weightOf = (el: ElementSpec) => styleOf(el).weight ?? fontWeightFor(el.role);
const arrangements: AutoArrangement[] = ["stack", "gallery", "split", "strip"];
/** Width/height ratio each arrangement is designed for. */
const idealRatio: Record<AutoArrangement, number> = {
  stack: 0.56,
  gallery: 1,
  split: 1.8,
  strip: 5.8,
};
/** Candidate width allocations for the image or offer column. */
const shares: Record<AutoArrangement, number[]> = {
  stack: [0.5],
  gallery: [0.57, 0.45, 0.68],
  split: [0.47, 0.35, 0.58],
  strip: [0.3, 0.4, 0.25],
};
const shrinkSteps = [0.8, 0.62];
/** Surfaces at least this wide (width / height) use the side-by-side family variants. */
const sideRatio = 0.9;
/** Surfaces at least this wide use the band (multi-column) family variants. */
const bandRatio = 2.2;
/**
 * Button size presets: CTA text scale and label padding (horizontal total, vertical total).
 * Medium is the original behaviour. Minimum text size and tap target still apply on top.
 */
const buttonPresets: Record<ButtonSize, { em: number; padX: number; padY: number }> = {
  small: { em: 0.8, padX: 32, padY: 12 },
  medium: { em: 1, padX: 48, padY: 20 },
  large: { em: 1.25, padX: 64, padY: 28 },
};
const buttonPreset = (spec: AdSpec) => buttonPresets[spec.button?.size ?? "medium"];
export const buttonTextColor = (theme: AdTheme) => theme.buttonText ?? textOn(theme.accent);
/** Every text colour that must be readable on a ground (buttons are checked on their fill). */
const textColors = (spec: AdSpec) => {
  const texts = spec.elements.filter((e) => e.type === "text");
  return texts.length ? texts.map((e) => styleOf(e).color ?? spec.theme.foreground) : [spec.theme.foreground];
};

interface Plan {
  scale: Map<string, number>;
  truncate: boolean;
  label: string;
}
interface TextFit {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  preferred: number;
  scale: number;
  truncated: boolean;
}
interface Placed extends Box {
  el: ElementSpec;
  slot: string;
  text?: TextFit;
  /** Background layer: may bleed past the safe area; content may not overlap it. */
  layer?: "background";
}
interface PanelBox extends Box {
  slot: string;
}
interface Candidate {
  placed: Placed[];
  panels: PanelBox[];
  share: number;
}
interface Context {
  spec: AdSpec;
  s: Surface;
  measure: Measure;
  area: Box;
  gap: number;
  unit: number;
  target: number;
  panelFill: string;
}

/**
 * Size plans in degradation order. Every element at priority p is reduced fully before any
 * element at a higher priority (lower number) is touched. Truncatable secondary text is
 * truncated once its own priority level has been reduced.
 */
export function sizePlans(active: readonly ElementSpec[]): Plan[] {
  const scale = new Map(active.map((e) => [e.id, 1]));
  let truncate = false;
  const plans: Plan[] = [{ scale: new Map(scale), truncate, label: "all text at preferred size" }];
  const levels = [...new Set(active.filter((e) => !isImageRole(e.role)).map((e) => e.priority))].sort(
    (a, b) => b - a,
  );
  for (const p of levels) {
    for (const step of shrinkSteps) {
      for (const e of active) if (e.priority === p && !isImageRole(e.role)) scale.set(e.id, step);
      plans.push({
        scale: new Map(scale),
        truncate,
        label: `priority ${p} text reduced to ${step * 100}%`,
      });
    }
    if (active.some((e) => e.role === "secondary" && e.truncate && e.priority === p)) {
      truncate = true;
      plans.push({ scale: new Map(scale), truncate, label: `priority ${p} secondary text truncated` });
    }
  }
  return plans;
}

function fitText(ctx: Context, plan: Plan, el: ElementSpec, width: number): Placed | null {
  const role = el.role as TextRole;
  const isButton = role === "action";
  const st = styleOf(el);
  const preset = buttonPreset(ctx.spec);
  const preferred = ctx.unit * preferredEm[role] * (isButton ? preset.em : 1) * (st.size ?? 1);
  const fontSize =
    Math.round(Math.max(ctx.s.minTextSize, preferred * (plan.scale.get(el.id) ?? 1)) * 10) / 10;
  const weight = weightOf(el);
  const font = st.font;
  const inner = width - (isButton ? preset.padX / 2 : 0);
  if (inner <= 0) return null;
  let lines = wrap(el.content, inner, fontSize, weight, ctx.measure, {
    hyphenate: role === "primary" || role === "secondary" || role === "supporting",
    font,
  });
  let truncated = false;
  if (role === "secondary" && el.truncate && plan.truncate && (!lines || lines.length > 1)) {
    const line = truncateLine(el.content, inner, fontSize, weight, ctx.measure, font);
    if (!line) return null;
    truncated = line !== el.content.trim();
    lines = [line];
  }
  if (!lines?.length || (isButton && lines.length > 2)) return null;
  const lineHeight = Math.ceil(fontSize * 1.18);
  const widest = Math.max(...lines.map((l) => ctx.measure(l, fontSize, weight, font)));
  return {
    el,
    slot: "",
    x: 0,
    y: 0,
    width: isButton ? Math.min(width, Math.max(ctx.target, Math.ceil(widest) + preset.padX)) : width,
    height: isButton
      ? Math.max(ctx.target, lines.length * lineHeight + preset.padY)
      : lines.length * lineHeight,
    text: {
      lines,
      fontSize,
      lineHeight,
      preferred,
      // Compare against the preferred size at the same 0.1 px rounding used for fontSize.
      scale: Math.min(1, fontSize / (Math.round(preferred * 10) / 10)),
      truncated,
    },
  };
}

const byReading = (a: ElementSpec, b: ElementSpec) =>
  readingOrder.indexOf(a.role) - readingOrder.indexOf(b.role);
const isHead = (e: ElementSpec) => e.role === "branding" || e.role === "primary" || e.role === "supporting";

/** Builds one candidate of the automatic arrangements. Geometry depends only on dimensions and constraints. */
function candidate(
  ctx: Context,
  active: readonly ElementSpec[],
  arrangement: AutoArrangement,
  share: number,
  plan: Plan,
): Placed[] | null {
  // Decoration is placed only by the typographic composition; here it must be omitted.
  if (active.some((e) => e.role === "decoration")) return null;
  const { area, gap } = ctx;
  const out: Placed[] = [];
  const hero = active.find((e) => e.role === "hero");
  const texts = active.filter((e) => !isImageRole(e.role)).sort(byReading);
  const image = (box: Box, slot: string) => hero && out.push({ el: hero, slot, ...box });
  const column = (items: ElementSpec[], box: Box, slot: string, align: "top" | "center" = "center") => {
    const fitted = items.map((el) => fitText(ctx, plan, el, box.width));
    if (fitted.some((f) => !f)) return false;
    const valid = fitted as Placed[];
    const used = valid.reduce((sum, f) => sum + f.height, 0) + gap * Math.max(0, valid.length - 1);
    if (used > box.height) return false;
    let y = box.y + (align === "center" ? (box.height - used) / 2 : 0);
    for (const f of valid) {
      out.push({ ...f, x: box.x, y, slot });
      y += f.height + gap;
    }
    return true;
  };
  const isEnd = (e: ElementSpec) => e.role === "secondary" || e.role === "action";

  if (arrangement === "split") {
    const imageWidth = hero ? (area.width - gap) * share : 0;
    const offset = hero ? imageWidth + gap : 0;
    image({ ...area, width: imageWidth }, `Left column (${Math.round(share * 100)}% of the safe width)`);
    if (!column(texts, { ...area, x: area.x + offset, width: area.width - offset }, "Right text column, vertically centred"))
      return null;
  } else if (arrangement === "strip") {
    const imageWidth = hero ? Math.min(area.height, area.width * 0.23) : 0;
    const start = area.x + (hero ? imageWidth + gap : 0);
    const remaining = area.width - (start - area.x);
    const end = texts.filter(isEnd);
    const endWidth = end.length ? (remaining - gap) * share : 0;
    image({ ...area, width: imageWidth }, "Leading square-ish tile at the start of the strip");
    if (!column(texts.filter((e) => !isEnd(e)), { ...area, x: start, width: remaining - (end.length ? endWidth + gap : 0) }, "Middle message column"))
      return null;
    if (end.length && !column(end, { ...area, x: area.x + area.width - endWidth, width: endWidth }, `Trailing offer column (${Math.round(share * 100)}% of the remaining width)`))
      return null;
  } else if (arrangement === "gallery") {
    if (!hero) return null;
    const top = texts.filter(isHead);
    const fitted = top.map((el) => fitText(ctx, plan, el, area.width));
    if (fitted.some((f) => !f)) return null;
    const topHeight =
      fitted.reduce((sum, f) => sum + f!.height, 0) + gap * Math.max(0, fitted.length - 1);
    if (!column(top, { ...area, height: topHeight }, "Top band across the full safe width", "top")) return null;
    const lower = { ...area, y: area.y + topHeight + gap, height: area.height - topHeight - gap };
    const imageWidth = (area.width - gap) * share;
    image({ ...lower, width: imageWidth }, `Lower-left panel (${Math.round(share * 100)}% of the safe width)`);
    if (!column(texts.filter((e) => !isHead(e)), { ...lower, x: area.x + imageWidth + gap, width: area.width - imageWidth - gap }, "Lower-right offer column"))
      return null;
  } else {
    const fitted = texts.map((el) => fitText(ctx, plan, el, area.width));
    if (fitted.some((f) => !f)) return null;
    const valid = fitted as Placed[];
    const ordered = [...active].sort(byReading);
    const textHeight = valid.reduce((sum, f) => sum + f.height, 0);
    const gaps = gap * (ordered.length - 1);
    const imageHeight = hero ? area.height - textHeight - gaps : 0;
    if (hero && imageHeight < 48) return null;
    const total = textHeight + imageHeight + gaps;
    if (total > area.height) return null;
    let y = area.y + (area.height - total) / 2;
    ordered.forEach((el, i) => {
      const slot = `Row ${i + 1} of ${ordered.length} in the vertical stack`;
      const item =
        el.role === "hero"
          ? { el, slot, x: area.x, y, width: area.width, height: imageHeight }
          : { ...valid.find((f) => f.el.id === el.id)!, x: area.x, y, slot };
      out.push(item);
      y += item.height + gap;
    });
  }
  const tooSmall = out.some((p) =>
    p.el.role === "hero" ? p.width < 48 || p.height < 48 : p.width < 1 || p.height < 1,
  );
  return tooSmall ? null : out;
}

/**
 * Builds one candidate of a composition family. Families reflow by aspect ratio (below,
 * beside, or in columns); they never scale a fixed square design. Background images and
 * panels may reach the surface edges; text always stays in the safe area and never on a photo.
 */
function familyCandidate(
  ctx: Context,
  active: readonly ElementSpec[],
  family: CompositionFamily,
  share: number,
  plan: Plan,
): Candidate | null {
  const { area, gap, s } = ctx;
  const W = s.width;
  const H = s.height;
  const ratio = W / H;
  const right = area.x + area.width;
  const bottom = area.y + area.height;
  const pct = Math.round(share * 100);
  const out: Placed[] = [];
  const panels: PanelBox[] = [];
  const hero = active.find((e) => e.role === "hero");
  const deco = active.find((e) => e.role === "decoration");
  const texts = active.filter((e) => !isImageRole(e.role)).sort(byReading);
  const head = texts.filter(isHead);
  const tail = texts.filter((e) => !isHead(e));
  const fit = (items: ElementSpec[], width: number) => {
    const fitted = items.map((el) => fitText(ctx, plan, el, width));
    return fitted.some((f) => !f) ? null : (fitted as Placed[]);
  };
  /** Places fitted items in a box; returns the height used, or null when they do not fit. */
  const place = (fitted: Placed[], box: Box, slot: string, align: "top" | "center" | "bottom") => {
    const used = fitted.reduce((sum, f) => sum + f.height, 0) + gap * Math.max(0, fitted.length - 1);
    if (used > box.height + 0.01) return null;
    let y = box.y + (align === "center" ? (box.height - used) / 2 : align === "bottom" ? box.height - used : 0);
    for (const f of fitted) {
      out.push({ ...f, x: box.x, y, slot });
      y += f.height + gap;
    }
    return used;
  };
  const column = (items: ElementSpec[], box: Box, slot: string, align: "top" | "center" | "bottom") => {
    if (!items.length) return 0;
    if (box.width <= 0 || box.height <= 0) return null;
    const fitted = fit(items, box.width);
    return fitted ? place(fitted, box, slot, align) : null;
  };
  /** Band surfaces: message column, then an offer/action column. */
  const columns = (box: Box) => {
    if (!tail.length) return column(head, box, "Message column, vertically centred", "center") !== null;
    const tailWidth = (box.width - gap) * 0.36;
    return (
      column(head, { ...box, width: box.width - tailWidth - gap }, "Message column, vertically centred", "center") !== null &&
      column(tail, { ...box, x: box.x + box.width - tailWidth, width: tailWidth }, "Offer and action column", "center") !== null
    );
  };
  const background = (el: ElementSpec, box: Box, slot: string) => out.push({ el, slot, layer: "background", ...box });

  if (family === "product") {
    if (!hero) return null;
    if (ratio >= bandRatio) {
      const imageWidth = Math.min(area.width * share * 0.6, area.height * 2.4);
      const x = right - imageWidth;
      background(hero, { x, y: 0, width: W - x, height: H }, `Product region at the trailing edge (${pct}% image preference), bleeding to the edges`);
      if (!columns({ ...area, width: x - gap - area.x })) return null;
    } else if (ratio >= sideRatio) {
      const x = right - area.width * share;
      background(hero, { x, y: 0, width: W - x, height: H }, `Product region on the right (${pct}% of the safe width), bleeding to the edges`);
      if (column(texts, { ...area, width: x - gap - area.x }, "Copy column beside the product, top-aligned", "top") === null) return null;
    } else {
      const used = column(texts, area, "Copy block across the top", "top");
      if (used === null) return null;
      const y = area.y + used + gap;
      // The product stays dominant: it keeps at least 60% of its preferred share of the height.
      if (H - y < H * share * 0.6) return null;
      background(hero, { x: 0, y, width: W, height: H - y }, "Product region below the copy, bleeding to the bottom and side edges");
    }
  } else if (family === "panel") {
    if (!hero) return null;
    if (ratio >= sideRatio) {
      const panelWidth = Math.round(W * (1 - share));
      panels.push({ x: 0, y: 0, width: panelWidth, height: H, slot: `Solid copy panel on the left (${100 - pct}% of the width)` });
      background(hero, { x: panelWidth, y: 0, width: W - panelWidth, height: H }, "Photo filling the area beside the panel");
      const box = { ...area, width: Math.min(right, panelWidth - gap * 1.5) - area.x };
      if (box.width < 40) return null;
      if (ratio >= bandRatio ? !columns(box) : column(texts, box, "Copy on the panel, vertically centred", "center") === null)
        return null;
    } else {
      const photoHeight = Math.round(H * share);
      background(hero, { x: 0, y: 0, width: W, height: photoHeight }, `Photo across the top (${pct}% of the height)`);
      panels.push({ x: 0, y: photoHeight, width: W, height: H - photoHeight, slot: "Solid copy panel below the photo" });
      const top = Math.max(area.y, photoHeight + gap * 1.5);
      if (column(texts, { ...area, y: top, height: bottom - top }, "Copy on the panel, vertically centred", "center") === null)
        return null;
    }
  } else {
    // Typographic: headline block first; decoration takes leftover space at the trailing edge.
    if (ratio >= bandRatio) {
      let textRight = right;
      if (deco) {
        const x = right - Math.min(area.height * 1.6, area.width * share * 0.5);
        background(deco, { x, y: 0, width: W - x, height: H }, "Decoration at the trailing edge");
        textRight = x - gap;
      }
      if (!columns({ ...area, width: textRight - area.x })) return null;
    } else {
      const used = column(head, area, "Headline block across the top", "top");
      if (used === null) return null;
      const y = area.y + (used ? used + gap : 0);
      const lower = { ...area, y, height: bottom - y };
      if (!deco) {
        if (column(tail, lower, "Closing copy, bottom-aligned", "bottom") === null) return null;
      } else if (ratio >= sideRatio) {
        const tailWidth = area.width * (1 - share);
        if (column(tail, { ...lower, width: tailWidth }, "Lower-left copy column, bottom-aligned", "bottom") === null) return null;
        const x = area.x + tailWidth + gap;
        background(deco, { x, y, width: W - x, height: H - y }, "Decoration in the lower-right, bleeding to the corner");
      } else {
        const tailUsed = column(tail, lower, "Closing copy below the headline", "top");
        if (tailUsed === null) return null;
        const dy = y + (tailUsed ? tailUsed + gap : 0);
        const x = area.x + area.width * (1 - share);
        background(deco, { x, y: dy, width: W - x, height: H - dy }, "Decoration in the lower-right, bleeding to the corner");
      }
    }
  }
  const tooSmall =
    out.some((p) =>
      p.el.role === "hero" ? p.width < 48 || p.height < 48 : p.el.role === "decoration" ? p.width < 64 || p.height < 64 : p.width < 1 || p.height < 1,
    ) || panels.some((p) => p.width < 1 || p.height < 1);
  return tooSmall ? null : { placed: out, panels, share };
}

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width - 0.01 &&
  a.x + a.width > b.x + 0.01 &&
  a.y < b.y + b.height - 0.01 &&
  a.y + a.height > b.y + 0.01;
const inside = (a: Box, b: Box) =>
  a.x >= b.x - 0.01 &&
  a.y >= b.y - 0.01 &&
  a.x + a.width <= b.x + b.width + 0.01 &&
  a.y + a.height <= b.y + b.height + 0.01;
const isBackground = (e: ResolvedElement) => e.kind === "image" && e.layer === "background";

/**
 * Independent check of the resolver's hard guarantees. Content must sit in the safe area and
 * never overlap other content. Background images may reach the surface edges, but content
 * may overlap one only when it sits entirely on a solid panel (whose contrast is checked).
 */
export function geometryErrors(
  elements: readonly ResolvedElement[],
  s: Surface,
  panels: readonly Box[] = [],
): string[] {
  const errors: string[] = [];
  const safe = safeBox(s);
  const target = tapTarget(s);
  const surfaceBox = { x: 0, y: 0, width: s.width, height: s.height };
  for (const p of panels)
    if (!(p.width > 0 && p.height > 0) || !inside(p, surfaceBox)) errors.push("panel: outside the surface");
  for (const [i, a] of elements.entries()) {
    if (![a.x, a.y, a.width, a.height].every(Number.isFinite) || a.width <= 0 || a.height <= 0)
      errors.push(`${a.id}: invalid geometry`);
    if (isBackground(a)) {
      if (!inside(a, surfaceBox)) errors.push(`${a.id}: outside the surface`);
    } else if (
      a.x < safe.x - 0.01 ||
      a.y < safe.y - 0.01 ||
      a.x + a.width > safe.x + safe.width + 0.01 ||
      a.y + a.height > safe.y + safe.height + 0.01
    )
      errors.push(`${a.id}: outside safe area`);
    if (a.kind !== "image" && a.fontSize < s.minTextSize - 0.01)
      errors.push(`${a.id}: below minimum text size`);
    if (a.kind === "button" && (a.width < target || a.height < target))
      errors.push(`${a.id}: below minimum tap target`);
    for (const b of elements.slice(i + 1)) {
      if (!overlaps(a, b)) continue;
      const back = isBackground(a) ? a : isBackground(b) ? b : null;
      const front = back === a ? b : a;
      if (!back || isBackground(front)) errors.push(`${a.id} overlaps ${b.id}`);
      else if (front.kind === "image" || !panels.some((p) => inside(front, p)))
        errors.push(`${front.id} overlaps background ${back.id} without a solid panel`);
    }
  }
  return errors;
}

function finish(ctx: Context, placed: Placed[], arrangement: Arrangement, planLabel: string): ResolvedElement[] {
  const { spec, s } = ctx;
  const target = tapTarget(s);
  const px = (n: number) => Math.round(n);
  return placed.map(({ el, slot, text, layer, ...box }): ResolvedElement => {
    const explanation = [`${slot} of the ${arrangement} arrangement, at (${px(box.x)}, ${px(box.y)}).`];
    if (el.required) explanation.push("Required: never omitted by degradation.");
    if (!text) {
      const deco = el.role === "decoration";
      const fit = el.fit ?? (deco ? "contain" : "cover");
      // Decoration is anchored to the trailing corner; the hero uses the creative's focal point.
      const focalX = deco ? 100 : spec.focal.x;
      const focalY = deco ? 100 : spec.focal.y;
      if (!layer && !deco && fit === "cover")
        explanation.push(
          `${px(box.width)} × ${px(box.height)} px: takes the space left after text is measured, cover-cropped at focal point ${spec.focal.x}% × ${spec.focal.y}%.`,
        );
      else
        explanation.push(
          `${px(box.width)} × ${px(box.height)} px ${layer ? "background layer that may reach the surface edges; content never overlaps it except on a solid panel" : "region"}, ${fit === "contain" ? `shown whole and anchored at ${focalX}% × ${focalY}%` : `cover-cropped at focal point ${focalX}% × ${focalY}%`}.`,
        );
      if (deco) explanation.push("Decorative: optional, kept only when all content fits at its preferred size.");
      return {
        ...box,
        kind: "image",
        id: el.id,
        role: el.role,
        priority: el.priority,
        src: el.content,
        focalX,
        focalY,
        radius: layer ? 0 : 8,
        ...(fit === "contain" ? { fit: "contain" as const } : {}),
        ...(layer ? { layer } : {}),
        explanation,
      };
    }
    const st = styleOf(el);
    if (text.scale < 0.999)
      explanation.push(
        `${text.fontSize} px, ${Math.round(text.scale * 100)}% of its preferred ${Math.round(text.preferred)} px. Priority ${el.priority} text is reduced only after all lower-priority text (active plan: ${planLabel}).`,
      );
    else explanation.push(`${text.fontSize} px, its preferred size.`);
    if (text.fontSize <= s.minTextSize + 0.01)
      explanation.push(`Held at the surface's ${s.minTextSize} px minimum text size.`);
    explanation.push(
      `${text.lines.length} line${text.lines.length > 1 ? "s" : ""}, wrapped by measuring the text against a ${px(box.width - (el.role === "action" ? buttonPreset(spec).padX / 2 : 0))} px width.`,
    );
    if (text.truncated)
      explanation.push("Truncated with an ellipsis: truncatable secondary text gives way before higher-priority content shrinks.");
    const isButton = el.role === "action";
    const radius = isButton
      ? Math.min(spec.button?.radius ?? 8, box.height / 2, box.width / 2)
      : 0;
    if (isButton) {
      explanation.push(
        `${px(box.width)} × ${px(box.height)} px button sized to its label${target ? `, meeting the ${target} px minimum tap target` : " (non-interactive surface: no tap target)"}.`,
      );
      // Default styling (medium, 8 px) keeps the original explanation text unchanged.
      const size = spec.button?.size ?? "medium";
      if (size !== "medium" || radius !== 8)
        explanation.push(`${size[0].toUpperCase()}${size.slice(1)} button preset; ${px(radius)} px corners.`);
    }
    const styled = [
      st.font && st.font !== "sans" ? fontLabels[st.font] : "",
      st.weight ? `weight ${st.weight}` : "",
      st.size !== undefined && st.size !== 1 ? `${st.size}× the preferred size (the minimum and the degradation ladder still apply)` : "",
    ].filter(Boolean);
    if (styled.length) explanation.push(`Style: ${styled.join(", ")}.`);
    return {
      ...box,
      kind: isButton ? "button" : "text",
      id: el.id,
      role: el.role,
      priority: el.priority,
      lines: text.lines,
      fontSize: text.fontSize,
      lineHeight: text.lineHeight,
      fontWeight: weightOf(el),
      ...(st.font && st.font !== "sans" ? { fontFamily: st.font } : {}),
      align: isButton ? "center" : (st.align ?? "left"),
      color: isButton ? buttonTextColor(spec.theme) : (st.color ?? spec.theme.foreground),
      fill: isButton ? spec.theme.accent : undefined,
      radius,
      scale: text.scale,
      truncated: text.truncated,
      explanation,
    };
  });
}

function finishPanels(ctx: Context, panels: PanelBox[], worst: number): ResolvedPanel[] {
  const px = (n: number) => Math.round(n);
  return panels.map(({ slot, ...box }, i) => ({
    ...box,
    kind: "panel",
    id: i ? `panel-${i + 1}` : "panel",
    fill: ctx.panelFill,
    explanation: [
      `${slot}, ${px(box.width)} × ${px(box.height)} px, filled ${ctx.panelFill}.`,
      `Text on it is contrast-checked against this solid fill (${worst.toFixed(2)}:1), never against the photo.`,
    ],
  }));
}

interface Chosen {
  elements: ResolvedElement[];
  panels: ResolvedPanel[];
  arrangement: Arrangement;
  score: number;
  plan: number;
  share: number;
  alternatives: string[];
}
interface Variant {
  arrangement: Arrangement;
  build: (plan: Plan) => Candidate | null;
  score: (m: { kept: number; imageShare: number; truncated: boolean; share: number; hyphenated: number }) => number;
}

/**
 * Walks the size plans in order and stops at the first plan with any valid candidate; scores
 * only compare variants within that plan, so text never shrinks when a layout fits without it.
 */
function search(ctx: Context, active: readonly ElementSpec[], plans: Plan[], variants: Variant[], worst: number): Chosen | null {
  const { s } = ctx;
  const weights = active.filter((e) => !isImageRole(e.role)).reduce((sum, e) => sum + (6 - e.priority), 0);
  let best: Chosen | null = null;
  const bestByArrangement = new Map<Arrangement, number>();
  for (const [planIndex, plan] of plans.entries()) {
    for (const v of variants) {
      const c = v.build(plan);
      if (!c) continue;
      const elements = finish(ctx, c.placed, v.arrangement, plan.label);
      const panels = finishPanels(ctx, c.panels, worst);
      if (completenessErrors(elements, active).length || geometryErrors(elements, s, panels).length) continue;
      const kept = c.placed.reduce((sum, p) => sum + (p.text ? (6 - p.el.priority) * p.text.scale : 0), 0);
      const heroBox = c.placed.find((p) => p.el.role === "hero");
      const imageShare = heroBox ? (heroBox.width * heroBox.height) / (s.width * s.height) : 0;
      const score = v.score({
        kept: weights ? kept / weights : 1,
        imageShare,
        truncated: c.placed.some((p) => p.text?.truncated),
        share: c.share,
        // Lines that end in a word broken by the wrapper.
        hyphenated: c.placed.reduce((n, p) => n + (p.text?.lines.filter((l) => l.endsWith("-")).length ?? 0), 0),
      });
      bestByArrangement.set(v.arrangement, Math.max(bestByArrangement.get(v.arrangement) ?? -Infinity, score));
      if (!best || score > best.score)
        best = { elements, panels, arrangement: v.arrangement, score, plan: planIndex, share: c.share, alternatives: [] };
    }
    if (best) break;
  }
  if (best)
    best.alternatives = [...bestByArrangement]
      .filter(([a]) => a !== best!.arrangement)
      .sort((a, b) => b[1] - a[1])
      .map(([a, sc]) => `${a} ${sc.toFixed(1)}`);
  return best;
}

const familyNames: Record<CompositionFamily, string> = {
  product: "product-led",
  panel: "photo-and-panel",
  type: "typographic",
};
const textRoles: Role[] = ["branding", "primary", "supporting", "secondary", "action"];
/** Roles the automatic arrangements can place (decoration is never placed by them). */
const autoRoles: Role[] = [...textRoles, "hero"];
/** Roles each family can place, and the role it cannot work without. */
const familyRoles: Record<CompositionFamily, { places: Role[]; needs?: Role }> = {
  product: { places: [...textRoles, "hero"], needs: "hero" },
  panel: { places: [...textRoles, "hero"], needs: "hero" },
  type: { places: [...textRoles, "decoration"] },
};

/**
 * Completeness check applied to every candidate alongside geometryErrors: each active element
 * must be placed exactly once, and nothing outside the active set may appear. Elements leave a
 * layout only through the resolver's recorded omission step, never by a candidate skipping them.
 */
export function completenessErrors(
  placed: readonly { id: string }[],
  active: readonly { id: string }[],
): string[] {
  const errors: string[] = [];
  const counts = new Map<string, number>();
  for (const p of placed) counts.set(p.id, (counts.get(p.id) ?? 0) + 1);
  for (const e of active) {
    const n = counts.get(e.id) ?? 0;
    if (n === 0) errors.push(`${e.id}: not placed`);
    else if (n > 1) errors.push(`${e.id}: placed ${n} times`);
  }
  for (const id of counts.keys())
    if (!active.some((e) => e.id === id)) errors.push(`${id}: not in the element set`);
  return errors;
}

/**
 * Resolution, step by step:
 * 1. Validate the spec and surface; stop with "invalid" and reasons.
 * 2. Check text and button contrast on every ground text can sit on (the background, and the
 *    panel for panel compositions); stop with "impossible" if no usable ground passes.
 * 3. For the current set of elements, try the preferred composition family (if any), then the
 *    automatic arrangements, each through the degradation ladder. Keep candidates that pass
 *    geometryErrors. Decoration is kept only at preferred text sizes.
 * 4. If any survive, pick the best score and return it.
 * 5. Otherwise omit the lowest-priority optional element (priority 5 first; later-declared
 *    first on ties) and repeat. If only required elements remain and nothing fits, "impossible".
 */
export function resolve(spec: AdSpec, s: Surface, measure: Measure): ResolvedLayout {
  const errors = [...validateSpec(spec), ...validateSurface(s)];
  const base: ResolvedLayout = {
    status: "invalid",
    width: s?.width ?? 0,
    height: s?.height ?? 0,
    background: spec?.theme?.background ?? "#ffffff",
    elements: [],
    omitted: [],
    decisions: [],
    errors,
    contrast: 0,
  };
  if (errors.length) return base;
  base.contrast = contrast(spec.theme.background, spec.theme.foreground);
  const hasAction = spec.elements.some((e) => e.role === "action");
  const buttonContrast = contrast(spec.theme.accent, buttonTextColor(spec.theme));
  const buttonOk = !hasAction || buttonContrast >= s.minContrast;
  const colors = textColors(spec);
  const worstOn = (ground: string) => Math.min(...colors.map((c) => contrast(ground, c)));
  const family = spec.composition?.family;
  const panelFill = spec.composition?.panel ?? spec.theme.background;
  const backgroundWorst = worstOn(spec.theme.background);
  const panelWorst = family === "panel" ? worstOn(panelFill) : backgroundWorst;
  const fallbackAllowed = buttonOk && backgroundWorst >= s.minContrast;
  const familyAllowed = !!family && buttonOk && panelWorst >= s.minContrast;
  if (!fallbackAllowed && !familyAllowed)
    return {
      ...base,
      status: "impossible",
      errors: [
        `Colors do not meet the ${s.minContrast}:1 contrast requirement (text ${(family === "panel" ? panelWorst : backgroundWorst).toFixed(2)}:1${family === "panel" ? " on the panel" : ""}${hasAction ? `, button ${buttonContrast.toFixed(2)}:1` : ""}). Change the palette or the contrast constraint.`,
      ],
    };

  const area = safeBox(s);
  const shortSide = Math.min(area.width, area.height);
  const ctx: Context = {
    spec,
    s,
    measure,
    area,
    gap: Math.max(8, Math.min(32, shortSide * 0.045)) * (spec.spacing ?? 1),
    // Preferred type comes mainly from width and only caps on very shallow surfaces, so
    // losing height triggers the priority ladder instead of silently scaling all text.
    unit: Math.max(s.minTextSize, Math.min(48, area.width * 0.06, area.height * 0.16)),
    target: tapTarget(s),
    panelFill,
  };
  const dropOrder = spec.elements
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => !e.required)
    .sort((a, b) => b.e.priority - a.e.priority || b.i - a.i)
    .map(({ e }) => e);
  const ratio = s.width / s.height;
  const omitted: OmittedElement[] = [];
  const autoVariants = (active: readonly ElementSpec[]): Variant[] =>
    arrangements.flatMap((arrangement) =>
      shares[arrangement].map((share) => ({
        arrangement,
        build: (plan: Plan) => {
          const placed = candidate(ctx, active, arrangement, share, plan);
          return placed && { placed, panels: [], share };
        },
        score: ({ kept, imageShare, truncated }) =>
          -Math.abs(Math.log(ratio / idealRatio[arrangement])) * 40 +
          kept * 15 +
          imageShare * 10 -
          (truncated ? 20 : 0),
      })),
    );
  const requested = spec.composition?.imageShare ?? 0.5;
  const familyVariants = (active: readonly ElementSpec[], f: CompositionFamily): Variant[] =>
    [...new Set([requested, requested - 0.1, requested + 0.1].map((v) => Math.round(Math.min(0.7, Math.max(0.25, v)) * 100) / 100))].map(
      (share) => ({
        arrangement: f,
        build: (plan: Plan) => familyCandidate(ctx, active, f, share, plan),
        // Within one size plan: prefer unbroken words, then the requested proportion.
        score: ({ kept, imageShare, truncated, share: used, hyphenated }) =>
          kept * 15 + imageShare * 10 - (truncated ? 20 : 0) - Math.abs(used - requested) * 20 - hyphenated * 10,
      }),
    );

  /** Whether any arrangement available for this spec and palette can place a role at all. */
  const canPlace = (role: Role) =>
    (fallbackAllowed && autoRoles.includes(role)) ||
    (!!family && familyAllowed && familyRoles[family].places.includes(role));
  const omissionReasons = new Map<string, string>();

  for (let step = 0; step <= dropOrder.length; step++) {
    const active = spec.elements.filter((e) => !omitted.some((o) => o.id === e.id));
    const plans = sizePlans(active);
    // Decoration never costs content: with it present, only preferred text sizes are tried.
    const hasDecoration = active.some((e) => e.role === "decoration");
    let chosen: Chosen | null = null;
    // Why the preferred family was not used for this element set (reported on fallback).
    let familyReason = "";
    if (family && familyAllowed) {
      const unsupported = active.filter((e) => !familyRoles[family].places.includes(e.role));
      const need = familyRoles[family].needs;
      if (unsupported.length)
        familyReason = `cannot place ${unsupported.map((e) => `${e.id} (${e.role})`).join(", ")}`;
      else if (need && !active.some((e) => e.role === need))
        familyReason = "needs an image, and this creative has none";
      else {
        chosen = search(ctx, active, hasDecoration ? plans.slice(0, 1) : plans, familyVariants(active, family), panelWorst);
        if (!chosen)
          familyReason = hasDecoration
            ? "could not fit these elements with the decoration at preferred text sizes"
            : "could not fit these elements at any allowed text size";
      }
    } else if (family)
      familyReason = `was skipped: its text contrast (${panelWorst.toFixed(2)}:1) is below ${s.minContrast}:1`;
    const usedFamily = !!chosen;
    if (!chosen && fallbackAllowed) chosen = search(ctx, active, plans, autoVariants(active), backgroundWorst);
    if (chosen) {
      const truncated = chosen.elements.some((e) => e.kind !== "image" && e.truncated);
      const first = usedFamily
        ? `${familyNames[family!]} composition (preferred) chosen for a ${ratio.toFixed(2)}:1 surface, with a ${Math.round(chosen.share * 100)}% image share (preferred ${Math.round(requested * 100)}%).`
        : `${chosen.arrangement} arrangement chosen (score ${chosen.score.toFixed(1)}) for a ${ratio.toFixed(2)}:1 surface${chosen.alternatives.length ? `; alternatives: ${chosen.alternatives.join(", ")}` : "; no other arrangement fit"}.`;
      return {
        ...base,
        errors: [],
        status: omitted.length || chosen.plan > 0 ? "adapted" : "ready",
        arrangement: chosen.arrangement,
        elements: chosen.elements,
        ...(chosen.panels.length ? { panels: chosen.panels } : {}),
        omitted: [...omitted],
        decisions: [
          first,
          ...(family && !usedFamily
            ? [`The preferred ${familyNames[family]} composition ${familyReason}, so an automatic arrangement was used.`]
            : []),
          ...(usedFamily && chosen.panels.length
            ? [`Copy sits on a solid panel; text contrast ${panelWorst.toFixed(2)}:1 is checked against the panel, not the photo.`]
            : []),
          ...(usedFamily ? ["Preferred sizes and proportions adapt to this surface's constraints; the layout reflows rather than scaling."] : []),
          chosen.plan > 0
            ? `Degradation applied: ${plans[chosen.plan].label}.`
            : omitted.length
              ? "Remaining elements kept their preferred text size."
              : "Every element kept its preferred text size.",
          ...(truncated ? ["Secondary text truncated with an ellipsis instead of dropping it."] : []),
          ...omitted.map((o) => omissionReasons.get(o.id)!),
          `Safe area ${s.safeArea.top}/${s.safeArea.right}/${s.safeArea.bottom}/${s.safeArea.left} px respected; text at least ${s.minTextSize} px${ctx.target ? `; tap targets at least ${ctx.target} px` : ""}.`,
        ],
      };
    }
    if (step < dropOrder.length) {
      const e = dropOrder[step];
      omitted.push({ id: e.id, role: e.role, priority: e.priority });
      omissionReasons.set(
        e.id,
        !canPlace(e.role)
          ? `${e.id} (${e.role}, priority ${e.priority}) omitted: no arrangement available here can place it${e.role === "decoration" ? " (decoration appears only in the typographic composition)" : ""}.`
          : e.role === "decoration"
            ? `${e.id} (decoration, priority ${e.priority}) omitted: decorative artwork is kept only when all content fits at its preferred size with it.`
            : `${e.id} (${e.role}, priority ${e.priority}) omitted after every shrink and truncation plan failed with it included.`,
      );
    }
  }
  const requiredElements = spec.elements.filter((e) => e.required);
  const unplaceable = requiredElements.filter((e) => !canPlace(e.role));
  const hints = [
    ...new Set(
      unplaceable.map((e) =>
        e.role === "decoration"
          ? "Decoration is placed only by the typographic composition: choose it, or make the decoration optional."
          : e.role === "hero"
            ? "Images are placed by the automatic arrangements and the product-led and photo-and-panel compositions."
            : "",
      ),
    ),
  ].filter(Boolean);
  return {
    ...base,
    status: "impossible",
    omitted,
    errors: [
      unplaceable.length
        ? `Required ${unplaceable.map((e) => e.id).join(", ")} cannot be placed by any arrangement available here. ${hints.join(" ")}`
        : `Required elements (${requiredElements.map((e) => e.id).join(", ")}) cannot fit within these constraints even after all optional elements are omitted. Increase the surface, reduce the safe area or minimum sizes, or shorten the copy.`,
    ],
  };
}
