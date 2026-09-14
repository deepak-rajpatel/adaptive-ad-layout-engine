import { useEffect, useState } from "react";
import { Cloud, ImagePlus, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { imageData } from "../lib/persistence";
export function AssetLibrary({
  userId,
  currentImage,
  localImages,
  select,
}: {
  userId?: string;
  currentImage: string;
  localImages: string[];
  select: (image: string) => void;
}) {
  const [assets, setAssets] = useState<{ path: string; url: string }[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (!userId || !supabase) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase!.storage
        .from("creative-assets")
        .list(userId, {
          limit: 100,
          sortBy: { column: "created_at", order: "desc" },
        });
      if (error) {
        if (!cancelled) {
          setUnavailable(true);
          setMessage(
            "Cloud images are not set up on this deployment yet (storage bucket missing). Local images still work.",
          );
        }
        return;
      }
      const signed = await Promise.all(
        (data || [])
          .filter((file) => file.id)
          .map(async (file) => {
            const path = `${userId}/${file.name}`;
            const { data } = await supabase!.storage
              .from("creative-assets")
              .createSignedUrl(path, 3600);
            return data ? { path, url: data.signedUrl } : null;
          }),
      );
      if (!cancelled)
        setAssets(
          signed.filter((a): a is { path: string; url: string } => !!a),
        );
    })().catch(() => {
      if (!cancelled)
        setMessage("Could not load cloud images. Please try again.");
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);
  async function upload() {
    if (!userId || !supabase) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(currentImage);
      if (!response.ok) throw new Error("Image unavailable.");
      const blob = await response.blob();
      const encoded = await imageData(
        new File([blob], "creative", { type: blob.type }),
      );
      const imageBlob = await (await fetch(encoded)).blob();
      const path = `${userId}/${crypto.randomUUID()}.webp`;
      const { error } = await supabase.storage
        .from("creative-assets")
        .upload(path, imageBlob, { contentType: "image/webp", upsert: false });
      if (error) throw error;
      const { data } = await supabase.storage
        .from("creative-assets")
        .createSignedUrl(path, 3600);
      if (data) setAssets((items) => [{ path, url: data.signedUrl }, ...items]);
      setMessage("Image saved to your private cloud library.");
    } catch {
      setMessage(
        "Could not save the image. Check your connection and storage setup.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function chooseCloud(path: string) {
    if (!supabase) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.storage
        .from("creative-assets")
        .download(path);
      if (error || !data) throw error;
      select(
        await imageData(new File([data], "product.webp", { type: data.type })),
      );
    } catch {
      setMessage(
        "Could not load this image. Reopen the library and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function removeCloud(path: string) {
    if (!supabase || !window.confirm("Delete this image from your cloud library?"))
      return;
    setBusy(true);
    try {
      const { error } = await supabase.storage
        .from("creative-assets")
        .remove([path]);
      if (error) throw error;
      setAssets((items) => items.filter((a) => a.path !== path));
      setMessage("Image deleted. Creatives that embed a copy are unaffected.");
    } catch {
      setMessage("Could not delete this image. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="asset-library">
      <p className="modal-description">
        Reuse images from saved creatives or keep them in your private cloud
        library.
      </p>
      <h3>From this browser</h3>
      <div className="asset-grid">
        {Array.from(new Set(["/headphones.jpg", ...localImages])).map(
          (image, i) => (
            <button
              key={i}
              onClick={() => select(image)}
              aria-label={`Use saved image ${i + 1}`}
            >
              <img src={image} alt={`Saved product ${i + 1}`} />
            </button>
          ),
        )}
      </div>
      <h3>
        <Cloud size={15} /> Cloud images
      </h3>
      {userId ? (
        <>
          <button
            className="button full"
            disabled={busy || unavailable}
            onClick={() => void upload()}
          >
            <ImagePlus size={16} /> Save current image to cloud
          </button>
          <div className="asset-grid">
            {assets.map((asset, i) => (
              <div className="asset-item" key={asset.path}>
                <button
                  disabled={busy}
                  onClick={() => void chooseCloud(asset.path)}
                  aria-label={`Use cloud image ${i + 1}`}
                >
                  <img src={asset.url} alt={`Cloud product ${i + 1}`} />
                </button>
                <button
                  className="asset-delete icon-button"
                  disabled={busy}
                  onClick={() => void removeCloud(asset.path)}
                  aria-label={`Delete cloud image ${i + 1}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="help-text">Sign in to upload and reuse cloud images.</p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
