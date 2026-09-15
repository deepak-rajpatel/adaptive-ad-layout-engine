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
import { containFit } from "./crop";
import { fontLabels } from "./fonts";
import { truncateLine, wrap, type Measure } from "./text";
import type {
  Arrangement,
  Box,
  OmittedElement,
  ResolvedElement,
  ResolvedLayout,
  ResolvedPanel,
  ResolvedShape,
} from "./layout";

type TextRole = Exclude<Role, "hero" | "decoration" | "logo">;
type AutoArrangement = "stack" | "gallery" | "split" | "strip";
export const isImageRole = (role: Role) => role === "hero" || role === "decoration";
/** Elements laid out in the copy flow: text, button and logo (not images, decoration or the badge). */
const isFlow = (e: ElementSpec) => e.role !== "hero" && e.role !== "decoration" && e.role !== "badge";
/** Visual reading order inside every arrangement. */
const readingOrder: Role[] = ["logo", "branding", "primary", "supporting", "hero", "secondary", "action", "decoration", "badge"];
/** Preferred text size as a multiple of the surface's base unit. */
const preferredEm: Record<TextRole, number> = {
  branding: 0.78,
  primary: 2.2,
  supporting: 0.95,
  secondary: 1.3,
  action: 0.85,
  badge: 1,
};
/**
 * Composition default: supporting copy is set smaller so it stays subordinate to the headline
 * and the offer. Automatic arrangements keep `preferredEm.supporting`.
 */
const compositionSupportingEm = 0.8;
/** Preferred logo height as a multiple of the base unit (the width follows its aspect ratio). */
const logoEm = 1.25;
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
 * How a family reflows: below the copy (tall), beside it (square and landscape) or in columns
 * (wide bands). Between 2.2:1 and 3.5:1 both side and band are tried and the score decides,
 * so an in-between size is not forced into a squeezed band.
 */
type FamilyMode = "below" | "side" | "band";
const familyModes = (ratio: number): FamilyMode[] =>
  ratio >= 3.5 ? ["band"] : ratio >= bandRatio ? ["band", "side"] : ratio >= sideRatio ? ["side"] : ["below"];
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
/** The badge label colour: its style colour, else whichever of white / near-black reads on the fill. */
export const badgeTextColor = (spec: AdSpec) => {
  const badge = spec.elements.find((e) => e.role === "badge");
  return (badge && styleOf(badge).color) ?? textOn(spec.badge?.fill ?? "#ffffff");
};
/** Every text colour that must be readable on a ground (buttons and the badge are checked on their fills). */
const textColors = (spec: AdSpec) => {
  const texts = spec.elements.filter((e) => e.type === "text" && e.role !== "badge");
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
  /** Composition typography applied (measure fitting or balanced breaks), for the explanation. */
  note?: string;
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

/**
 * Measures and wraps one text element. With `typeset` (composition families only), two design
 * defaults apply: a headline may take up to 20% off its preferred size so it breaks into at
 * most three lines without split words (that size becomes its preferred size in this column,
 * not a degradation step), and headline and supporting lines are balanced to similar lengths.
 */
function fitText(ctx: Context, plan: Plan, el: ElementSpec, width: number, typeset = false): Placed | null {
  const role = el.role as TextRole;
  const isButton = role === "action";
  const st = styleOf(el);
  const preset = buttonPreset(ctx.spec);
  const em = typeset && role === "supporting" ? compositionSupportingEm : preferredEm[role];
  const base = ctx.unit * em * (isButton ? preset.em : 1) * (st.size ?? 1);
  const weight = weightOf(el);
  const font = st.font;
  const inner = width - (isButton ? preset.padX / 2 : 0);
  if (inner <= 0) return null;
  const hyphenate = role === "primary" || role === "secondary" || role === "supporting";
  let preferred = base;
  let fontSize = 0;
  let lines: string[] | null = null;
  let factor = 1;
  for (const f of typeset && role === "primary" ? [1, 0.9, 0.8] : [1]) {
    preferred = base * f;
    fontSize = Math.round(Math.max(ctx.s.minTextSize, preferred * (plan.scale.get(el.id) ?? 1)) * 10) / 10;
    lines = wrap(el.content, inner, fontSize, weight, ctx.measure, { hyphenate, font });
    factor = f;
    if (lines && lines.length <= 3 && !lines.some((l) => l.endsWith("-"))) break;
  }
  const notes: string[] = [];
  if (factor < 1)
    notes.push(`Composition typography: set at ${Math.round(factor * 100)}% of its style size so it breaks into ${lines?.length} lines without splitting words in this column.`);
  if (typeset && (role === "primary" || role === "supporting") && lines && lines.length > 1) {
    // Balanced breaks: the narrowest measure that keeps the same number of lines.
    const count = lines.length;
    let lo = inner * 0.5;
    let hi = inner;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      const trial = wrap(el.content, mid, fontSize, weight, ctx.measure, { hyphenate: false, font });
      if (trial && trial.length === count) hi = mid;
      else lo = mid;
    }
    const balanced = wrap(el.content, hi, fontSize, weight, ctx.measure, { hyphenate: false, font });
    if (balanced && balanced.length === count && balanced.join(" ") !== lines.join(" ").replace(/-$/, "")) {
      lines = balanced;
      notes.push("Line breaks balanced to similar lengths.");
    } else if (balanced && balanced.length === count) lines = balanced;
  }
  let truncated = false;
  if (role === "secondary" && el.truncate && plan.truncate && (!lines || lines.length > 1)) {
    const line = truncateLine(el.content, inner, fontSize, weight, ctx.measure, font);
    if (!line) return null;
    // For specs with a composition (the family and its automatic fallback), truncation never
    // hides a price or other figure: the ladder continues, and if nothing fits the offer is
    // omitted explicitly by priority. Specs without a composition keep the original ladder.
    const kept = line.replace(/…$/, "").trimEnd();
    if ((typeset || !!ctx.spec.composition) && /[\d$€£¥%]/.test(el.content.trim().replace(/\s+/g, " ").slice(kept.length))) return null;
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
      ...(notes.length ? { note: notes.join(" ") } : {}),
    },
  };
}

/**
 * A logo keeps its proportions: its height follows the base unit and the priority ladder (like
 * text), is never below the surface's minimum text size, and shrinks to fit the column width.
 */
function fitLogo(ctx: Context, plan: Plan, item: ElementSpec, width: number): Placed | null {
  const aspect = (item as { aspect?: number }).aspect ?? 1;
  let height = Math.max(ctx.s.minTextSize, ctx.unit * logoEm * (plan.scale.get(item.id) ?? 1));
  let w = height * aspect;
  if (w > width) {
    w = width;
    height = w / aspect;
  }
  if (height < ctx.s.minTextSize - 0.01 || w < 1) return null;
  return { el: item, slot: "", x: 0, y: 0, width: Math.round(w * 10) / 10, height: Math.round(height * 10) / 10 };
}
/** Fits any copy-flow item: text, button or logo. */
function fitItem(ctx: Context, plan: Plan, item: ElementSpec, width: number, typeset = false): Placed | null {
  return item.role === "logo" ? fitLogo(ctx, plan, item, width) : fitText(ctx, plan, item, width, typeset);
}

const byReading = (a: ElementSpec, b: ElementSpec) =>
  readingOrder.indexOf(a.role) - readingOrder.indexOf(b.role);
const isHead = (e: ElementSpec) =>
  e.role === "logo" || e.role === "branding" || e.role === "primary" || e.role === "supporting";

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
  const texts = active.filter(isFlow).sort(byReading);
  const image = (box: Box, slot: string) => hero && out.push({ el: hero, slot, ...box });
  const column = (items: ElementSpec[], box: Box, slot: string, align: "top" | "center" = "center") => {
    const fitted = items.map((el) => fitItem(ctx, plan, el, box.width));
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
    const fitted = top.map((el) => fitItem(ctx, plan, el, area.width));
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
    const fitted = texts.map((el) => fitItem(ctx, plan, el, area.width));
    if (fitted.some((f) => !f)) return null;
    const valid = fitted as Placed[];
    const ordered = [...active].filter((e) => e.role !== "badge").sort(byReading);
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
  mode: FamilyMode,
): Candidate | null {
  const { area, gap, s } = ctx;
  const W = s.width;
  const H = s.height;
  const right = area.x + area.width;
  const bottom = area.y + area.height;
  const pct = Math.round(share * 100);
  const out: Placed[] = [];
  const panels: PanelBox[] = [];
  const hero = active.find((e) => e.role === "hero");
  const deco = active.find((e) => e.role === "decoration");
  const texts = active.filter(isFlow).sort(byReading);
  const head = texts.filter(isHead);
  const tail = texts.filter((e) => !isHead(e));
  const fit = (items: ElementSpec[], width: number, p: Plan = plan) => {
    const fitted = items.map((el) => fitItem(ctx, p, el, width, true));
    return fitted.some((f) => !f) ? null : (fitted as Placed[]);
  };
  /**
   * Vertical rhythm (composition default): the supporting line sits close under the headline,
   * and the button gets extra room above it; everything else uses the standard gap.
   */
  const gapBefore = (prev: Placed | undefined, next: Placed) =>
    !prev ? 0 : next.el.role === "action" ? gap * 1.5 : prev.el.role === "primary" && next.el.role === "supporting" ? gap * 0.5 : gap;
  /** Places fitted items in a box; returns the height used, or null when they do not fit. */
  const place = (fitted: Placed[], box: Box, slot: string, align: "top" | "center" | "bottom") => {
    const used = fitted.reduce((sum, f, i) => sum + f.height + gapBefore(fitted[i - 1], f), 0);
    if (used > box.height + 0.01) return null;
    let y = box.y + (align === "center" ? (box.height - used) / 2 : align === "bottom" ? box.height - used : 0);
    fitted.forEach((f, i) => {
      y += gapBefore(fitted[i - 1], f);
      out.push({ ...f, x: box.x, y, slot });
      y += f.height;
    });
    return used;
  };
  const column = (items: ElementSpec[], box: Box, slot: string, align: "top" | "center" | "bottom") => {
    if (!items.length) return 0;
    if (box.width <= 0 || box.height <= 0) return null;
    // Truncation is a permission, not an instruction: wrapped copy is tried first, so an offer
    // is only cut to one line when wrapping cannot fit this column.
    for (const p of plan.truncate ? [{ ...plan, truncate: false }, plan] : [plan]) {
      const fitted = fit(items, box.width, p);
      if (!fitted) continue;
      const used = place(fitted, box, slot, align);
      if (used !== null) return used;
    }
    return null;
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
    if (mode === "band") {
      const imageWidth = Math.min(area.width * share * 0.6, area.height * 2.4);
      const x = right - imageWidth;
      background(hero, { x, y: 0, width: W - x, height: H }, `Product region at the trailing edge (${pct}% image preference), bleeding to the edges`);
      if (!columns({ ...area, width: x - gap - area.x })) return null;
    } else if (mode === "side") {
      const x = right - area.width * share;
      background(hero, { x, y: 0, width: W - x, height: H }, `Product region on the right (${pct}% of the safe width), bleeding to the edges`);
      // Centred against the product so square and landscape layouts stay balanced.
      if (column(texts, { ...area, width: x - gap - area.x }, "Copy column beside the product, vertically centred", "center") === null) return null;
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
    if (mode !== "below") {
      const panelWidth = Math.round(W * (1 - share));
      panels.push({ x: 0, y: 0, width: panelWidth, height: H, slot: `Solid copy panel on the left (${100 - pct}% of the width)` });
      background(hero, { x: panelWidth, y: 0, width: W - panelWidth, height: H }, "Photo filling the area beside the panel");
      const box = { ...area, width: Math.min(right, panelWidth - gap * 1.5) - area.x };
      if (box.width < 40) return null;
      if (mode === "band" ? !columns(box) : column(texts, box, "Copy on the panel, vertically centred", "center") === null)
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
    if (mode === "band") {
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
      } else if (mode === "side") {
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
/** The badge is an intentional overlay: it may overlap the hero image or decoration only. */
const isOverlay = (a: ResolvedElement, b: ResolvedElement) =>
  (a.role === "badge" && (b.role === "hero" || b.role === "decoration")) ||
  (b.role === "badge" && (a.role === "hero" || a.role === "decoration"));

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
      if (!overlaps(a, b) || isOverlay(a, b)) continue;
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
      const logo = el.role === "logo";
      const fit = el.fit ?? (deco || logo ? "contain" : "cover");
      // Decoration is anchored to the trailing corner; the hero uses the creative's focal point.
      const focalX = deco ? 100 : logo ? 50 : spec.focal.x;
      const focalY = deco ? 100 : logo ? 50 : spec.focal.y;
      const style = el.role === "hero" ? spec.imageStyle : undefined;
      if (logo)
        explanation.push(
          `${px(box.width)} × ${px(box.height)} px logo with its proportions kept; its height follows the base unit and the priority ladder and never drops below the ${s.minTextSize} px minimum.`,
        );
      else if (!layer && !deco && fit === "cover")
        explanation.push(
          `${px(box.width)} × ${px(box.height)} px: takes the space left after text is measured, cover-cropped at focal point ${spec.focal.x}% × ${spec.focal.y}%.`,
        );
      else
        explanation.push(
          `${px(box.width)} × ${px(box.height)} px ${layer ? "background layer that may reach the surface edges; content never overlaps it except on a solid panel" : "region"}, ${fit === "contain" ? `shown whole and anchored at ${focalX}% × ${focalY}%` : `cover-cropped at focal point ${focalX}% × ${focalY}%`}.`,
        );
      if (deco) explanation.push("Decorative: optional, kept only when all content fits at its preferred size.");
      const radius =
        style?.mask === "circle"
          ? box.width / 2
          : style?.mask === "rect"
            ? 0
            : style?.mask === "rounded"
              ? Math.min(style.radius ?? 24, box.width / 2, box.height / 2)
              : layer || logo ? 0 : 8;
      if (style?.mask)
        explanation.push(
          style.mask === "circle"
            ? "Circular mask: the image box is kept square inside the safe area, so it stays a circle on every aspect ratio."
            : `${style.mask === "rect" ? "Rectangular" : `Rounded (${px(radius)} px)`} mask.`,
        );
      const border = style?.border && style.border.width > 0 ? style.border : undefined;
      if (border) explanation.push(`${border.width} px ${border.color} border drawn inside the image edge.`);
      return {
        ...box,
        kind: "image",
        id: el.id,
        role: el.role,
        priority: el.priority,
        src: el.content,
        focalX,
        focalY,
        radius,
        ...(fit === "contain" ? { fit: "contain" as const } : {}),
        ...(layer ? { layer } : {}),
        ...(border ? { border: { color: border.color, width: border.width } } : {}),
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
    if (text.note) explanation.push(text.note);
    if (text.truncated)
      explanation.push("Truncated with an ellipsis: truncatable secondary text gives way before higher-priority content shrinks.");
    const isButton = el.role === "action";
    const isBadge = el.role === "badge";
    const radius = isButton
      ? Math.min(spec.button?.radius ?? 8, box.height / 2, box.width / 2)
      : isBadge
        ? Math.min(box.width, box.height) / 2
        : 0;
    if (isBadge)
      explanation.push(
        `${spec.badge?.shape === "circle" ? "Circular" : "Pill"} badge ${px(box.width)} × ${px(box.height)} px, sized to its measured label plus padding, on its own ${spec.badge?.fill} fill (label contrast ${contrast(spec.badge?.fill ?? "#ffffff", badgeTextColor(spec)).toFixed(2)}:1). It may overlap the image, never text or the button.`,
      );
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
      align: isButton || isBadge ? "center" : (st.align ?? "left"),
      color: isButton ? buttonTextColor(spec.theme) : isBadge ? badgeTextColor(spec) : (st.color ?? spec.theme.foreground),
      fill: isButton ? spec.theme.accent : isBadge ? spec.badge?.fill : undefined,
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

const intersect = (a: Box, b: Box): Box | null => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
};

/** The badge may overlap at most this share of the image's rendered rectangle. */
const badgeCoverageLimit = 0.2;
/** Badge size steps tried before the candidate is rejected (never below the minimum text size). */
const badgeSizeSteps = [1, 0.9, 0.8];

/**
 * Places the badge, never over text, the button or the logo, and never overlapping more than
 * a fifth of the image's rendered rectangle: the drawn rectangle of a whole-image fit with
 * known proportions, otherwise the image box. This is geometric overlap, not detection of the
 * visible product silhouette. At each size step every allowed placement is tried (hugging the
 * rendered image's upper corners, then corners of the image and of the safe area). If none
 * qualifies at any readable size, the candidate is rejected, so the resolver tries other
 * candidates and size plans, then omits an optional badge by priority; a required badge
 * leaves the result impossible rather than breaking the limit.
 */
function placeBadge(ctx: Context, plan: Plan, badge: ElementSpec, placed: Placed[]): Placed | null {
  const { area, gap, spec, s } = ctx;
  const hero = placed.find((p) => p.el.role === "hero");
  const aspect = hero ? (hero.el as { aspect?: number }).aspect : undefined;
  const product = !!(hero && aspect && hero.el.fit === "contain");
  let rendered: Box | null = hero ? { x: hero.x, y: hero.y, width: hero.width, height: hero.height } : null;
  if (product && hero) {
    const r = containFit(aspect! * 1000, 1000, hero.width, hero.height, spec.focal.x, spec.focal.y);
    rendered = { x: hero.x + r.x, y: hero.y + r.y, width: r.width, height: r.height };
  }
  const surfaceBox = { x: 0, y: 0, width: s.width, height: s.height };
  if (rendered) rendered = intersect(rendered, surfaceBox);
  const anchor = rendered ? intersect(rendered, area) : null;
  const coverage = (b: Box) => {
    const i = rendered && intersect(b, rendered);
    return i && rendered ? (i.width * i.height) / (rendered.width * rendered.height) : 0;
  };
  const allowed = (b: Box) =>
    inside(b, area) &&
    !placed.some((p) => p.el.role !== "hero" && p.el.role !== "decoration" && overlaps(b, p)) &&
    coverage(b) <= badgeCoverageLimit + 1e-9;
  const clampToArea = (b: Box) => ({
    ...b,
    x: Math.min(Math.max(b.x, area.x), area.x + area.width - b.width),
    y: Math.min(Math.max(b.y, area.y), area.y + area.height - b.height),
  });
  const corners = [
    [1, 0, "top-right"],
    [0, 0, "top-left"],
    [1, 1, "bottom-right"],
    [0, 1, "bottom-left"],
  ] as const;
  let previousSize = Infinity;
  for (const step of badgeSizeSteps) {
    const scale = new Map(plan.scale).set(badge.id, (plan.scale.get(badge.id) ?? 1) * step);
    const fitted = fitText(ctx, { ...plan, scale }, badge, area.width * 0.45);
    if (!fitted?.text) return null;
    const t = fitted.text;
    // Already at the surface minimum: a smaller step would not change the badge.
    if (t.fontSize >= previousSize) break;
    previousSize = t.fontSize;
    const font = styleOf(badge).font;
    const widest = Math.max(...t.lines.map((l) => ctx.measure(l, t.fontSize, weightOf(badge), font)));
    const textHeight = t.lines.length * t.lineHeight;
    const pad = Math.round(t.fontSize * 0.6);
    let width = Math.ceil(widest + pad * 2);
    let height = Math.ceil(textHeight + pad);
    if (spec.badge?.shape === "circle") width = height = Math.ceil(Math.hypot(widest, textHeight) + pad);
    const options: { box: Box; slot: string }[] = [];
    if (product && anchor)
      // Sticker placements: overlapping the rendered image's upper edge by decreasing amounts.
      for (const into of [0.7, 0.45, 0.2])
        for (const [ax, , corner] of corners.slice(0, 2))
          options.push({
            slot: `Badge overlapping the image's ${corner} edge`,
            box: clampToArea({
              x: ax ? anchor.x + anchor.width - width * into : anchor.x - width * (1 - into),
              y: anchor.y - height * (1 - into),
              width,
              height,
            }),
          });
    const regions: [Box, string][] = anchor ? [[anchor, "image"], [area, "safe area"]] : [[area, "safe area"]];
    for (const [region, name] of regions)
      for (const [ax, ay, corner] of corners)
        options.push({
          slot: `Badge at the ${corner} corner of the ${name}`,
          box: {
            x: ax ? region.x + region.width - width - gap * 0.5 : region.x + gap * 0.5,
            y: ay ? region.y + region.height - height - gap * 0.5 : region.y + gap * 0.5,
            width,
            height,
          },
        });
    const pick = options.find((o) => allowed(o.box));
    if (pick) {
      const covered = Math.round(coverage(pick.box) * 100);
      const notes = [
        `Covers ${covered}% of the image's rendered rectangle (limit ${badgeCoverageLimit * 100}%; measured as rectangle overlap, not the visible product outline).`,
        ...(step < 1 ? [`Set at ${Math.round(step * 100)}% of its size so a placement within the limit exists.`] : []),
        ...(t.note ? [t.note] : []),
      ];
      return { ...fitted, ...pick.box, slot: pick.slot, text: { ...t, note: notes.join(" ") } };
    }
  }
  return null;
}

/**
 * Per-candidate finishing that applies to every arrangement: a circular mask squares the hero
 * inside the safe area (so it stays a circle), then the badge is placed. Returns null when a
 * required step cannot be satisfied, so the candidate is rejected rather than losing content.
 */
function decorate(ctx: Context, active: readonly ElementSpec[], plan: Plan, c: Candidate): Candidate | null {
  let placed = c.placed;
  if (ctx.spec.imageStyle?.mask === "circle") {
    const squared: Placed[] = [];
    for (const p of placed) {
      if (p.el.role !== "hero") {
        squared.push(p);
        continue;
      }
      const r = intersect(p, ctx.area);
      const d = r ? Math.min(r.width, r.height) : 0;
      if (!r || d < 48) return null;
      squared.push({
        el: p.el,
        slot: `${p.slot}; circular mask, kept square inside the safe area`,
        x: r.x + (r.width - d) / 2,
        y: r.y + (r.height - d) / 2,
        width: d,
        height: d,
      });
    }
    placed = squared;
  }
  const badge = active.find((e) => e.role === "badge");
  if (badge) {
    const b = placeBadge(ctx, plan, badge, placed);
    if (!b) return null;
    placed = [...placed, b];
  }
  return placed === c.placed ? c : { ...c, placed };
}

/** Separating-axis test: does a convex polygon overlap a box (touching edges do not count)? */
export function polygonHitsBox(points: readonly [number, number][], b: Box): boolean {
  const rect: [number, number][] = [
    [b.x, b.y],
    [b.x + b.width, b.y],
    [b.x + b.width, b.y + b.height],
    [b.x, b.y + b.height],
  ];
  const axes: [number, number][] = [
    [1, 0],
    [0, 1],
  ];
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    axes.push([y2 - y1, x1 - x2]);
  }
  for (const [ax, ay] of axes) {
    const len = Math.hypot(ax, ay);
    if (!len) continue;
    const project = (ps: [number, number][]) => ps.map(([x, y]) => (x * ax + y * ay) / len);
    const p = project([...points]);
    const r = project(rect);
    if (Math.max(...p) <= Math.min(...r) + 0.01 || Math.max(...r) <= Math.min(...p) + 0.01) return false;
  }
  return true;
}

/**
 * Resolves the background graphic after layout, relative to the image region (block and
 * diagonal) or the safe-area margin (frame). Graphics are decorative: when one would sit
 * behind text on this surface (tested against the exact polygon, not its bounding box), it
 * is dropped with a reason instead of rejecting the layout.
 */
function resolveGraphic(ctx: Context, elements: ResolvedElement[]): { shapes: ResolvedShape[]; note?: string } {
  const g = ctx.spec.graphic;
  if (!g) return { shapes: [] };
  const { s } = ctx;
  const W = s.width;
  const H = s.height;
  const px = (n: number) => Math.round(n);
  if (g.kind === "frame") {
    const margin = Math.min(s.safeArea.top, s.safeArea.right, s.safeArea.bottom, s.safeArea.left);
    if (margin < 8)
      return { shapes: [], note: `Background frame skipped: the ${margin} px safe-area margin is too narrow to hold a frame outside the content.` };
    const inset = Math.round(margin * 0.4);
    const width = Math.max(2, Math.min(10, Math.round(margin * 0.2)));
    return {
      shapes: [
        {
          kind: "shape",
          id: "frame",
          shape: "frame",
          layer: "over",
          x: inset,
          y: inset,
          width: W - inset * 2,
          height: H - inset * 2,
          stroke: { color: g.color, width },
          explanation: [`${width} px frame ${inset} px inside the edge, in the safe-area margin: content never touches it.`],
        },
      ],
      note: "Background frame drawn in the safe-area margin, outside all content.",
    };
  }
  const hero = elements.find((e) => e.role === "hero");
  if (!hero)
    return { shapes: [], note: `Background ${g.kind} skipped: it is anchored to the image region, and this layout has no image.` };
  const pad = hero.kind === "image" && hero.layer === "background" ? 0 : ctx.gap * 0.5;
  const x0 = Math.max(0, hero.x - pad);
  const y0 = Math.max(0, hero.y - pad);
  const x1 = Math.min(W, hero.x + hero.width + pad);
  const y1 = Math.min(H, hero.y + hero.height + pad);
  const w = x1 - x0;
  const h = y1 - y0;
  let points: [number, number][] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  if (g.kind === "diagonal") {
    // Slant the edge that faces the middle of the surface (towards the copy).
    if (w >= W * 0.9) {
      const d = h * 0.3;
      points = (y0 + y1) / 2 > H / 2 ? [[x0, y0 + d], [x1, y0], [x1, y1], [x0, y1]] : [[x0, y0], [x1, y0], [x1, y1 - d], [x0, y1]];
    } else {
      const d = w * 0.3;
      points = (x0 + x1) / 2 > W / 2 ? [[x0 + d, y0], [x1, y0], [x1, y1], [x0, y1]] : [[x0, y0], [x1, y0], [x1 - d, y1], [x0, y1]];
    }
  }
  const blocked = elements.find(
    (e) => (e.kind !== "image" || e.role === "logo") && e.role !== "badge" && polygonHitsBox(points, e),
  );
  if (blocked)
    return {
      shapes: [],
      note: `Background ${g.kind} skipped: on this surface it would sit behind ${blocked.id}, and text is only placed on a verified solid backing.`,
    };
  return {
    shapes: [
      {
        kind: "shape",
        id: g.kind,
        shape: "polygon",
        layer: "under",
        points,
        x: x0,
        y: y0,
        width: w,
        height: h,
        fill: g.color,
        explanation: [
          `${g.kind === "block" ? "Solid block" : "Diagonal division"} ${px(w)} × ${px(h)} px behind the image region; no text overlaps it (checked against the exact shape, not its bounding box).`,
        ],
      },
    ],
    note: `Background ${g.kind} placed behind the image region; no text overlaps it.`,
  };
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
  score: (m: {
    kept: number;
    imageShare: number;
    truncated: boolean;
    share: number;
    hyphenated: number;
    headlineLines: number;
    orphan: boolean;
  }) => number;
}

const headlineOf = (c: Candidate) => c.placed.find((p) => p.el.role === "primary")?.text?.lines;

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
      const built = v.build(plan);
      const c = built && decorate(ctx, active, plan, built);
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
        headlineLines: headlineOf(c)?.length ?? 0,
        // A last headline line holding a single word.
        orphan: (() => {
          const l = headlineOf(c);
          return !!l && l.length > 1 && !l[l.length - 1].includes(" ");
        })(),
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
// Logo and badge are placed in every arrangement (the logo in the copy flow, the badge afterwards).
const textRoles: Role[] = ["branding", "primary", "supporting", "secondary", "action", "logo", "badge"];
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

  if (spec.elements.some((e) => e.role === "badge")) {
    const badgeContrast = contrast(spec.badge!.fill, badgeTextColor(spec));
    if (badgeContrast < s.minContrast)
      return {
        ...base,
        status: "impossible",
        errors: [
          `Badge label does not meet the ${s.minContrast}:1 contrast requirement on its fill (${badgeContrast.toFixed(2)}:1). Change the badge colors.`,
        ],
      };
  }

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
    familyModes(ratio).flatMap((mode) =>
    [...new Set([requested, requested - 0.1, requested + 0.1].map((v) => Math.round(Math.min(0.7, Math.max(0.25, v)) * 100) / 100))].map(
      (share) => ({
        arrangement: f,
        build: (plan: Plan) => familyCandidate(ctx, active, f, share, plan, mode),
        // Within one size plan: prefer unbroken words, then the requested proportion.
        // Within one size plan: prefer unfragmented headlines and unbroken words, then the
        // requested proportion.
        score: ({ kept, imageShare, truncated, share: used, hyphenated, headlineLines, orphan }) =>
          kept * 15 +
          imageShare * 10 -
          (truncated ? 20 : 0) -
          Math.abs(used - requested) * 20 -
          hyphenated * 10 -
          Math.max(0, headlineLines - 2) * 3 -
          (orphan ? 4 : 0),
      }),
    ),
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
      const graphic = resolveGraphic(ctx, chosen.elements);
      const truncated =chosen.elements.some((e) => e.kind !== "image" && e.truncated);
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
        ...(graphic.shapes.length ? { shapes: graphic.shapes } : {}),
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
          ...(graphic.note ? [graphic.note] : []),
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
            : e.role === "badge"
              ? `${e.id} (badge, priority ${e.priority}) omitted after every candidate, size plan and badge size failed with it included: it may not cover copy, the button or the logo, or overlap more than a fifth of the image's rendered rectangle.`
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
