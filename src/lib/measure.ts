import type { Measure } from "../engine/text";
import { fontFamily } from "../render/dom";
// Browser adapter: real Canvas text metrics using the same font stack the renderers draw with.
const context = document.createElement("canvas").getContext("2d")!;
export const measure: Measure = (text, size, weight) => {
  context.font = `${weight} ${size}px ${fontFamily}`;
  return context.measureText(text).width;
};
