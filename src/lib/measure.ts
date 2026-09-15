import type { Measure } from "../engine/text";
import { fontStack } from "../engine/fonts";
// Browser adapter: real Canvas text metrics using the same font stacks the renderers draw with.
const context = document.createElement("canvas").getContext("2d")!;
export const measure: Measure = (text, size, weight, font) => {
  context.font = `${weight} ${size}px ${fontStack(font)}`;
  return context.measureText(text).width;
};
