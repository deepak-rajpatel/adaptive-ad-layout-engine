import { insets, validateSurface, type Surface } from "../engine/surfaces";
import {
  defaultRequired,
  goals,
  sample,
  validateCreative,
  type Creative,
} from "./creative";
export interface SavedCreative {
  id: string;
  name: string;
  collection: string;
  favorite: boolean;
  creative: Creative;
  surface: Surface;
  updated_at: string;
}
export const draftKey = "omniframe:draft:v1";
export const libraryKey = "omniframe:library:v1";
export const themeKey = "omniframe:dark";
// Data saved before the rename lives under the old "forma:" prefix.
const legacyKey = (key: string) => key.replace(/^omniframe:/, "forma:");
export function readLocal<T>(key: string, fallback: T): T {
  try {
    return (
      JSON.parse(
        localStorage.getItem(key) ??
          localStorage.getItem(legacyKey(key)) ??
          "null",
      ) ?? fallback
    );
  } catch {
    return fallback;
  }
}
export function writeLocal(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}
/** Current project schema. Version 1 (or none, with legacy surface fields) and version 2
 * (with `price`) are migrated. Library rows carry no version, so the v3 upgrade is keyed on
 * the creative's shape and is idempotent. */
export const schemaVersion = 3;
/** Planner fields saved separately before schema 3. Merged once, then retired. */
export const plannerSettingsKey = "omniframe:planner:v1";
export function readLibrary(): { items: SavedCreative[]; skipped: number } {
  const value = readLocal<unknown>(libraryKey, []);
  if (!Array.isArray(value)) return { items: [], skipped: 0 };
  const items = value.flatMap(toSaved);
  return { items, skipped: value.length - items.length };
}
/** Keep unreadable records recoverable when editing the readable local library. */
export function writeLibrary(items: SavedCreative[]) {
  const stored: unknown = JSON.parse(localStorage.getItem(libraryKey) ?? localStorage.getItem(legacyKey(libraryKey)) ?? "[]");
  if (!Array.isArray(stored))
    throw new Error("The stored library is unreadable. Export or back up browser data before replacing it.");
  const unreadable = stored.filter((item) => toSaved(item).length === 0);
  writeLocal(libraryKey, [...items, ...unreadable]);
}
/** Validates a stored or fetched library row, returning the upgraded copy or nothing. */
export function toSaved(item: unknown): SavedCreative[] {
  try {
    const parsed = parseProject(item);
    const row = item as SavedCreative;
    return typeof row.id === "string" &&
      typeof row.name === "string" &&
      typeof row.collection === "string" &&
      typeof row.favorite === "boolean" &&
      Number.isFinite(Date.parse(row.updated_at))
      ? [{ ...row, ...parsed }]
      : [];
  } catch {
    return [];
  }
}

const isRank = (v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5;
/** Surfaces saved before the brief-aligned model have `safe` and no `safeArea`. */
export const isLegacySurface = (value: unknown) =>
  !!value && typeof value === "object" && !("safeArea" in value) && "safe" in value;

/**
 * Earlier versions stored 1–100 priorities where higher meant more important. Converts when
 * the project is known to be legacy, or when any priority is outside the current 1–5 scale.
 */
export function upgradeCreative(value: unknown, legacy = false): unknown {
  if (!value || typeof value !== "object") return value;
  const c = value as { priorities?: Record<string, unknown> };
  const p = c.priorities;
  if (!p || typeof p !== "object") return value;
  if (!legacy && Object.values(p).every(isRank)) return value;
  const rank = (v: number) => (v >= 90 ? 1 : v >= 65 ? 2 : v >= 45 ? 3 : v >= 20 ? 4 : 5);
  return {
    ...c,
    priorities: Object.fromEntries(Object.entries(p).map(([k, v]) => [k, rank(Number(v))])),
  };
}
/** Earlier versions stored one uniform `safe` inset and `minFont` / `minTarget`. */
export function upgradeSurface(value: unknown): unknown {
  if (!value || typeof value !== "object" || "safeArea" in value) return value;
  const { safe, minFont, minTarget, ...rest } = value as Record<string, unknown>;
  return {
    ...rest,
    safeArea: insets(Number(safe)),
    minTextSize: Math.max(10, Number(minFont)),
    viewingDistance: "near",
    input: "touch",
    minTapTarget: Math.max(24, Number(minTarget)),
  };
}

/**
 * Schema 3: `price` becomes `offer` (value and priority, never truncated), required flags
 * become explicit (the old model always required headline and CTA), goal priorities stay off
 * so layouts are unchanged, and new fields get defaults. Creatives already in schema-3 shape
 * only get missing fields filled.
 */
export function upgradeToV3(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const c = value as Record<string, unknown>;
  const defaults = {
    campaignType: sample.campaignType,
    destination: "",
    body: "",
    longHeadline: "",
    description: "",
    focalOverrides: {},
    goal: sample.goal,
  };
  if (!("price" in c) || "offer" in c)
    return { ...defaults, useGoalPriorities: true, required: defaultRequired, ...c };
  const { price, ...rest } = c;
  const p = (c.priorities ?? {}) as Record<string, unknown>;
  const { price: pricePriority, ...priorities } = p;
  return {
    ...defaults,
    ...rest,
    offer: price,
    priorities: typeof c.priorities === "object" && c.priorities ? { ...priorities, offer: pricePriority } : c.priorities,
    required: defaultRequired,
    useGoalPriorities: false,
  };
}

export function parseProject(value: unknown): {
  creative: Creative;
  surface: Surface;
} {
  if (!value || typeof value !== "object")
    throw new Error("Invalid project file.");
  const raw = value as { version?: unknown; creative: unknown; surface: unknown };
  const current = typeof raw.version === "number" && raw.version >= 2;
  const legacy = !current && (raw.version === 1 || isLegacySurface(raw.surface));
  const data = current
    ? { creative: upgradeToV3(raw.creative) as Creative, surface: raw.surface as Surface }
    : {
        creative: upgradeToV3(upgradeCreative(raw.creative, legacy)) as Creative,
        surface: upgradeSurface(raw.surface) as Surface,
      };
  const errors = [
    ...validateCreative(data.creative),
    ...validateSurface(data.surface),
  ];
  if (errors.length) throw new Error(errors.join(" "));
  const surface = { ...data.surface };
  // Imported metadata is never allowed to turn a reference link into a script URL.
  if (surface.source && !/^https:\/\//i.test(surface.source))
    delete surface.source;
  const creative = { ...data.creative };
  if (creative.image === "/headphones.png") creative.image = "/headphones.jpg";
  return { creative, surface };
}
/** Fills planner fields from the pre-schema-3 settings key, if it is still present. */
export function mergeLegacyPlannerSettings(creative: Creative): Creative {
  const v = readLocal<unknown>(plannerSettingsKey, null);
  if (!v || typeof v !== "object") return creative;
  const s = v as Record<string, unknown>;
  return {
    ...creative,
    goal: goals.includes(s.goal as Creative["goal"]) ? (s.goal as Creative["goal"]) : creative.goal,
    destination: typeof s.destination === "string" ? s.destination : creative.destination,
    body: typeof s.body === "string" ? s.body : creative.body,
  };
}
/**
 * Deletes the old planner key only after the schema-3 draft has been written and reads back
 * successfully; on any failure the key is kept and the merge is retried on the next load.
 */
export function retireLegacyPlannerSettings(): boolean {
  try {
    if (localStorage.getItem(plannerSettingsKey) === null) return false;
    const saved = JSON.parse(localStorage.getItem(draftKey) ?? "null");
    if (saved?.version !== schemaVersion) return false;
    parseProject(saved);
    localStorage.removeItem(plannerSettingsKey);
    return true;
  } catch {
    return false;
  }
}
export function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
export async function imageData(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Choose a PNG, JPEG, or WebP image.");
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Choose an image smaller than 10 MB.");
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/webp", 0.85);
}
