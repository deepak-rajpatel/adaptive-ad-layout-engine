import { useEffect, useRef, useState } from "react";
import type { ResolvedLayout } from "../engine/layout";
import type { Surface } from "../engine/surfaces";
import { renderDom } from "../render/dom";
import { renderCanvas } from "../render/canvas";

/** Hosts a renderer and zooms the native-size artboard to fit. React makes no layout decisions. */
export function Preview({
  surface: s,
  result: r,
  renderer = "dom",
  guides = false,
  maxHeight = 450,
}: {
  surface: Surface;
  result: ResolvedLayout;
  renderer?: "dom" | "canvas";
  guides?: boolean;
  maxHeight?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(400);
  const [imageError, setImageError] = useState(false);
  const valid = r.status === "ready" || r.status === "adapted";
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setImageError(false);
    if (!valid) return;
    if (renderer === "dom") {
      board.current?.replaceChildren(
        renderDom(r, {
          guides,
          safeArea: s.safeArea,
          onImageError: () => setImageError(true),
        }),
      );
      return;
    }
    let cancelled = false;
    const buffer = document.createElement("canvas");
    renderCanvas(buffer, r)
      .then(() => {
        if (cancelled || !canvas.current) return;
        canvas.current.width = r.width;
        canvas.current.height = r.height;
        canvas.current.getContext("2d")!.drawImage(buffer, 0, 0);
      })
      .catch(() => {
        if (!cancelled) setImageError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [r, renderer, guides, s.safeArea, valid]);
  const scale = Math.min(
    width / Math.max(32, s.width),
    maxHeight / Math.max(32, s.height),
    1,
  );
  const copy = r.elements.flatMap((e) =>
    e.kind === "image" ? [] : [e.lines.join(" ")],
  );
  return (
    <div className="preview-host" ref={host}>
      {!valid ? (
        <div className="impossible">
          <span>↔</span>
          <strong>
            {r.status === "invalid"
              ? "Check your inputs"
              : "This surface needs more room"}
          </strong>
          <p>{r.errors.join(" ")}</p>
        </div>
      ) : (
        <div
          className="preview-frame"
          style={{ width: s.width * scale, height: s.height * scale }}
        >
          <div
            className="ad-scale"
            role="img"
            aria-label={`${s.name} ad: ${copy.join(". ")}. ${r.arrangement} layout.`}
            style={{
              width: s.width,
              height: s.height,
              transform: `scale(${scale})`,
            }}
          >
            {renderer === "canvas" ? <canvas ref={canvas} /> : <div ref={board} />}
          </div>
        </div>
      )}
      {imageError && (
        <p className="error">
          Image could not load. Replace it with an uploaded image.
        </p>
      )}
    </div>
  );
}
