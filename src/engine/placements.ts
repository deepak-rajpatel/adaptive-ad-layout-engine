// Shared planning helpers. The placement catalog lives in ./catalog.
export type { Goal } from "./catalog/types";
import type { Goal } from "./catalog/types";

export interface AssetInfo {
  width: number;
  height: number;
  bytes?: number;
}
export const goalCta: Record<Goal, string> = {
  Awareness: "Learn more",
  Consideration: "Learn more",
  Leads: "Sign up",
  Sales: "Shop now",
};
export function validDestination(value: string): boolean {
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) && !!u.hostname;
  } catch {
    return false;
  }
}
