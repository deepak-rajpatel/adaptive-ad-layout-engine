/** Creative planning profiles, separate from the layout resolver's physical surfaces.
 * Dimensions are planning targets, not an exhaustive network acceptance policy. */
export type MediaKind = "image" | "video";
export type Goal = "Awareness" | "Consideration" | "Leads" | "Sales";
export type FitStatus = "Fits" | "Needs work" | "Unsupported";
export interface AssetInfo {
  kind: MediaKind;
  width: number;
  height: number;
  duration?: number;
  bytes?: number;
}
export interface Placement {
  id: string;
  network: "Meta" | "Google" | "Taboola" | "LinkedIn" | "TikTok";
  name: string;
  container:
    | "In-feed"
    | "Vertical"
    | "Recommendation"
    | "Multi-asset"
    | "Display"
    | "Carousel";
  kind: MediaKind;
  width: number;
  height: number;
  headlineLimit?: number;
  extra?: string;
  source: string;
}
export const goalCta: Record<Goal, string> = {
  Awareness: "Learn more",
  Consideration: "Learn more",
  Leads: "Sign up",
  Sales: "Shop now",
};
const meta = "https://www.facebook.com/business/ads-guide";
const google = "https://support.google.com/google-ads/answer/7005917";
export const placements: Placement[] = [
  {
    id: "meta-feed",
    network: "Meta",
    name: "Facebook & Instagram feed",
    container: "In-feed",
    kind: "image",
    width: 1080,
    height: 1080,
    source: meta,
  },
  {
    id: "meta-portrait-feed",
    network: "Meta",
    name: "Portrait feed · 4:5",
    container: "In-feed",
    kind: "image",
    width: 1080,
    height: 1350,
    source: meta,
  },
  {
    id: "meta-story",
    network: "Meta",
    name: "Instagram Stories",
    container: "Vertical",
    kind: "image",
    width: 1080,
    height: 1920,
    source: meta,
  },
  {
    id: "meta-reels",
    network: "Meta",
    name: "Facebook & Instagram Reels",
    container: "Vertical",
    kind: "video",
    width: 1080,
    height: 1920,
    source:
      "https://www.facebook.com/business/ads/facebook-instagram-reels-ads",
  },
  {
    id: "meta-carousel",
    network: "Meta",
    name: "Feed carousel",
    container: "Carousel",
    kind: "image",
    width: 1080,
    height: 1080,
    extra: "Add more cards and define their order and destinations.",
    source: meta,
  },
  {
    id: "google-rda",
    network: "Google",
    name: "Responsive display asset",
    container: "Multi-asset",
    kind: "image",
    width: 1200,
    height: 628,
    headlineLimit: 30,
    extra:
      "Complete the asset group with a square image, logo, long headline and description.",
    source: google,
  },
  {
    id: "google-display",
    network: "Google",
    name: "Medium rectangle",
    container: "Display",
    kind: "image",
    width: 300,
    height: 250,
    source: "https://support.google.com/google-ads/answer/7031480",
  },
  {
    id: "google-shorts",
    network: "Google",
    name: "YouTube Shorts",
    container: "Vertical",
    kind: "video",
    width: 1080,
    height: 1920,
    extra:
      "Check video duration, audio rights and campaign-specific requirements.",
    source: "https://support.google.com/google-ads/answer/16041697",
  },
  {
    id: "taboola-native",
    network: "Taboola",
    name: "Content recommendation",
    container: "Recommendation",
    kind: "image",
    width: 1000,
    height: 600,
    extra:
      "Publisher crops vary; review the separate thumbnail, title and branding.",
    source:
      "https://developers.taboola.com/backstage-api/docs/item-thumbnail_url",
  },
  {
    id: "linkedin-feed",
    network: "LinkedIn",
    name: "Sponsored single image",
    container: "In-feed",
    kind: "image",
    width: 1200,
    height: 1200,
    source: "https://www.linkedin.com/help/linkedin/answer/a426534",
  },
  {
    id: "tiktok-feed",
    network: "TikTok",
    name: "In-feed video",
    container: "Vertical",
    kind: "video",
    width: 1080,
    height: 1920,
    extra:
      "Check duration, audio, identity and the placement-specific safe zone.",
    source: "https://ads.tiktok.com/help/article/tiktok-auction-in-feed-ads",
  },
];
export interface FitResult {
  placement: Placement;
  status: FitStatus;
  reasons: string[];
  retained: number;
}
export function validDestination(value: string): boolean {
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) && !!u.hostname;
  } catch {
    return false;
  }
}
export function assessPlacement(
  asset: AssetInfo,
  p: Placement,
  headline: string,
  destination: string,
): FitResult {
  const reasons: string[] = [];
  if (![asset.width, asset.height].every((v) => Number.isFinite(v) && v > 0))
    return {
      placement: p,
      status: "Unsupported",
      reasons: ["Asset dimensions could not be read."],
      retained: 0,
    };
  if (asset.kind !== p.kind)
    return {
      placement: p,
      status: "Unsupported",
      reasons: [
        `This profile needs ${p.kind === "video" ? "a video" : "an image"}; upload a separate asset.`,
      ],
      retained: 0,
    };
  const sourceRatio = asset.width / asset.height;
  const targetRatio = p.width / p.height;
  const retained = Math.min(
    sourceRatio / targetRatio,
    targetRatio / sourceRatio,
  );
  if (retained < 0.98)
    reasons.push(
      `Crop to ${p.width} × ${p.height}; approximately ${Math.round((1 - retained) * 100)}% of the image area falls outside the frame.`,
    );
  const cropWidth = Math.min(asset.width, asset.height * targetRatio);
  const cropHeight = Math.min(asset.height, asset.width / targetRatio);
  if (cropWidth < p.width - 1 || cropHeight < p.height - 1)
    reasons.push(
      "The cropped asset is below this profile's target resolution. Use a larger source.",
    );
  if (!headline.trim()) reasons.push("Add a headline.");
  if (p.headlineLimit && Array.from(headline).length > p.headlineLimit)
    reasons.push(
      `Shorten the headline to ${p.headlineLimit} characters for this field.`,
    );
  if (!validDestination(destination))
    reasons.push("Add a valid HTTP or HTTPS destination URL.");
  if (
    asset.kind === "video" &&
    (!Number.isFinite(asset.duration) || !asset.duration || asset.duration <= 0)
  )
    reasons.push("Video duration could not be verified.");
  if (p.extra) reasons.push(p.extra);
  return {
    placement: p,
    status: reasons.length ? "Needs work" : "Fits",
    reasons: reasons.length
      ? reasons
      : ["Asset geometry and required planning fields fit this profile."],
    retained,
  };
}
