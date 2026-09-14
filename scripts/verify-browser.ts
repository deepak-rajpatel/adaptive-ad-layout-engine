// Real-browser verification: resolves every preset with Canvas text metrics, renders it with
// the DOM renderer, and checks rendered text against its box. Open /verify.html (dev server).
import { geometryErrors, resolve } from "../src/engine/resolver";
import { measure } from "../src/lib/measure";
import { sample, toSpec } from "../src/lib/creative";
import { surfaces } from "../src/lib/data";
import { renderDom } from "../src/render/dom";

const spec = toSpec(sample);
const stage = document.getElementById("stage")!;
const rows = surfaces.map((s) => {
  const r = resolve(spec, s, measure);
  const problems = r.status === "ready" || r.status === "adapted" ? geometryErrors(r.elements, s) : [];
  const board = renderDom(r);
  stage.replaceChildren(board);
  // Every rendered line must fit inside its element box (buttons keep 12 px padding per side).
  for (const e of r.elements) {
    if (e.kind === "image") continue;
    const node = board.querySelector<HTMLElement>(`[data-id="${e.id}"]`)!;
    const inner = e.width - (e.kind === "button" ? 24 : 0);
    node.querySelectorAll<HTMLElement>(":scope > div > div").forEach((row) => {
      // Measure the glyphs themselves via an inline span, not the full-width block row.
      const span = document.createElement("span");
      span.textContent = row.textContent;
      row.replaceChildren(span);
      const w = span.getBoundingClientRect().width;
      if (w > inner + 0.5) problems.push(`${e.id}: rendered line "${row.textContent}" is ${w.toFixed(1)}px in a ${inner.toFixed(1)}px box`);
    });
    if (node.scrollHeight > node.clientHeight + 1) problems.push(`${e.id}: text taller than its box`);
  }
  return {
    id: s.id,
    size: `${s.width}x${s.height}`,
    category: s.category,
    status: r.status,
    arrangement: r.arrangement ?? null,
    omitted: r.omitted.map((o) => o.id),
    truncated: r.elements.filter((e) => e.kind !== "image" && e.truncated).map((e) => e.id),
    minFont: Math.min(...r.elements.flatMap((e) => (e.kind === "image" ? [] : [e.fontSize]))),
    problems,
  };
});
stage.replaceChildren();
const out = document.getElementById("out")!;
out.textContent = JSON.stringify({ userAgent: navigator.userAgent, rows }, null, 1);
out.dataset.done = "true";
