// Example-ad library: editable starting points, two per goal. Fictional brands.
// Plain data built on the model's defaults; every example resolves through the same engine
// as user-created ads, using only existing Appearance fields (no example-specific layout).
// The original `sample` export is left unchanged for engine fixtures.
// Images: only the existing local headphone asset is used (Voxora). See docs/examples.md.
import { sample, type CreativeData } from "./creativeModel";
import type { Goal } from "./placements";

export interface ExampleAd {
  /** Stable id (never reused for a different example). */
  id: string;
  name: string;
  goal: Goal;
  creative: CreativeData;
}

type Look = Pick<CreativeData, "background" | "foreground" | "accent"> &
  Partial<Pick<CreativeData, "buttonText" | "buttonSize" | "buttonRadius" | "focalX" | "focalY">>;

/** A complete creative from shared defaults; text-only unless an image is given. */
const example = (
  goal: Goal,
  copy: Pick<CreativeData, "brand" | "headline" | "offer" | "cta">,
  look: Look,
  image = "",
): CreativeData => ({
  ...sample,
  ...copy,
  image,
  goal,
  useGoalPriorities: true,
  buttonText: "",
  buttonSize: "medium",
  buttonRadius: 8,
  focalX: 50,
  focalY: 50,
  ...look,
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
    // Bold retail look: saturated ground, square corners, large button.
    creative: example(
      "Sales",
      { brand: "DAYFORM", headline: "Everyday favourites, for less.", offer: "Save 20% this weekend", cta: "Shop Now" },
      { background: "#f4d35e", foreground: "#1d1a14", accent: "#1d1a14", buttonSize: "large", buttonRadius: 0 },
    ),
  },
  {
    id: "leads-tidyday-quote",
    name: "Home-cleaning quote",
    goal: "Leads",
    // Fresh and friendly: mint ground, pill button.
    creative: example(
      "Leads",
      { brand: "TIDYDAY", headline: "Come home to clean.", offer: "Get a free cleaning quote", cta: "Get Quote" },
      { background: "#dff1ea", foreground: "#133b35", accent: "#133b35", buttonRadius: 40 },
    ),
  },
  {
    id: "leads-movewell-consultation",
    name: "Fitness consultation",
    goal: "Leads",
    // Energetic: dark ground with a bright coral action.
    creative: example(
      "Leads",
      { brand: "MOVEWELL", headline: "Train for the life you live.", offer: "Book a free intro session", cta: "Book Now" },
      { background: "#1f1d2b", foreground: "#f6f2ea", accent: "#ff8a5b", buttonSize: "large", buttonRadius: 4 },
    ),
  },
  {
    id: "awareness-morning-fold-coffee",
    name: "Coffee brand introduction",
    goal: "Awareness",
    // Warm roast brown with a soft cream pill.
    creative: example(
      "Awareness",
      { brand: "MORNING FOLD", headline: "A slower, better morning.", offer: "Meet your everyday coffee", cta: "Learn More" },
      { background: "#5b3a24", foreground: "#fbefe2", accent: "#f2c48d", buttonRadius: 40 },
    ),
  },
  {
    id: "awareness-open-shelf-reading",
    name: "Community reading initiative",
    goal: "Awareness",
    // Deliberately text-only: strong dark palette, small square button.
    creative: example(
      "Awareness",
      { brand: "OPEN SHELF", headline: "More stories. More possibilities.", offer: "A community built around books", cta: "Learn More" },
      { background: "#14213d", foreground: "#f5efe6", accent: "#e0b15a", buttonSize: "small", buttonRadius: 0 },
    ),
  },
  {
    id: "traffic-weekend-notes-guide",
    name: "Weekend travel guide",
    // "Traffic" in the UI is the existing Consideration goal.
    goal: "Consideration",
    // Airy sky blue with a sunset-orange pill.
    creative: example(
      "Consideration",
      { brand: "WEEKEND NOTES", headline: "Your next weekend starts here.", offer: "Five easy getaway ideas", cta: "Read More" },
      { background: "#d9eaf6", foreground: "#0f2a44", accent: "#e76f51", buttonRadius: 40 },
    ),
  },
  {
    id: "traffic-small-space-workspace",
    name: "Workspace article",
    goal: "Consideration",
    // Editorial minimal: white ground, black text, small square button.
    creative: example(
      "Consideration",
      { brand: "SMALL SPACE", headline: "Make room for better work.", offer: "A guide to a calmer workspace", cta: "Read More" },
      { background: "#ffffff", foreground: "#161616", accent: "#161616", buttonSize: "small", buttonRadius: 0 },
    ),
  },
];

/** An independent, editable copy: edits never reach the library definition. */
export const exampleCopy = (ex: ExampleAd): CreativeData => structuredClone(ex.creative);
