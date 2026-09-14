import type { Measure } from "../engine/types";
export const fontFamily = "Arial, sans-serif";
const context = document.createElement("canvas").getContext("2d")!;
export const measure: Measure = (text, size, weight) => {
  context.font = `${weight} ${size}px ${fontFamily}`;
  return context.measureText(text).width;
};
