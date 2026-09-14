import type {
  Arrangement,
  Box,
  Creative,
  ElementId,
  Measure,
  ResolvedElement,
  Resolution,
  Surface,
} from "./types";

export const ids: ElementId[] = ["brand", "headline", "image", "price", "cta"];
export const weightFor = (id: ElementId) =>
  id === "headline" || id === "price" ? 700 : 600;
export function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function validateCreative(value: unknown): string[] {
  if (!value || typeof value !== "object")
    return ["Creative must be an object."];
  const c = value as Creative;
  const errors: string[] = [];
  for (const key of ["brand", "headline", "price", "cta", "image"] as const)
    if (
      typeof c[key] !== "string" ||
      !c[key].trim() ||
      c[key].length > (key === "image" ? 3000000 : 300)
    )
      errors.push(
        `Provide ${key} (maximum ${key === "image" ? "3 MB" : "300 characters"}).`,
      );
  for (const key of ["background", "foreground", "accent"] as const)
    if (!/^#[\da-f]{6}$/i.test(c[key]))
      errors.push(`${key} must be a six-digit hex color.`);
  for (const key of ["focalX", "focalY"] as const)
    if (!Number.isFinite(c[key]) || c[key] < 0 || c[key] > 100)
      errors.push(`${key} must be between 0 and 100.`);
  if (
    typeof c.image === "string" &&
    !/^(\/[^/]|https:\/\/|data:image\/(png|jpeg|webp);base64,)/.test(c.image)
  )
    errors.push(
      "Use a local asset, HTTPS image, or embedded PNG, JPEG, or WebP.",
    );
  for (const id of ids)
    if (
      !Number.isFinite(c.priorities?.[id]) ||
      c.priorities[id] < 1 ||
      c.priorities[id] > 100
    )
      errors.push(`${id} priority must be 1–100.`);
  return errors;
}
export function validateSurface(s: Surface): string[] {
  if (!s || typeof s !== "object") return ["Surface must be an object."];
  const errors: string[] = [];
  if (typeof s.id !== "string" || !/^[a-z\d_-]{1,100}$/i.test(s.id))
    errors.push(
      "Surface ID must contain 1–100 letters, digits, dashes, or underscores.",
    );
  if (typeof s.name !== "string" || !s.name.trim() || s.name.length > 100)
    errors.push("Surface name must contain 1–100 characters.");
  for (const key of ["category", "note", "source"] as const)
    if (
      s[key] !== undefined &&
      (typeof s[key] !== "string" || s[key]!.length > 1000)
    )
      errors.push(`Invalid surface ${key}.`);
  for (const key of ["width", "height"] as const)
    if (!Number.isFinite(s[key]) || s[key] < 32 || s[key] > 2400)
      errors.push(`${key} must be 32–2400 px.`);
  if (!Number.isFinite(s.safe) || s.safe < 0 || s.safe > 400)
    errors.push("Safe area must be 0–400 px.");
  if (!Number.isFinite(s.minFont) || s.minFont < 10 || s.minFont > 96)
    errors.push("Minimum font must be 10–96 px.");
  if (!Number.isFinite(s.minTarget) || s.minTarget < 24 || s.minTarget > 120)
    errors.push("Minimum target must be 24–120 px.");
  if (
    !Number.isFinite(s.minContrast) ||
    s.minContrast < 1 ||
    s.minContrast > 21
  )
    errors.push("Contrast must be 1–21.");
  return errors;
}
export function wrap(
  text: string,
  width: number,
  size: number,
  weight: number,
  measure: Measure,
): string[] | null {
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/u)) {
    if (measure(word, size, weight) > width) return null;
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next, size, weight) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// Candidate geometry is generated from dimensions alone, never from surface IDs or names.
function candidate(
  c: Creative,
  s: Surface,
  active: ElementId[],
  arrangement: Arrangement,
  scale: number,
  measure: Measure,
  share: number,
): ResolvedElement[] | null {
  const area: Box = {
    x: s.safe,
    y: s.safe,
    width: s.width - 2 * s.safe,
    height: s.height - 2 * s.safe,
  };
  if (area.width <= 0 || area.height <= 0) return null;
  const gap = Math.max(
    8,
    Math.min(24, Math.min(area.width, area.height) * 0.045),
  );
  const unit = Math.max(
    s.minFont,
    Math.min(28, Math.min(area.width, area.height) * 0.06),
  );
  const sizes = {
    brand: Math.max(s.minFont, unit * 0.78 * scale),
    headline: Math.max(s.minFont, unit * 2.2 * scale),
    price: Math.max(s.minFont, unit * 1.3 * scale),
    cta: Math.max(s.minFont, unit * 0.85 * scale),
    image: 0,
  };
  const text = (id: ElementId, width: number): ResolvedElement | null => {
    const padding = id === "cta" ? 24 : 0;
    const fontSize = Math.round(sizes[id] * 10) / 10;
    const lines = wrap(
      c[id],
      width - padding,
      fontSize,
      weightFor(id),
      measure,
    );
    if (!lines || !lines.length || (id === "cta" && lines.length > 2))
      return null;
    const lineHeight = Math.ceil(fontSize * 1.18);
    return {
      id,
      x: 0,
      y: 0,
      width,
      height: Math.max(
        id === "cta" ? s.minTarget : 0,
        lines.length * lineHeight + (id === "cta" ? 20 : 0),
      ),
      fontSize,
      lineHeight,
      lines,
    };
  };
  const image = (box: Box): ResolvedElement => ({
    ...box,
    id: "image",
    fontSize: 0,
    lines: [],
    lineHeight: 0,
  });
  const hasImage = active.includes("image");
  const result: ResolvedElement[] = [];
  const textIds = active.filter((id) => id !== "image");
  const column = (
    keys: ElementId[],
    box: Box,
    align: "top" | "center" = "center",
  ) => {
    const items = keys.map((id) => text(id, box.width));
    if (items.some((v) => !v)) return false;
    const valid = items as ResolvedElement[];
    const used =
      valid.reduce((sum, item) => sum + item.height, 0) +
      gap * Math.max(0, valid.length - 1);
    if (used > box.height) return false;
    let y = box.y + (align === "center" ? (box.height - used) / 2 : 0);
    for (const item of valid) {
      result.push({ ...item, x: box.x, y });
      y += item.height + gap;
    }
    return true;
  };
  if (arrangement === "split") {
    const imageWidth = hasImage ? (area.width - gap) * share : 0;
    const textArea = {
      ...area,
      x: area.x + (hasImage ? imageWidth + gap : 0),
      width: area.width - (hasImage ? imageWidth + gap : 0),
    };
    if (hasImage) result.push(image({ ...area, width: imageWidth }));
    if (!column(textIds, textArea)) return null;
  } else if (arrangement === "strip") {
    const imageWidth = hasImage ? Math.min(area.height, area.width * 0.23) : 0;
    const start = area.x + (hasImage ? imageWidth + gap : 0);
    const remaining = area.width - (start - area.x);
    const endIds = textIds.filter((id) => id === "price" || id === "cta");
    const startIds = textIds.filter((id) => id !== "price" && id !== "cta");
    const endWidth = endIds.length ? (remaining - gap) * share : 0;
    if (hasImage) result.push(image({ ...area, width: imageWidth }));
    if (
      !column(startIds, {
        ...area,
        x: start,
        width: remaining - (endIds.length ? endWidth + gap : 0),
      })
    )
      return null;
    if (
      endIds.length &&
      !column(endIds, {
        ...area,
        x: area.x + area.width - endWidth,
        width: endWidth,
      })
    )
      return null;
  } else if (arrangement === "gallery" && hasImage) {
    const topIds = textIds.filter((id) => id === "brand" || id === "headline");
    const topItems = topIds.map((id) => text(id, area.width));
    if (topItems.some((v) => !v)) return null;
    const topHeight =
      topItems.reduce((sum, item) => sum + item!.height, 0) +
      gap * Math.max(0, topItems.length - 1);
    if (!column(topIds, { ...area, height: topHeight }, "top")) return null;
    const lower = {
      ...area,
      y: area.y + topHeight + gap,
      height: area.height - topHeight - gap,
    };
    const iw = (area.width - gap) * share;
    result.push(image({ ...lower, width: iw }));
    if (
      !column(
        textIds.filter((id) => id !== "brand" && id !== "headline"),
        { ...lower, x: area.x + iw + gap, width: area.width - iw - gap },
      )
    )
      return null;
  } else {
    const items = textIds.map((id) => text(id, area.width));
    if (items.some((v) => !v)) return null;
    const valid = items as ResolvedElement[];
    const textHeight = valid.reduce((sum, item) => sum + item.height, 0);
    const imageHeight = hasImage
      ? area.height - textHeight - gap * (active.length - 1)
      : 0;
    if (hasImage && imageHeight < 48) return null;
    const total = textHeight + imageHeight + gap * (active.length - 1);
    if (total > area.height) return null;
    let y = area.y + (area.height - total) / 2;
    for (const id of active) {
      const item =
        id === "image"
          ? image({ x: area.x, y, width: area.width, height: imageHeight })
          : { ...valid.find((v) => v.id === id)!, x: area.x, y };
      result.push(item);
      y += item.height + gap;
    }
  }
  if (
    result.some(
      (e) =>
        e.width < (e.id === "image" ? 48 : e.id === "cta" ? s.minTarget : 1) ||
        e.height < (e.id === "image" ? 48 : 1),
    )
  )
    return null;
  return result;
}
export function geometryErrors(
  elements: ResolvedElement[],
  s: Surface,
): string[] {
  const errors: string[] = [];
  for (const a of elements) {
    if (
      ![a.x, a.y, a.width, a.height].every(Number.isFinite) ||
      a.width <= 0 ||
      a.height <= 0
    )
      errors.push(`${a.id}: invalid geometry`);
    if (
      a.x < s.safe - 0.01 ||
      a.y < s.safe - 0.01 ||
      a.x + a.width > s.width - s.safe + 0.01 ||
      a.y + a.height > s.height - s.safe + 0.01
    )
      errors.push(`${a.id}: outside safe area`);
    if (a.id !== "image" && a.fontSize < s.minFont)
      errors.push(`${a.id}: below minimum font`);
    if (a.id === "cta" && (a.width < s.minTarget || a.height < s.minTarget))
      errors.push("CTA: below minimum target");
    for (const b of elements)
      if (
        ids.indexOf(a.id) < ids.indexOf(b.id) &&
        a.x < b.x + b.width - 0.01 &&
        a.x + a.width > b.x + 0.01 &&
        a.y < b.y + b.height - 0.01 &&
        a.y + a.height > b.y + 0.01
      )
        errors.push(`${a.id} overlaps ${b.id}`);
  }
  return errors;
}
export function resolve(c: Creative, s: Surface, measure: Measure): Resolution {
  const errors = [...validateCreative(c), ...validateSurface(s)];
  const base: Resolution = {
    status: "invalid",
    elements: [],
    omitted: [],
    decisions: [],
    errors,
    contrast: 0,
    buttonText: "#ffffff",
  };
  if (errors.length) return base;
  base.contrast = contrast(c.background, c.foreground);
  base.buttonText =
    contrast(c.accent, "#ffffff") >= contrast(c.accent, "#111111")
      ? "#ffffff"
      : "#111111";
  if (
    base.contrast < s.minContrast ||
    contrast(c.accent, base.buttonText) < s.minContrast
  )
    return {
      ...base,
      status: "impossible",
      errors: [
        "Colors do not meet the required contrast. Change the palette or contrast constraint.",
      ],
    };
  const optional = ids
    .filter((id) => id !== "headline" && id !== "cta")
    .sort(
      (a, b) =>
        c.priorities[a] - c.priorities[b] || ids.indexOf(a) - ids.indexOf(b),
    );
  const omitted: ElementId[] = [];
  for (let step = 0; step <= optional.length; step++) {
    const active = ids.filter((id) => !omitted.includes(id));
    const candidates: {
      elements: ResolvedElement[];
      arrangement: Arrangement;
      score: number;
      scale: number;
    }[] = [];
    const ratio = s.width / s.height;
    const ideals: Record<Arrangement, number> = {
      stack: 0.56,
      gallery: 1,
      split: 1.8,
      strip: 5.8,
    };
    for (const arrangement of [
      "stack",
      "gallery",
      "split",
      "strip",
    ] as Arrangement[]) {
      const shares =
        arrangement === "strip"
          ? [0.3, 0.4, 0.25]
          : arrangement === "gallery"
            ? [0.57, 0.45, 0.68]
            : arrangement === "split"
              ? [0.47, 0.35, 0.58]
              : [0.5];
      for (const scale of [1, 0.85, 0.7, 0.55])
        for (const share of shares) {
          const elements = candidate(
            c,
            s,
            active,
            arrangement,
            scale,
            measure,
            share,
          );
          if (!elements || geometryErrors(elements, s).length) continue;
          const score =
            -Math.abs(Math.log(ratio / ideals[arrangement])) * 40 + scale * 15;
          candidates.push({ elements, arrangement, score, scale });
        }
    }
    candidates.sort((a, b) => b.score - a.score);
    if (candidates.length) {
      const best = candidates[0];
      return {
        ...base,
        errors: [],
        status: omitted.length || best.scale < 1 ? "adapted" : "ready",
        elements: best.elements,
        arrangement: best.arrangement,
        omitted: [...omitted],
        decisions: [
          `${best.arrangement} arrangement selected from dimension-based candidates.`,
          `Text measured and wrapped at actual font sizes; ${s.safe}px safe area preserved.`,
          ...(best.scale < 1
            ? [
                `Typography reduced to ${Math.round(best.scale * 100)}% of preferred size, respecting the ${s.minFont}px minimum.`,
              ]
            : []),
          ...omitted.map(
            (id) =>
              `${id} omitted (priority ${c.priorities[id]}) after every full-content candidate failed.`,
          ),
          `Headline and CTA are mandatory. CTA target is at least ${s.minTarget}px.`,
        ],
      };
    }
    if (step < optional.length) omitted.push(optional[step]);
  }
  return {
    ...base,
    status: "impossible",
    omitted,
    errors: [
      "The mandatory headline and CTA cannot fit within these constraints. Increase the surface, reduce safe area, or shorten the copy.",
    ],
  };
}
