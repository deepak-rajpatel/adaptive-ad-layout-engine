// Verified placement catalog. Every value is recorded with its source in
// docs/catalog-verification.md (checked 14 September 2026). Planning data, not approval rules.
import { insets } from "../surfaces";
import { assignmentSurfaces } from "./assignmentSurfaces";
import type {
  AcceptedSize,
  CopyField,
  Format,
  Network,
  NetworkObjective,
  Placement,
  SurfaceTemplate,
} from "./types";

const checked = "2026-09-14";

export const networks: readonly Network[] = [
  { id: "meta", name: "Meta" },
  { id: "google", name: "Google" },
  { id: "taboola", name: "Taboola" },
  { id: "linkedin", name: "LinkedIn" },
  { id: "tiktok", name: "TikTok" },
  { id: "assignment", name: "Assignment surfaces" },
];

const src = {
  metaObjectives: "https://www.facebook.com/business/help/1438417719786914",
  metaFeed: "https://www.facebook.com/business/ads-guide/update/image/instagram-feed",
  metaStory: "https://www.facebook.com/business/ads-guide/image/instagram-story",
  metaRight: "https://www.facebook.com/business/ads-guide/update/image/facebook-right-hand-column",
  metaCarousel: "https://www.facebook.com/business/ads-guide/update/carousel/facebook-feed/link-clicks",
  googleObjectives: "https://support.google.com/google-ads/answer/7450050?hl=en",
  googleRda: "https://support.google.com/google-ads/answer/17090561?hl=en",
  googlePmax: "https://support.google.com/google-ads/answer/17091269?hl=en",
  googleDemandGen: "https://support.google.com/google-ads/answer/17140672?hl=en",
  googleBanners: "https://support.google.com/google-ads/answer/1722096",
  taboolaObjectives: "https://help.taboola.com/hc/en-us/articles/115000946794-Setting-Your-Marketing-Objective",
  taboola: "https://realize.com/help/en/articles/8964660-video-title-and-thumbnail-best-practices",
  linkedinObjectives: "https://www.linkedin.com/help/lms/answer/a424570",
  linkedinSingle: "https://www.linkedin.com/help/lms/answer/a426534",
  linkedinCarousel: "https://www.linkedin.com/help/lms/answer/a427022",
  tiktokCarousel: "https://ads.tiktok.com/help/article/specifications-for-carousel-ads",
} as const;

const objective = (
  id: string,
  network: NetworkObjective["network"],
  name: string,
  goal: NetworkObjective["goal"],
  source: string,
): NetworkObjective => ({ id, network, name, goal, source, verifiedAt: checked });

export const objectives: readonly NetworkObjective[] = [
  objective("meta-awareness", "meta", "Awareness", "Awareness", src.metaObjectives),
  objective("meta-traffic", "meta", "Traffic", "Consideration", src.metaObjectives),
  objective("meta-engagement", "meta", "Engagement", "Consideration", src.metaObjectives),
  objective("meta-leads", "meta", "Leads", "Leads", src.metaObjectives),
  objective("meta-sales", "meta", "Sales", "Sales", src.metaObjectives),
  objective("google-awareness", "google", "Brand awareness and reach", "Awareness", src.googleObjectives),
  objective("google-traffic", "google", "Website traffic", "Consideration", src.googleObjectives),
  objective("google-consideration", "google", "Product or brand consideration", "Consideration", src.googleObjectives),
  objective("google-leads", "google", "Leads", "Leads", src.googleObjectives),
  objective("google-sales", "google", "Sales", "Sales", src.googleObjectives),
  objective("taboola-awareness", "taboola", "Brand Awareness", "Awareness", src.taboolaObjectives),
  objective("taboola-engagement", "taboola", "Website Engagement", "Consideration", src.taboolaObjectives),
  objective("taboola-leads", "taboola", "Lead Generation", "Leads", src.taboolaObjectives),
  objective("taboola-purchases", "taboola", "Online Purchases", "Sales", src.taboolaObjectives),
  objective("linkedin-awareness", "linkedin", "Brand awareness", "Awareness", src.linkedinObjectives),
  objective("linkedin-visits", "linkedin", "Website visits", "Consideration", src.linkedinObjectives),
  objective("linkedin-engagement", "linkedin", "Engagement", "Consideration", src.linkedinObjectives),
  objective("linkedin-leads", "linkedin", "Lead generation", "Leads", src.linkedinObjectives),
  objective("linkedin-conversions", "linkedin", "Website conversions", "Sales", src.linkedinObjectives),
];
const allOf = (network: string) => objectives.filter((o) => o.network === network).map((o) => o.id);

const format = (f: Omit<Format, "verifiedAt">): Format => ({ ...f, verifiedAt: checked });
const setupOnly = (
  id: string,
  network: Format["network"],
  name: string,
  container: Format["container"],
  reason: string,
  source: string,
): Format =>
  format({ id, network, name, container, assembly: "platform", objectives: [], buildable: false, unbuildableReason: reason, source });
const setupReason = "Needs network setup: outside creative scope.";

export const formats: readonly Format[] = [
  format({ id: "meta-single-image", network: "meta", name: "Single image ad", container: "In-feed", assembly: "platform", objectives: allOf("meta"), buildable: true, source: src.metaFeed }),
  format({ id: "meta-stories-image", network: "meta", name: "Stories image ad", container: "Vertical", assembly: "composed", objectives: allOf("meta"), buildable: true, source: src.metaStory }),
  format({ id: "meta-right-column", network: "meta", name: "Right column ad", container: "Display", assembly: "platform", objectives: ["meta-traffic", "meta-sales"], buildable: true, source: src.metaRight }),
  format({ id: "meta-carousel", network: "meta", name: "Carousel ad", container: "Carousel", assembly: "platform", objectives: allOf("meta"), buildable: true, source: src.metaCarousel }),
  format({ id: "google-rda", network: "google", name: "Responsive display ad", container: "Multi-asset", assembly: "platform", objectives: allOf("google"), buildable: true, source: src.googleRda }),
  format({ id: "google-pmax", network: "google", name: "Performance Max asset group", container: "Multi-asset", assembly: "platform", objectives: ["google-sales", "google-leads", "google-traffic"], buildable: true, source: src.googlePmax }),
  format({ id: "google-demandgen", network: "google", name: "Demand Gen image ad", container: "In-feed", assembly: "platform", objectives: ["google-sales", "google-leads", "google-traffic", "google-consideration"], buildable: true, source: src.googleDemandGen }),
  format({ id: "google-display-banner", network: "google", name: "Uploaded display banner", container: "Display", assembly: "composed", objectives: allOf("google"), buildable: true, source: src.googleBanners }),
  format({ id: "taboola-native", network: "taboola", name: "Native recommendation", container: "Recommendation", assembly: "platform", objectives: allOf("taboola"), buildable: true, source: src.taboola }),
  format({ id: "linkedin-single-image", network: "linkedin", name: "Single image ad", container: "In-feed", assembly: "platform", objectives: allOf("linkedin"), buildable: true, source: src.linkedinSingle }),
  format({ id: "linkedin-carousel", network: "linkedin", name: "Carousel ad", container: "Carousel", assembly: "platform", objectives: allOf("linkedin"), buildable: true, source: src.linkedinCarousel }),
  format({ id: "assignment-surface", network: "assignment", name: "Assignment surface", container: "Assignment", assembly: "composed", objectives: [], buildable: true, source: "https://github.com/" }),
  setupOnly("tiktok-carousel", "tiktok", "Carousel (image) ad", "Carousel", "Specs not yet verified: TikTok's documentation could not be reached. No generic single-image TikTok placement is offered.", src.tiktokCarousel),
  setupOnly("meta-instant-forms", "meta", "Instant Forms (lead ads)", "In-feed", setupReason, src.metaObjectives),
  setupOnly("meta-catalog", "meta", "Advantage+ catalog ads", "Carousel", "Built from a product catalog feed, not an uploaded creative.", src.metaObjectives),
  setupOnly("meta-collection", "meta", "Collection ads", "In-feed", "Needs a product catalog and Instant Experience setup.", src.metaObjectives),
  setupOnly("meta-click-to-message", "meta", "Click-to-message ads", "In-feed", setupReason, src.metaObjectives),
  setupOnly("google-shopping", "google", "Shopping ads", "Recommendation", "Built from a Merchant Center product feed.", src.googleObjectives),
  setupOnly("google-app", "google", "App campaigns", "Multi-asset", setupReason, src.googleObjectives),
  setupOnly("google-masthead", "google", "YouTube Masthead", "Display", "Reservation-only through Google sales.", src.googleObjectives),
  setupOnly("google-lsa", "google", "Local Services Ads", "In-feed", "Requires business verification; not creative-driven.", src.googleObjectives),
  setupOnly("google-rsa", "google", "Responsive search ads", "In-feed", "Text-only format: needs verified copy fields and a copy-only preview first.", src.googleObjectives),
  setupOnly("taboola-dynamic", "taboola", "Dynamic retargeting", "Recommendation", "Built from a product feed and the Taboola Pixel.", src.taboolaObjectives),
  setupOnly("linkedin-lead-gen", "linkedin", "Lead Gen Forms", "In-feed", setupReason, src.linkedinObjectives),
  setupOnly("linkedin-messaging", "linkedin", "Conversation and Message ads", "In-feed", setupReason, src.linkedinObjectives),
  setupOnly("linkedin-document", "linkedin", "Document ads", "In-feed", "Needs a PDF document, not an image creative.", src.linkedinObjectives),
  setupOnly("linkedin-jobs", "linkedin", "Job ads", "In-feed", "Needs a job posting.", src.linkedinObjectives),
  setupOnly("linkedin-thought-leader", "linkedin", "Thought Leader ads", "In-feed", "Boosts an existing member post.", src.linkedinObjectives),
];

const size = (
  label: string,
  recommended: [number, number],
  minimum: [number, number],
  tolerance = 0.02,
): AcceptedSize => ({
  label,
  ratio: recommended[0] / recommended[1],
  recommended: { width: recommended[0], height: recommended[1] },
  minimum: { width: minimum[0], height: minimum[1] },
  tolerance,
});
const field = (key: CopyField["key"], label: string, rule: Omit<CopyField, "key" | "label">): CopyField => ({ key, label, ...rule });

// Constraints for composed banners scale with the unit, matching the studio's IAB presets.
const bannerTemplate = (h: number): SurfaceTemplate => ({
  safeArea: insets(h <= 60 ? 4 : h <= 100 ? 6 : 12),
  minTextSize: h <= 60 ? 10 : 12,
  minContrast: 4.5,
  viewingDistance: "near",
  input: "pointer",
  minTapTarget: h <= 100 ? 24 : 32,
});
const banners: [number, number, string][] = [
  [300, 250, "Medium rectangle"],
  [336, 280, "Large rectangle"],
  [728, 90, "Leaderboard"],
  [970, 90, "Super leaderboard"],
  [970, 250, "Billboard"],
  [468, 60, "Full banner"],
  [160, 600, "Wide skyscraper"],
  [120, 600, "Skyscraper"],
  [300, 600, "Half-page"],
  [300, 1050, "Portrait"],
  [320, 50, "Mobile leaderboard"],
  [320, 100, "Large mobile banner"],
  [300, 50, "Small mobile banner"],
];

const place = (p: Omit<Placement, "verifiedAt">): Placement => ({ ...p, verifiedAt: checked });

export const placements: readonly Placement[] = [
  place({
    id: "meta-feed",
    formatId: "meta-single-image",
    network: "meta",
    name: "Facebook & Instagram feed",
    accepts: [
      size("4:5", [1440, 1800], [600, 750], 0.03),
      size("1:1", [1440, 1440], [600, 600], 0.03),
      size("1.91:1", [1440, 754], [600, 314], 0.03),
    ],
    copyFields: [
      field("body", "Primary text", { truncatesAt: 125, required: false }),
      field("headline", "Headline", { truncatesAt: 27, required: true }),
    ],
    media: "required",
    destination: true,
    note: "4:5 is recommended. 1:1 and 1.91:1 fall inside Meta's accepted feed range (4:5 to 1.91:1).",
    source: src.metaFeed,
  }),
  place({
    id: "meta-stories",
    formatId: "meta-stories-image",
    network: "meta",
    name: "Instagram & Facebook Stories",
    accepts: [size("9:16", [1080, 1920], [500, 889], 0.01)],
    copyFields: [],
    media: "optional",
    // Meta: keep the top 14%, bottom ~35% and 6% on each side free of text and logos.
    surface: {
      safeArea: { top: 269, right: 65, bottom: 672, left: 65 },
      minTextSize: 36,
      minContrast: 4.5,
      viewingDistance: "near",
      input: "none",
    },
    destination: true,
    note: "Composed at 1080 × 1920 (Meta recommends at least 1440 × 2560; the engine's surfaces stop at 2400 px). Meta supplies the tappable CTA.",
    source: src.metaStory,
  }),
  place({
    id: "meta-right-column",
    formatId: "meta-right-column",
    network: "meta",
    name: "Facebook right column",
    accepts: [size("1:1", [1080, 1080], [254, 133])],
    copyFields: [field("headline", "Headline", { truncatesAt: 40, required: true })],
    media: "required",
    destination: true,
    note: "Desktop only. Meta advises against text overlays at this small size.",
    source: src.metaRight,
  }),
  place({
    id: "meta-carousel-card",
    formatId: "meta-carousel",
    network: "meta",
    name: "Feed carousel card",
    accepts: [size("1:1", [1080, 1080], [1080, 1080], 0.03)],
    copyFields: [
      field("body", "Primary text", { truncatesAt: 80, required: false }),
      field("headline", "Card headline", { truncatesAt: 20, required: true }),
      field("description", "Card description", { truncatesAt: 18, required: false }),
    ],
    media: "required",
    destination: true,
    note: "One card of 2–10. Add the other cards and their destinations in Ads Manager.",
    source: src.metaCarousel,
  }),
  place({
    id: "google-rda",
    formatId: "google-rda",
    network: "google",
    name: "Responsive display image",
    accepts: [size("1.91:1", [1200, 628], [600, 314]), size("1:1", [600, 600], [300, 300])],
    copyFields: [
      field("headline", "Headline", { limit: 30, required: true }),
      field("longHeadline", "Long headline", { limit: 90, required: true }),
      field("description", "Description", { limit: 90, required: true }),
      field("brand", "Business name", { limit: 25, required: true }),
    ],
    media: "required",
    destination: true,
    note: "Google assembles the ad. The asset group also needs both a landscape and a square image, and a logo.",
    source: src.googleRda,
  }),
  place({
    id: "google-pmax",
    formatId: "google-pmax",
    network: "google",
    name: "Performance Max image",
    accepts: [
      size("1.91:1", [1200, 628], [600, 314]),
      size("1:1", [1200, 1200], [300, 300]),
      size("4:5", [960, 1200], [480, 600]),
    ],
    copyFields: [
      field("headline", "Headline", { limit: 30, required: true }),
      field("longHeadline", "Long headline", { limit: 90, required: true }),
      field("description", "Description", { limit: 90, required: true }),
      field("brand", "Business name", { limit: 25, required: true }),
    ],
    media: "required",
    destination: true,
    note: "Google assembles ads across channels. An asset group needs 3–15 headlines and 2–5 descriptions; this plan checks one of each.",
    source: src.googlePmax,
  }),
  place({
    id: "google-demandgen",
    formatId: "google-demandgen",
    network: "google",
    name: "Demand Gen image",
    accepts: [
      size("1.91:1", [1200, 628], [600, 314]),
      size("1:1", [1200, 1200], [300, 300]),
      size("4:5", [960, 1200], [480, 600]),
      size("9:16", [1080, 1920], [600, 1067]),
    ],
    copyFields: [
      field("headline", "Headline", { limit: 40, required: true }),
      field("description", "Description", { limit: 90, required: true }),
      field("brand", "Business name", { limit: 25, required: true }),
    ],
    media: "required",
    destination: true,
    note: "Runs on YouTube, Discover and Gmail.",
    source: src.googleDemandGen,
  }),
  ...banners.map(([w, h, name]) =>
    place({
      id: `google-${w}x${h}`,
      formatId: "google-display-banner",
      network: "google",
      name: `${name} · ${w}×${h}`,
      accepts: [size(`${w}×${h}`, [w, h], [w, h])],
      copyFields: [],
      media: "optional",
      surface: bannerTemplate(h),
      destination: true,
      note: "Uploaded image ads are limited to 150 KB (GIF, JPG, PNG); check the exported file size.",
      source: src.googleBanners,
    }),
  ),
  place({
    id: "taboola-native",
    formatId: "taboola-native",
    network: "taboola",
    name: "Content recommendation",
    accepts: [
      size("16:9", [1200, 674], [600, 400]),
      size("4:3", [1200, 900], [600, 450]),
      size("1:1", [1200, 1200], [600, 600]),
    ],
    copyFields: [
      field("headline", "Title", { limit: 60, truncatesAt: 45, required: true }),
      field("brand", "Branding text", { limit: 30, required: true }),
      field("description", "Description", { limit: 250, required: false }),
    ],
    media: "required",
    destination: true,
    note: "16:9 is preferred. Publisher crops vary by site; the stricter 600 × 400 minimum is used.",
    source: src.taboola,
  }),
  place({
    id: "linkedin-single-image",
    formatId: "linkedin-single-image",
    network: "linkedin",
    name: "Sponsored single image",
    accepts: [
      size("1.91:1", [1200, 628], [640, 360]),
      size("1:1", [1200, 1200], [360, 360]),
      size("4:5", [720, 900], [360, 640]),
    ],
    copyFields: [
      field("body", "Introductory text", { limit: 3000, truncatesAt: 150, required: false }),
      field("headline", "Headline", { limit: 200, truncatesAt: 70, required: true }),
      field("description", "Description", { limit: 300, truncatesAt: 100, required: false }),
    ],
    media: "required",
    destination: true,
    source: src.linkedinSingle,
  }),
  place({
    id: "linkedin-carousel-card",
    formatId: "linkedin-carousel",
    network: "linkedin",
    name: "Carousel card",
    accepts: [size("1:1", [1080, 1080], [1080, 1080])],
    copyFields: [
      field("body", "Introductory text", { limit: 255, truncatesAt: 150, required: false }),
      field("headline", "Card headline", { required: true }),
    ],
    media: "required",
    destination: true,
    note: "One card of 2–10. LinkedIn shows two lines of card headline; no character limit is published.",
    source: src.linkedinCarousel,
  }),
  ...assignmentSurfaces.map((s) => {
    const { id, name, width, height, category, note, source, ...template } = s;
    return place({
      id: `assignment-${id}`,
      formatId: "assignment-surface",
      network: "assignment",
      name,
      accepts: [size(`${width}×${height}`, [width, height], [width, height])],
      copyFields: [],
      media: "optional",
      surface: template as SurfaceTemplate,
      destination: false,
      note,
      source: source ?? "",
    });
  }),
];

export const formatById = new Map(formats.map((f) => [f.id, f]));
export const objectiveById = new Map(objectives.map((o) => [o.id, o]));
