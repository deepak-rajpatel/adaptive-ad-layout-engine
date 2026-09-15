// The curated font set: locally installed system font stacks, so no font files are downloaded
// or licensed. Measurement and both renderers read these exact stacks, so the fonts that
// wrap the text are the fonts that draw it. "sans" is the original font stack.
import type { FontKey } from "./spec";

export const fontStacks: Record<FontKey, string> = {
  sans: "Arial, sans-serif",
  serif: 'Georgia, "Times New Roman", serif',
  humanist: '"Trebuchet MS", "Segoe UI", Tahoma, sans-serif',
};
export const fontLabels: Record<FontKey, string> = {
  sans: "Sans (Arial)",
  serif: "Serif (Georgia)",
  humanist: "Humanist (Trebuchet)",
};
export const fontStack = (font: FontKey | undefined) => fontStacks[font ?? "sans"];
