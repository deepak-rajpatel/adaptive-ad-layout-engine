// Canvas 2D renderer. Consumes the same ResolvedLayout and paint order as the DOM renderer.
import { containFit, coverCrop } from "../engine/crop";
import { fontStack } from "../engine/fonts";
import { paintOrder, type ResolvedLayout } from "../engine/layout";

export async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  await img.decode();
  return img;
}

/** Waits for the fonts a layout uses (installed system stacks resolve immediately). */
async function fontsReady(layout: ResolvedLayout) {
  if (typeof document === "undefined" || !document.fonts) return;
  const stacks = new Set(
    layout.elements.flatMap((e) => (e.kind === "image" ? [] : [`${e.fontWeight} 16px ${fontStack(e.fontFamily)}`])),
  );
  await Promise.all([...stacks].map((f) => document.fonts.load(f).catch(() => [])));
  await document.fonts.ready;
}

export async function renderCanvas(
  canvas: HTMLCanvasElement,
  layout: ResolvedLayout,
  load: (src: string) => Promise<CanvasImageSource & { width: number; height: number }> = loadImage,
) {
  const images = new Map(
    await Promise.all(
      layout.elements.flatMap((e) => (e.kind === "image" ? [load(e.src).then((img) => [e.id, img] as const)] : [])),
    ),
  );
  await fontsReady(layout);
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = layout.background;
  ctx.fillRect(0, 0, layout.width, layout.height);
  for (const e of paintOrder(layout)) {
    if (e.kind === "panel") {
      ctx.fillStyle = e.fill;
      ctx.fillRect(e.x, e.y, e.width, e.height);
      continue;
    }
    if (e.kind === "shape") {
      if (e.shape === "frame") {
        const w = e.stroke!.width;
        ctx.strokeStyle = e.stroke!.color;
        ctx.lineWidth = w;
        ctx.strokeRect(e.x + w / 2, e.y + w / 2, e.width - w, e.height - w);
      } else {
        ctx.fillStyle = e.fill!;
        ctx.beginPath();
        (e.points ?? []).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fill();
      }
      continue;
    }
    if (e.kind === "image") {
      const img = images.get(e.id)!;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(e.x, e.y, e.width, e.height, e.radius);
      ctx.clip();
      if (e.fit === "contain") {
        const r = containFit(img.width, img.height, e.width, e.height, e.focalX, e.focalY);
        ctx.drawImage(img, e.x + r.x, e.y + r.y, r.width, r.height);
      } else {
        const c = coverCrop(img.width, img.height, e.width, e.height, e.focalX, e.focalY);
        ctx.drawImage(img, c.x, c.y, c.width, c.height, e.x, e.y, e.width, e.height);
      }
      if (e.border) {
        // Inside the image edge (the clip keeps it there), matching the DOM inset ring.
        const w = e.border.width;
        ctx.strokeStyle = e.border.color;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.roundRect(e.x + w / 2, e.y + w / 2, e.width - w, e.height - w, Math.max(0, e.radius - w / 2));
        ctx.stroke();
      }
      ctx.restore();
      continue;
    }
    if (e.fill) {
      ctx.fillStyle = e.fill;
      ctx.beginPath();
      ctx.roundRect(e.x, e.y, e.width, e.height, e.radius);
      ctx.fill();
    }
    ctx.fillStyle = e.color;
    ctx.font = `${e.fontWeight} ${e.fontSize}px ${fontStack(e.fontFamily)}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = e.align;
    const top = e.y + (e.height - e.lines.length * e.lineHeight) / 2;
    const x = e.align === "center" ? e.x + e.width / 2 : e.x;
    e.lines.forEach((line, i) => ctx.fillText(line, x, top + (i + 0.5) * e.lineHeight));
  }
}
