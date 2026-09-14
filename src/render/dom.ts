// Framework-free DOM renderer. Consumes a ResolvedLayout; makes no layout decisions.
import type { ResolvedElement, ResolvedLayout } from "../engine/layout";

export const fontFamily = "Arial, sans-serif";
const px = (n: number) => `${n}px`;

export function elementStyle(e: ResolvedElement): Partial<CSSStyleDeclaration> {
  const box = {
    position: "absolute",
    left: px(e.x),
    top: px(e.y),
    width: px(e.width),
    height: px(e.height),
    borderRadius: px(e.radius),
    overflow: "hidden",
  };
  if (e.kind === "image") return box;
  return {
    ...box,
    display: "flex",
    alignItems: "center",
    textAlign: e.align,
    fontFamily,
    fontSize: px(e.fontSize),
    fontWeight: String(e.fontWeight),
    lineHeight: px(e.lineHeight),
    color: e.color,
    background: e.fill ?? "transparent",
  };
}

export interface DomOptions {
  guides?: boolean;
  safeArea?: { top: number; right: number; bottom: number; left: number };
  onImageError?: () => void;
  doc?: Document;
}

/** Builds the artboard at native surface size; the caller decides how to scale or mount it. */
export function renderDom(layout: ResolvedLayout, options: DomOptions = {}): HTMLElement {
  const doc = options.doc ?? document;
  const board = doc.createElement("div");
  board.className = "ad-artboard";
  Object.assign(board.style, {
    position: "relative",
    width: px(layout.width),
    height: px(layout.height),
    background: layout.background,
    overflow: "hidden",
  });
  for (const e of layout.elements) {
    const node = doc.createElement("div");
    node.className = `ad-element ad-${e.kind} ad-${e.id}${options.guides ? " outlined" : ""}`;
    node.dataset.id = e.id;
    Object.assign(node.style, elementStyle(e));
    if (e.kind === "image") {
      const img = doc.createElement("img");
      img.src = e.src;
      img.alt = "";
      img.decoding = "async";
      Object.assign(img.style, {
        width: "100%",
        height: "100%",
        objectFit: "cover",
        objectPosition: `${e.focalX}% ${e.focalY}%`,
        display: "block",
      });
      if (options.onImageError) img.addEventListener("error", options.onImageError);
      node.append(img);
    } else {
      const text = doc.createElement("div");
      text.style.width = "100%";
      for (const line of e.lines) {
        const row = doc.createElement("div");
        row.style.whiteSpace = "pre";
        row.textContent = line;
        text.append(row);
      }
      node.append(text);
    }
    board.append(node);
  }
  if (options.guides && options.safeArea) {
    const guide = doc.createElement("div");
    guide.className = "safe-guide";
    const a = options.safeArea;
    Object.assign(guide.style, { top: px(a.top), right: px(a.right), bottom: px(a.bottom), left: px(a.left) });
    board.append(guide);
  }
  return board;
}
