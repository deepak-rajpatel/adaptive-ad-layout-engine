// Constraint resolver: (AdSpec, Surface, Measure) -> ResolvedLayout. Pure TypeScript, no DOM.
import {
  validateSpec,
  type AdSpec,
  type AdTheme,
  type ButtonSize,
  type ElementSpec,
  type Role,
} from "./spec";
import { safeBox, tapTarget, validateSurface, type Surface } from "./surfaces";
import { contrast, textOn } from "./contrast";
import { truncateLine, wrap, type Measure } from "./text";
import type {
  Arrangement,
  Box,
  OmittedElement,
  ResolvedElement,
  ResolvedLayout,
} from "./layout";

type TextRole = Exclude<Role, "hero">;
/** Visual reading order inside every arrangement. */
const readingOrder: Role[] = ["branding", "primary", "hero", "secondary", "action"];
/** Preferred text size as a multiple of the surface's base unit. */
const preferredEm: Record<TextRole, number> = {
  branding: 0.78,
  primary: 2.2,
  secondary: 1.3,
  action: 0.85,
};
export const fontWeightFor = (role: Role): 600 | 700 =>
  role === "primary" || role === "secondary" ? 700 : 600;
const arrangements: Arrangement[] = ["stack", "gallery", "split", "strip"];
/** Width/height ratio each arrangement is designed for. */
const idealRatio: Record<Arrangement, number> = {
  stack: 0.56,
  gallery: 1,
  split: 1.8,
  strip: 5.8,
};
/** Candidate width allocations for the image or offer column. */
const shares: Record<Arrangement, number[]> = {
  stack: [0.5],
  gallery: [0.57, 0.45, 0.68],
  split: [0.47, 0.35, 0.58],
  strip: [0.3, 0.4, 0.25],
};
const shrinkSteps = [0.8, 0.62];
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
}
interface Context {
  spec: AdSpec;
  s: Surface;
  measure: Measure;
  area: Box;
  gap: number;
  unit: number;
  target: number;
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
  const levels = [...new Set(active.filter((e) => e.role !== "hero").map((e) => e.priority))].sort(
    (a, b) => b - a,
  );
  for (const p of levels) {
    for (const step of shrinkSteps) {
      for (const e of active) if (e.priority === p && e.role !== "hero") scale.set(e.id, step);
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
  const preset = buttonPreset(ctx.spec);
  const preferred = ctx.unit * preferredEm[role] * (isButton ? preset.em : 1);
  const fontSize =
    Math.round(Math.max(ctx.s.minTextSize, preferred * (plan.scale.get(el.id) ?? 1)) * 10) / 10;
  const weight = fontWeightFor(role);
  const inner = width - (isButton ? preset.padX / 2 : 0);
  if (inner <= 0) return null;
  let lines = wrap(el.content, inner, fontSize, weight, ctx.measure, {
    hyphenate: role === "primary" || role === "secondary",
  });
  let truncated = false;
  if (role === "secondary" && el.truncate && plan.truncate && (!lines || lines.length > 1)) {
    const line = truncateLine(el.content, inner, fontSize, weight, ctx.measure);
    if (!line) return null;
    truncated = line !== el.content.trim();
    lines = [line];
  }
  if (!lines?.length || (isButton && lines.length > 2)) return null;
  const lineHeight = Math.ceil(fontSize * 1.18);
  const widest = Math.max(...lines.map((l) => ctx.measure(l, fontSize, weight)));
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

/** Builds one candidate layout. Geometry depends only on dimensions and constraints. */
function candidate(
  ctx: Context,
  active: readonly ElementSpec[],
  arrangement: Arrangement,
  share: number,
  plan: Plan,
): Placed[] | null {
  const { area, gap } = ctx;
  const out: Placed[] = [];
  const hero = active.find((e) => e.role === "hero");
  const texts = active.filter((e) => e.role !== "hero").sort(byReading);
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
    const top = texts.filter((e) => e.role === "branding" || e.role === "primary");
    const fitted = top.map((el) => fitText(ctx, plan, el, area.width));
    if (fitted.some((f) => !f)) return null;
    const topHeight =
      fitted.reduce((sum, f) => sum + f!.height, 0) + gap * Math.max(0, fitted.length - 1);
    if (!column(top, { ...area, height: topHeight }, "Top band across the full safe width", "top")) return null;
    const lower = { ...area, y: area.y + topHeight + gap, height: area.height - topHeight - gap };
    const imageWidth = (area.width - gap) * share;
    image({ ...lower, width: imageWidth }, `Lower-left panel (${Math.round(share * 100)}% of the safe width)`);
    if (!column(texts.filter((e) => e.role !== "branding" && e.role !== "primary"), { ...lower, x: area.x + imageWidth + gap, width: area.width - imageWidth - gap }, "Lower-right offer column"))
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

/** Independent check of the resolver's hard guarantees. */
export function geometryErrors(elements: readonly ResolvedElement[], s: Surface): string[] {
  const errors: string[] = [];
  const safe = safeBox(s);
  const target = tapTarget(s);
  for (const [i, a] of elements.entries()) {
    if (![a.x, a.y, a.width, a.height].every(Number.isFinite) || a.width <= 0 || a.height <= 0)
      errors.push(`${a.id}: invalid geometry`);
    if (
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
    for (const b of elements.slice(i + 1))
      if (
        a.x < b.x + b.width - 0.01 &&
        a.x + a.width > b.x + 0.01 &&
        a.y < b.y + b.height - 0.01 &&
        a.y + a.height > b.y + 0.01
      )
        errors.push(`${a.id} overlaps ${b.id}`);
  }
  return errors;
}

function finish(ctx: Context, placed: Placed[], arrangement: Arrangement, planLabel: string): ResolvedElement[] {
  const { spec, s } = ctx;
  const target = tapTarget(s);
  const px = (n: number) => Math.round(n);
  return placed.map(({ el, slot, text, ...box }): ResolvedElement => {
    const explanation = [`${slot} of the ${arrangement} arrangement, at (${px(box.x)}, ${px(box.y)}).`];
    if (el.required) explanation.push("Required: never omitted by degradation.");
    if (!text) {
      explanation.push(
        `${px(box.width)} × ${px(box.height)} px: takes the space left after text is measured, cover-cropped at focal point ${spec.focal.x}% × ${spec.focal.y}%.`,
      );
      return { ...box, kind: "image", id: el.id, role: el.role, priority: el.priority, src: el.content, focalX: spec.focal.x, focalY: spec.focal.y, radius: 8, explanation };
    }
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
    return {
      ...box,
      kind: isButton ? "button" : "text",
      id: el.id,
      role: el.role,
      priority: el.priority,
      lines: text.lines,
      fontSize: text.fontSize,
      lineHeight: text.lineHeight,
      fontWeight: fontWeightFor(el.role),
      align: isButton ? "center" : "left",
      color: isButton ? buttonTextColor(spec.theme) : spec.theme.foreground,
      fill: isButton ? spec.theme.accent : undefined,
      radius,
      scale: text.scale,
      truncated: text.truncated,
      explanation,
    };
  });
}

/**
 * Resolution, step by step:
 * 1. Validate the spec and surface; stop with "invalid" and reasons.
 * 2. Check text and button contrast; stop with "impossible" if the palette fails.
 * 3. For the current set of elements, try every size plan (degradation ladder) in every
 *    arrangement and width allocation. Keep candidates that pass geometryErrors.
 * 4. If any survive, pick the best score (aspect-ratio fit, preserved text size weighted by
 *    priority, image area, truncation penalty) and return it.
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
  if (base.contrast < s.minContrast || (hasAction && buttonContrast < s.minContrast))
    return {
      ...base,
      status: "impossible",
      errors: [
        `Colors do not meet the ${s.minContrast}:1 contrast requirement (text ${base.contrast.toFixed(2)}:1${hasAction ? `, button ${buttonContrast.toFixed(2)}:1` : ""}). Change the palette or the contrast constraint.`,
      ],
    };

  const area = safeBox(s);
  const shortSide = Math.min(area.width, area.height);
  const ctx: Context = {
    spec,
    s,
    measure,
    area,
    gap: Math.max(8, Math.min(32, shortSide * 0.045)),
    // Preferred type comes mainly from width and only caps on very shallow surfaces, so
    // losing height triggers the priority ladder instead of silently scaling all text.
    unit: Math.max(s.minTextSize, Math.min(48, area.width * 0.06, area.height * 0.16)),
    target: tapTarget(s),
  };
  const dropOrder = spec.elements
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => !e.required)
    .sort((a, b) => b.e.priority - a.e.priority || b.i - a.i)
    .map(({ e }) => e);
  const ratio = s.width / s.height;
  const omitted: OmittedElement[] = [];

  for (let step = 0; step <= dropOrder.length; step++) {
    const active = spec.elements.filter((e) => !omitted.some((o) => o.id === e.id));
    const plans = sizePlans(active);
    const weights = active.filter((e) => e.role !== "hero").reduce((sum, e) => sum + (6 - e.priority), 0);
    let best: { placed: Placed[]; arrangement: Arrangement; score: number; plan: number } | null = null;
    const bestByArrangement = new Map<Arrangement, number>();
    // Stages are strictly ordered: scores only compare arrangements within the first
    // stage that has any valid candidate, so text never shrinks when a layout fits without it.
    for (const [planIndex, plan] of plans.entries()) {
      for (const arrangement of arrangements)
        for (const share of shares[arrangement]) {
          const placed = candidate(ctx, active, arrangement, share, plan);
          if (!placed) continue;
          const elements = finish(ctx, placed, arrangement, plan.label);
          if (geometryErrors(elements, s).length) continue;
          const kept = placed.reduce((sum, p) => sum + (p.text ? (6 - p.el.priority) * p.text.scale : 0), 0);
          const heroBox = placed.find((p) => p.el.role === "hero");
          const imageShare = heroBox ? (heroBox.width * heroBox.height) / (s.width * s.height) : 0;
          const score =
            -Math.abs(Math.log(ratio / idealRatio[arrangement])) * 40 +
            (weights ? kept / weights : 1) * 15 +
            imageShare * 10 -
            (placed.some((p) => p.text?.truncated) ? 20 : 0);
          bestByArrangement.set(arrangement, Math.max(bestByArrangement.get(arrangement) ?? -Infinity, score));
          if (!best || score > best.score) best = { placed, arrangement, score, plan: planIndex };
        }
      if (best) break;
    }
    if (best) {
      const chosen = best as { placed: Placed[]; arrangement: Arrangement; score: number; plan: number };
      const elements = finish(ctx, chosen.placed, chosen.arrangement, plans[chosen.plan].label);
      const alternatives = [...bestByArrangement]
        .filter(([a]) => a !== chosen.arrangement)
        .sort((a, b) => b[1] - a[1])
        .map(([a, sc]) => `${a} ${sc.toFixed(1)}`);
      const truncated = elements.some((e) => e.kind !== "image" && e.truncated);
      return {
        ...base,
        errors: [],
        status: omitted.length || chosen.plan > 0 ? "adapted" : "ready",
        arrangement: chosen.arrangement,
        elements,
        omitted: [...omitted],
        decisions: [
          `${chosen.arrangement} arrangement chosen (score ${chosen.score.toFixed(1)}) for a ${ratio.toFixed(2)}:1 surface${alternatives.length ? `; alternatives: ${alternatives.join(", ")}` : "; no other arrangement fit"}.`,
          chosen.plan > 0
            ? `Degradation applied: ${plans[chosen.plan].label}.`
            : omitted.length
              ? "Remaining elements kept their preferred text size."
              : "Every element kept its preferred text size.",
          ...(truncated ? ["Secondary text truncated with an ellipsis instead of dropping it."] : []),
          ...omitted.map(
            (o) => `${o.id} (${o.role}, priority ${o.priority}) omitted after every shrink and truncation plan failed with it included.`,
          ),
          `Safe area ${s.safeArea.top}/${s.safeArea.right}/${s.safeArea.bottom}/${s.safeArea.left} px respected; text at least ${s.minTextSize} px${ctx.target ? `; tap targets at least ${ctx.target} px` : ""}.`,
        ],
      };
    }
    if (step < dropOrder.length) {
      const e = dropOrder[step];
      omitted.push({ id: e.id, role: e.role, priority: e.priority });
    }
  }
  const required = spec.elements.filter((e) => e.required).map((e) => e.id);
  return {
    ...base,
    status: "impossible",
    omitted,
    errors: [
      `Required elements (${required.join(", ")}) cannot fit within these constraints even after all optional elements are omitted. Increase the surface, reduce the safe area or minimum sizes, or shorten the copy.`,
    ],
  };
}
