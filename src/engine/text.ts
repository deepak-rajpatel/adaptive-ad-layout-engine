import type { FontKey } from "./spec";

/**
 * Returns rendered text width in pixels. Injected so the engine stays browser-independent.
 * `font` is the font stack key; omitted means the original sans stack.
 */
export type Measure = (text: string, size: number, weight: number, font?: FontKey) => number;

/**
 * Greedy word wrap using real measurements. Words wider than the line are hyphenated only
 * when allowed (headline/secondary copy); otherwise the text cannot fit and null is returned.
 */
export function wrap(
  text: string,
  width: number,
  size: number,
  weight: number,
  measure: Measure,
  { hyphenate = false, font }: { hyphenate?: boolean; font?: FontKey } = {},
): string[] | null {
  const m = (t: string) => measure(t, size, weight, font);
  const lines: string[] = [];
  let line = "";
  for (let word of text.trim().split(/\s+/u)) {
    while (m(word) > width) {
      if (!hyphenate) return null;
      let n = word.length - 1;
      while (n > 1 && m(`${word.slice(0, n)}-`) > width) n--;
      if (n <= 1) return null;
      if (line) lines.push(line);
      lines.push(`${word.slice(0, n)}-`);
      line = "";
      word = word.slice(n);
    }
    const next = line ? `${line} ${word}` : word;
    if (line && m(next) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Longest prefix that fits on one line with an ellipsis, or null if nothing meaningful fits. */
export function truncateLine(
  text: string,
  width: number,
  size: number,
  weight: number,
  measure: Measure,
  font?: FontKey,
): string | null {
  const m = (t: string) => measure(t, size, weight, font);
  const clean = text.trim().replace(/\s+/g, " ");
  if (m(clean) <= width) return clean;
  let lo = 0,
    hi = clean.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (m(`${clean.slice(0, mid).trimEnd()}…`) <= width) lo = mid;
    else hi = mid - 1;
  }
  return lo >= 2 ? `${clean.slice(0, lo).trimEnd()}…` : null;
}
