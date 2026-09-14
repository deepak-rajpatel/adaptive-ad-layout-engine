import { useEffect, useRef, useState } from "react";
import type { Creative, Resolution, Surface } from "../engine/types";
import { weightFor } from "../engine/resolve";
import { fontFamily } from "../lib/measure";

export async function paint(
  canvas: HTMLCanvasElement,
  c: Creative,
  s: Surface,
  r: Resolution,
) {
  canvas.width = s.width;
  canvas.height = s.height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = c.background;
  ctx.fillRect(0, 0, s.width, s.height);
  let img: HTMLImageElement | null = null;
  if (r.elements.some((e) => e.id === "image")) {
    img = new Image();
    img.crossOrigin = "anonymous";
    img.src = c.image;
    await img.decode();
  }
  for (const e of r.elements) {
    if (e.id === "image" && img) {
      const scale = Math.max(e.width / img.width, e.height / img.height);
      const dw = img.width * scale,
        dh = img.height * scale;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(e.x, e.y, e.width, e.height, 8);
      ctx.clip();
      ctx.drawImage(
        img,
        e.x - ((dw - e.width) * c.focalX) / 100,
        e.y - ((dh - e.height) * c.focalY) / 100,
        dw,
        dh,
      );
      ctx.restore();
    } else {
      if (e.id === "cta") {
        ctx.fillStyle = c.accent;
        ctx.beginPath();
        ctx.roundRect(e.x, e.y, e.width, e.height, 8);
        ctx.fill();
      }
      ctx.fillStyle = e.id === "cta" ? r.buttonText : c.foreground;
      ctx.font = `${weightFor(e.id)} ${e.fontSize}px ${fontFamily}`;
      ctx.textBaseline = "middle";
      ctx.textAlign = e.id === "cta" ? "center" : "left";
      const y = e.y + (e.height - e.lines.length * e.lineHeight) / 2;
      e.lines.forEach((line, i) =>
        ctx.fillText(
          line,
          e.id === "cta" ? e.x + e.width / 2 : e.x,
          y + (i + 0.5) * e.lineHeight,
        ),
      );
    }
  }
}
export function Preview({
  creative: c,
  surface: s,
  result: r,
  renderer = "dom",
  guides = false,
  maxHeight = 450,
}: {
  creative: Creative;
  surface: Surface;
  result: Resolution;
  renderer?: "dom" | "canvas";
  guides?: boolean;
  maxHeight?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(400);
  const [imageError, setImageError] = useState(false);
  useEffect(() => {
    setImageError(false);
  }, [c.image, renderer]);
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (renderer !== "canvas" || !canvas.current) return;
    let cancelled = false;
    const buffer = document.createElement("canvas");
    paint(buffer, c, s, r)
      .then(() => {
        if (!cancelled && canvas.current) {
          canvas.current.width = s.width;
          canvas.current.height = s.height;
          canvas.current.getContext("2d")!.drawImage(buffer, 0, 0);
        }
      })
      .catch(() => {
        if (!cancelled) setImageError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [c, s, r, renderer]);
  const scale = Math.min(
    width / Math.max(32, s.width),
    maxHeight / Math.max(32, s.height),
    1,
  );
  const valid = r.status === "ready" || r.status === "adapted";
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
            className="ad-artboard"
            key={renderer === "dom" ? JSON.stringify(r.elements) : "canvas"}
            role="img"
            aria-label={`${s.name} ad: ${r.elements
              .filter((e) => e.id !== "image")
              .map((e) => c[e.id])
              .join(". ")}. ${r.arrangement} layout.`}
            style={{
              width: s.width,
              height: s.height,
              transform: `scale(${scale})`,
              background: c.background,
              color: c.foreground,
            }}
          >
            {renderer === "canvas" ? (
              <canvas ref={canvas} />
            ) : (
              r.elements.map((e) => (
                <div
                  key={e.id}
                  className={`ad-element ad-${e.id}${guides ? " outlined" : ""}`}
                  style={{
                    left: e.x,
                    top: e.y,
                    width: e.width,
                    height: e.height,
                    fontFamily,
                    fontSize: e.fontSize,
                    fontWeight: weightFor(e.id),
                    lineHeight: `${e.lineHeight}px`,
                    ...(e.id === "cta"
                      ? { background: c.accent, color: r.buttonText }
                      : {}),
                  }}
                >
                  {e.id === "image" ? (
                    <img
                      src={c.image}
                      alt=""
                      onError={() => setImageError(true)}
                      style={{ objectPosition: `${c.focalX}% ${c.focalY}%` }}
                    />
                  ) : (
                    <div>
                      {e.lines.map((line, i) => (
                        <div key={i}>{line}</div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
            {guides && <div className="safe-guide" style={{ inset: s.safe }} />}
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
