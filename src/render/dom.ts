// Framework-free DOM renderer. Consumes a ResolvedLayout; makes no layout decisions.
import { fontStack, fontStacks } from "../engine/fonts";
import { paintOrder, type ResolvedElement, type ResolvedLayout, type ResolvedPanel } from "../engine/layout";

/** The original font stack (sans). */
export const fontFamily = fontStacks.sans;
const px = (n: number) => `${n}px`;

export function elementStyle(e: ResolvedElement | ResolvedPanel): Partial<CSSStyleDeclaration> {
  const box = {
    position: "absolute",
    left: px(e.x),
    top: px(e.y),
    width: px(e.width),
    height: px(e.height),
    borderRadius: px(e.kind === "panel" ? 0 : e.radius),
    overflow: "hidden",
  };
  if (e.kind === "panel") return { ...box, background: e.fill };
  if (e.kind === "image") return box;
  return {
    ...box,
    display: "flex",
    alignItems: "center",
    textAlign: e.align,
    fontFamily: fontStack(e.fontFamily),
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
  // Same explicit layer order as the Canvas renderer: background images, panels, content.
  for (const e of paintOrder(layout)) {
    const node = doc.createElement("div");
    node.className = `ad-element ad-${e.kind} ad-${e.id}${options.guides && e.kind !== "panel" ? " outlined" : ""}`;
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
        objectFit: e.fit ?? "cover",
        objectPosition: `${e.focalX}% ${e.focalY}%`,
        display: "block",
      });
      if (options.onImageError) img.addEventListener("error", options.onImageError);
      node.append(img);
    } else if (e.kind !== "panel") {
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
