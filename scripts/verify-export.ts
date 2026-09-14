// Real-browser export check: draws every exportable planner file with the app's export code
// and reads each encoded PNG's width and height from its header. Open /verify-export.html.
// Headless snapshots are taken right after the load event, so the source image is loaded by
// the page and PNGs are encoded synchronously (toDataURL); the app itself uses toBlob.
import { batchExport, planAll } from "../src/engine/catalog/plan";
import { sample } from "../src/engine/creativeModel";
import { renderExportCanvas } from "../src/lib/exporter";
import { measure } from "../src/lib/measure";

const out = document.getElementById("out")!;
const report: Record<string, unknown> = { userAgent: navigator.userAgent, stage: "waiting for load", files: [] };
const show = (done = false) => {
  out.textContent = JSON.stringify(report, null, 1);
  if (done) out.dataset.done = "true";
};

/** PNG width and height live at bytes 16–23 of the IHDR chunk. */
function pngSize(dataUrl: string) {
  const bytes = atob(dataUrl.slice(dataUrl.indexOf(",") + 1, dataUrl.indexOf(",") + 1 + 44));
  const u32 = (at: number) =>
    ((bytes.charCodeAt(at) << 24) | (bytes.charCodeAt(at + 1) << 16) | (bytes.charCodeAt(at + 2) << 8) | bytes.charCodeAt(at + 3)) >>> 0;
  return { signature: bytes.slice(1, 4), width: u32(16), height: u32(20) };
}

async function run() {
  try {
    const img = document.getElementById("source") as HTMLImageElement;
    if (!img.complete || !img.naturalWidth) throw new Error("Source image did not load.");
    const creative = { ...sample, destination: "https://example.com" };
    const image = { width: img.naturalWidth, height: img.naturalHeight };
    report.image = image;
    const { plans } = planAll({ image, creative, goal: "Awareness", measure });
    const batch = batchExport(plans);
    report.skipped = batch.skipped.map((s) => ({ id: s.plan.placement.id, reason: s.reason }));
    const files = report.files as Record<string, unknown>[];
    for (const f of batch.files) {
      report.stage = `rendering ${f.name}`;
      try {
        const url = (await renderExportCanvas(f, img)).toDataURL("image/png");
        const png = pngSize(url);
        files.push({ name: f.name, kind: f.kind, planned: `${f.width}x${f.height}`, encoded: `${png.width}x${png.height}`, png: png.signature === "PNG", bytes: Math.round((url.length * 3) / 4) });
      } catch (e) {
        files.push({ name: f.name, error: String(e) });
      }
    }
    report.stage = "done";
  } catch (e) {
    report.stage = "failed";
    report.error = String(e);
  }
  show(true);
}
show();
if (document.readyState === "complete") void run();
else window.addEventListener("load", () => void run());
