// Browser PNG rendering for planner exports. Layout and crop decisions come from the plan.
import type { ExportFile } from "../engine/catalog/plan";
import { loadImage, renderCanvas } from "../render/canvas";

/** Draws one export file with an already-decoded source image. */
export async function renderExportCanvas(
  file: ExportFile,
  image: HTMLImageElement,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  if (file.kind === "composed-creative") {
    await renderCanvas(canvas, file.plan.layout!, () => Promise.resolve(image));
  } else {
    // Image asset: the planned source crop, drawn at the file's size.
    const c = file.plan.crop!;
    canvas.width = file.width;
    canvas.height = file.height;
    canvas.getContext("2d")!.drawImage(image, c.x, c.y, c.width, c.height, 0, 0, file.width, file.height);
  }
  return canvas;
}

export async function renderExport(file: ExportFile, imageSrc: string): Promise<Blob> {
  const canvas = await renderExportCanvas(file, await loadImage(imageSrc));
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/png"));
  if (!blob) throw new Error("PNG encoding failed.");
  return blob;
}
