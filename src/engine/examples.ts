// Example-ad library: editable starting points, two per goal. Fictional brands.
// Plain data built on the model's defaults; every example resolves through the same engine
// as user-created ads. The original `sample` export is left unchanged for engine fixtures.
import { sample, type CreativeData } from "./creativeModel";
import type { Goal } from "./placements";

export interface ExampleAd {
  /** Stable id (never reused for a different example). */
  id: string;
  name: string;
  goal: Goal;
  creative: CreativeData;
}

/** A complete creative from shared defaults; text-only unless an image is given. */
const example = (
  goal: Goal,
  copy: Pick<CreativeData, "brand" | "headline" | "offer" | "cta">,
  palette: Pick<CreativeData, "background" | "foreground" | "accent">,
  image = "",
): CreativeData => ({
  ...sample,
  ...copy,
  ...palette,
  image,
  goal,
  useGoalPriorities: true,
  buttonText: "",
  buttonSize: "medium",
  buttonRadius: 8,
  focalX: 50,
  focalY: 50,
  focalOverrides: {},
  destination: "",
  body: "",
  longHeadline: "",
  description: "",
});

export const exampleAds: readonly ExampleAd[] = [
  {
    id: "sales-voxora-headphones",
    name: "Voxora headphones",
    goal: "Sales",
    creative: example(
      "Sales",
      { brand: "VOXORA", headline: "Sound without limits.", offer: "From $129", cta: "Shop Now" },
      { background: sample.background, foreground: sample.foreground, accent: sample.accent },
      sample.image,
    ),
  },
  {
    id: "sales-dayform-essentials",
    name: "Everyday essentials sale",
    goal: "Sales",
    creative: example(
      "Sales",
      { brand: "DAYFORM", headline: "Everyday favourites. Better prices.", offer: "Save 20% this weekend", cta: "Shop Now" },
      { background: "#fbf6ee", foreground: "#2b2623", accent: "#1f5f4a" },
    ),
  },
  {
    id: "leads-tidyday-quote",
    name: "Home-cleaning quote",
    goal: "Leads",
    creative: example(
      "Leads",
      { brand: "TIDYDAY", headline: "Come home to a cleaner space.", offer: "Get a free cleaning quote", cta: "Get Quote" },
      { background: "#eef4f3", foreground: "#1d3b3a", accent: "#2f6f73" },
    ),
  },
  {
    id: "leads-movewell-consultation",
    name: "Fitness consultation",
    goal: "Leads",
    creative: example(
      "Leads",
      { brand: "MOVEWELL", headline: "Build a routine that fits your life.", offer: "Book a free introductory consultation", cta: "Book Now" },
      { background: "#f4efe9", foreground: "#2a2522", accent: "#a63d26" },
    ),
  },
  {
    id: "awareness-morning-fold-coffee",
    name: "Coffee brand introduction",
    goal: "Awareness",
    creative: example(
      "Awareness",
      { brand: "MORNING FOLD", headline: "A little pause. A better morning.", offer: "Meet your everyday coffee", cta: "Learn More" },
      { background: "#f3ebe0", foreground: "#3a2a20", accent: "#6b4a33" },
    ),
  },
  {
    id: "awareness-open-shelf-reading",
    name: "Community reading initiative",
    goal: "Awareness",
    creative: example(
      "Awareness",
      { brand: "OPEN SHELF", headline: "More stories. More possibilities.", offer: "Discover a community built around books", cta: "Learn More" },
      { background: "#1f2a37", foreground: "#f5efe6", accent: "#e0b15a" },
    ),
  },
  {
    id: "traffic-weekend-notes-guide",
    name: "Weekend travel guide",
    // "Traffic" in the UI is the existing Consideration goal.
    goal: "Consideration",
    creative: example(
      "Consideration",
      { brand: "WEEKEND NOTES", headline: "Your next weekend starts here.", offer: "Explore five easy getaway ideas", cta: "Read More" },
      { background: "#eaf1f7", foreground: "#1c2d3f", accent: "#2c5d8f" },
    ),
  },
  {
    id: "traffic-small-space-workspace",
    name: "Workspace article",
    goal: "Consideration",
    creative: example(
      "Consideration",
      { brand: "SMALL SPACE", headline: "Make room for better work.", offer: "Read our guide to a calmer workspace", cta: "Read More" },
      { background: "#f2f2ee", foreground: "#262a24", accent: "#4a5a3a" },
    ),
  },
];

/** An independent, editable copy: edits never reach the library definition. */
export const exampleCopy = (ex: ExampleAd): CreativeData => structuredClone(ex.creative);
