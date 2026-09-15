// Cover-crop math shared by the renderers and the placement planner.

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The source rectangle shown when a source image covers a box, positioned by a focal point
 * in percent. Matches CSS `object-fit: cover` with `object-position: fx% fy%`.
 */
export function coverCrop(
  sourceWidth: number,
  sourceHeight: number,
  boxWidth: number,
  boxHeight: number,
  focalX: number,
  focalY: number,
): CropRect {
  const scale = Math.max(boxWidth / sourceWidth, boxHeight / sourceHeight);
  const width = boxWidth / scale;
  const height = boxHeight / scale;
  return {
    x: ((sourceWidth - width) * focalX) / 100,
    y: ((sourceHeight - height) * focalY) / 100,
    width,
    height,
  };
}

/**
 * Where a whole source image is drawn inside a box, relative to the box. Matches CSS
 * `object-fit: contain` with `object-position: fx% fy%` (the focal point anchors it).
 */
export function containFit(
  sourceWidth: number,
  sourceHeight: number,
  boxWidth: number,
  boxHeight: number,
  focalX: number,
  focalY: number,
): CropRect {
  const scale = Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: ((boxWidth - width) * focalX) / 100,
    y: ((boxHeight - height) * focalY) / 100,
    width,
    height,
  };
}
