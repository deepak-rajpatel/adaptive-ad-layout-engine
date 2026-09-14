import type { Creative, Surface } from "../engine/types";
import { validateCreative, validateSurface } from "../engine/resolve";
export interface SavedCreative {
  id: string;
  name: string;
  collection: string;
  favorite: boolean;
  creative: Creative;
  surface: Surface;
  updated_at: string;
}
export const draftKey = "forma:draft:v1";
export const libraryKey = "forma:library:v1";
export function readLocal<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export function writeLocal(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}
export function readLibrary(): SavedCreative[] {
  const value = readLocal<unknown>(libraryKey, []);
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is SavedCreative => {
    try {
      parseProject(item);
      return (
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.collection === "string" &&
        typeof item.favorite === "boolean" &&
        Number.isFinite(Date.parse(item.updated_at))
      );
    } catch {
      return false;
    }
  });
}
export function parseProject(value: unknown): {
  creative: Creative;
  surface: Surface;
} {
  if (!value || typeof value !== "object")
    throw new Error("Invalid project file.");
  const data = value as { creative: Creative; surface: Surface };
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
