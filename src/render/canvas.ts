// Canvas 2D renderer. Consumes the same ResolvedLayout as the DOM renderer.
import { coverCrop } from "../engine/crop";
import type { ResolvedLayout } from "../engine/layout";
import { fontFamily } from "./dom";

export async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  await img.decode();
  return img;
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
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = layout.background;
  ctx.fillRect(0, 0, layout.width, layout.height);
  for (const e of layout.elements) {
    if (e.kind === "image") {
      const img = images.get(e.id)!;
      const c = coverCrop(img.width, img.height, e.width, e.height, e.focalX, e.focalY);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(e.x, e.y, e.width, e.height, e.radius);
      ctx.clip();
      ctx.drawImage(img, c.x, c.y, c.width, c.height, e.x, e.y, e.width, e.height);
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
    ctx.font = `${e.fontWeight} ${e.fontSize}px ${fontFamily}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = e.align;
    const top = e.y + (e.height - e.lines.length * e.lineHeight) / 2;
    const x = e.align === "center" ? e.x + e.width / 2 : e.x;
    e.lines.forEach((line, i) => ctx.fillText(line, x, top + (i + 0.5) * e.lineHeight));
  }
}
