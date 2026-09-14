import type { AssetInfo, MediaKind } from "../engine/placements";

/** Browser decoding, with timeout and cleanup; never infers a video from its shape. */
export function inspectAsset(src: string, kind: MediaKind): Promise<AssetInfo> {
  return new Promise((resolve, reject) => {
    const media =
      kind === "image" ? new Image() : document.createElement("video");
    const finish = (error?: string) => {
      clearTimeout(timer);
      const info: AssetInfo =
        media instanceof HTMLVideoElement
          ? {
              kind,
              width: media.videoWidth,
              height: media.videoHeight,
              duration: media.duration,
            }
          : { kind, width: media.naturalWidth, height: media.naturalHeight };
      media.onload = null;
      media.onerror = null;
      if (media instanceof HTMLVideoElement) {
        media.onloadedmetadata = null;
        media.removeAttribute("src");
        media.load();
      }
      if (error || !info.width || !info.height)
        reject(new Error(error || "Cannot read this asset's dimensions."));
      else resolve(info);
    };
    const timer = setTimeout(
      () => finish("Asset inspection timed out. Try uploading a local file."),
      15000,
    );
    media.onerror = () =>
      finish(
        "This media could not be decoded. Use PNG, JPEG, WebP, MP4 or WebM.",
      );
    if (media instanceof HTMLVideoElement) {
      media.preload = "metadata";
      media.onloadedmetadata = () => finish();
    } else media.onload = () => finish();
    media.src = src;
  });
}
