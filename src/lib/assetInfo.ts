import type { AssetInfo } from "../engine/placements";

/** Browser image decoding, with timeout and cleanup. */
export function inspectAsset(src: string): Promise<AssetInfo> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const finish = (error?: string) => {
      clearTimeout(timer);
      const info: AssetInfo = {
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
      image.onload = null;
      image.onerror = null;
      if (error || !info.width || !info.height)
        reject(new Error(error || "Cannot read this image's dimensions."));
      else resolve(info);
    };
    const timer = setTimeout(
      () => finish("Image inspection timed out. Try uploading a local file."),
      15000,
    );
    image.onerror = () =>
      finish("This image could not be decoded. Use PNG, JPEG or WebP.");
    image.onload = () => finish();
    image.src = src;
  });
}
