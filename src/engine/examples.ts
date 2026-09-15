// Example-ad library: editable starting points, two per goal. Fictional brands.
// Plain data built on the model's defaults; every example resolves through the same engine
// as user-created ads, using only existing Appearance fields (no example-specific layout).
// The original `sample` export is left unchanged for engine fixtures.
// Images: Voxora reuses the headphone asset; six use generated photos in public/examples;
// Open Shelf is text-only by design. See docs/examples.md.
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
  Partial<
    Pick<
      CreativeData,
      | "buttonText"
      | "buttonSize"
      | "buttonRadius"
      | "focalX"
      | "focalY"
      | "composition"
      | "imageShare"
      | "panelColor"
      | "imageFit"
      | "textStyles"
      | "decoration"
    >
  >;

/** A complete creative from shared defaults; text-only unless an image is given. */
const example = (
  goal: Goal,
  copy: Pick<CreativeData, "brand" | "headline" | "offer" | "cta"> & Partial<Pick<CreativeData, "supporting">>,
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
    // Product-led: a dominant product region on warm mustard, strong headline and offer.
    creative: example(
      "Sales",
      { brand: "DAYFORM", headline: "Everyday. Upgraded.", offer: "20% off essentials", supporting: "This weekend only", cta: "Shop Now" },
      {
        background: "#f0b537",
        foreground: "#1d1a14",
        accent: "#1d1a14",
        buttonRadius: 10,
        focalX: 55,
        focalY: 55,
        composition: "product",
        imageShare: 52,
        textStyles: { brand: { weight: 600 }, headline: { size: 0.8 }, supporting: { weight: 400 } },
      },
      "/examples/dayform-accessories.jpg",
    ),
  },
  {
    id: "leads-tidyday-quote",
    name: "Home-cleaning quote",
    goal: "Leads",
    // Photo and panel: the room photo with the copy on a solid forest-green panel.
    creative: example(
      "Leads",
      { brand: "TIDYDAY", headline: "A clean home. A clear mind.", supporting: "Make room for what matters.", offer: "Get your free cleaning quote", cta: "Get Quote" },
      {
        background: "#1f3d2c",
        foreground: "#f4efe3",
        accent: "#f4efe3",
        buttonText: "#1f3d2c",
        buttonRadius: 10,
        focalX: 60,
        focalY: 62,
        composition: "panel",
        imageShare: 50,
        panelColor: "#1f3d2c",
        textStyles: {
          brand: { weight: 400 },
          headline: { size: 0.6 },
          supporting: { weight: 400 },
          offer: { weight: 400, size: 0.75 },
        },
      },
      "/examples/tidyday-living-room.jpg",
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
      { background: "#1f1d2b", foreground: "#f6f2ea", accent: "#ff8a5b", buttonSize: "large", buttonRadius: 4, focalX: 50, focalY: 62 },
      "/examples/movewell-fitness.jpg",
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
      { background: "#5b3a24", foreground: "#fbefe2", accent: "#f2c48d", buttonRadius: 40, focalX: 56, focalY: 58 },
      "/examples/morning-fold-coffee.jpg",
    ),
  },
  {
    id: "awareness-open-shelf-reading",
    name: "Community reading initiative",
    goal: "Awareness",
    // Typographic: large ivory serif headline on navy, gold action, and a separate,
    // replaceable book illustration as optional decoration. No photograph.
    creative: example(
      "Awareness",
      { brand: "OPEN SHELF", headline: "Open a book. Open a world.", offer: "Find your next story.", cta: "Learn More" },
      {
        background: "#14213d",
        foreground: "#f5efe6",
        accent: "#d9a84e",
        buttonText: "#14213d",
        buttonRadius: 40,
        composition: "type",
        imageShare: 60,
        decoration: "/examples/open-shelf-book.svg",
        textStyles: {
          brand: { weight: 400 },
          headline: { font: "serif", weight: 400, size: 1.25 },
          offer: { weight: 400, size: 0.8 },
        },
      },
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
      { background: "#d9eaf6", foreground: "#0f2a44", accent: "#e76f51", buttonRadius: 40, focalX: 50, focalY: 53 },
      "/examples/weekend-notes-travel.jpg",
    ),
  },
  {
    id: "traffic-small-space-workspace",
    name: "Workspace article",
    goal: "Consideration",
    // Editorial minimal: white ground, black text, small square button.
    creative: example(
      "Consideration",
      { brand: "SMALL SPACE", headline: "Make room for better work.", offer: "Ideas for a calmer desk", cta: "Read More" },
      { background: "#ffffff", foreground: "#161616", accent: "#161616", buttonSize: "small", buttonRadius: 0, focalX: 50, focalY: 45 },
      "/examples/small-space-desk.jpg",
    ),
  },
];

/** An independent, editable copy: edits never reach the library definition. */
export const exampleCopy = (ex: ExampleAd): CreativeData => structuredClone(ex.creative);
