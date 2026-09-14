# Creative-first planner — supplied specification

Recorded for review on 14 September 2026. This file preserves the supplied main specification and Addenda A–E in order. Later addenda override earlier documents: E > D > C > B > A > main specification. Recording this brief does not start application implementation. The step-2 human review checkpoint remains part of the brief.

Review status: complete. Addendum E defines the optional-media contracts (nullable image input, required-element settings, text-only export, status precedence, and the meaning of `media`). Text-only network formats remain subject to the B10 verification gate. A one-page summary of all decisions is in [DECISIONS.md](DECISIONS.md).

---

## Main specification

Spec: Creative-First Multi-Placement Planner (images only, with optional animation)
0. Context
Repo: FLAM AI  SDE Intern 2.0 (Frontend R&D)/adaptive-ad-layout-engine (Vite + React + TypeScript, Vitest, Supabase optional).

What exists and must be preserved:

src/engine/spec.ts: AdSpec, ElementSpec, Role (primary | secondary | hero | action | branding), Priority 1–5 (1 = most important), defineAd, validateSpec.
src/engine/surfaces.ts: Surface (size, safeArea insets, minTextSize, minContrast, viewingDistance, input + minTapTarget), defineSurface, validateSurface.
src/engine/resolver.ts: resolve(spec, surface, measure) → ResolvedLayout with status ready | adapted | invalid | impossible, degradation ladder, arrangements (stack / gallery / split / strip), explanations.
src/render/dom.ts and src/render/canvas.ts: both render the same ResolvedLayout.
src/lib/creative.ts: Creative editor model + toSpec().
src/lib/data.ts: surface presets (4 required assignment surfaces, stress, IAB, social, custom).
src/engine/placements.ts + src/components/CreativePlanner.tsx + src/lib/assetInfo.ts: the current planner (10 placements, single size each, image + video).
Hard rules from the assignment (do not violate):

The engine folder (src/engine/*) imports nothing from React, the DOM, or src/lib.
No placement-name or network-name branches in the resolver. Placements are data; the resolver only sees Surface + AdSpec.
No CSS breakpoints or uniform scaling as a substitute for layout resolution.
All valid layouts must still pass geometryErrors (inside safe area, no overlap, text ≥ min, CTA ≥ tap target).
Do not claim platform approval. All outputs are "planning" checks. Keep the existing disclaimers.
1. Product goal
The user uploads one static image and writes one set of copy. The app immediately generates every supported placement across Meta, Google, Taboola, LinkedIn, TikTok, plus the 4 assignment surfaces. It shows the fit status, the composed layout or crop, the checks, and the export for each. Goal and network choices re-rank, tag and filter the view; they never limit what is generated.

2. Scope
In scope

Static images only: PNG, JPEG, WebP.
Multiple accepted aspect ratios per placement.
Objective taxonomy: universal goal → per-network objective → format → placement.
Goal-driven element priorities (the same resolver produces different layouts per goal).
Per-field copy limits.
Per-placement safe-area surfaces.
Batch PNG export and plan JSON export.
Optional priority-ordered entrance animation (preview + WebM export).
Out of scope (remove or leave out)

Uploaded video support. Remove it (see §10, Phase 1).
Catalog / product-feed ads, lead forms, messaging ads, app-install setup, Masthead, Local Services Ads. These appear in the taxonomy as buildable: false with the label "Needs network setup: outside creative scope".
Ad-network API integration, bidding, targeting, analytics.
OCR / text-in-image detection.
3. Data model
Create src/engine/catalog/ (pure data + types; no React/DOM imports). Replace src/engine/placements.ts with the modules below. Keep a re-export shim if other files import from it.

3.1 Goals and networks

// src/engine/catalog/types.ts
export type Goal = "Awareness" | "Consideration" | "Leads" | "Sales";
export const goals: readonly Goal[] = ["Awareness", "Consideration", "Leads", "Sales"];

export type NetworkId = "meta" | "google" | "taboola" | "linkedin" | "tiktok" | "assignment";

export interface Network {
  id: NetworkId;
  name: string;               // "Meta", "Google", ...
  ctaOptions: readonly string[]; // network-specific CTA vocabulary
}
3.2 Network objectives (translation layer)

export interface NetworkObjective {
  id: string;                 // "meta-sales"
  network: NetworkId;
  name: string;               // platform's own term, e.g. "Sales", "Online purchases"
  goal: Goal;                 // which universal goal it maps to
  source: string;             // official doc URL
  verifiedAt: string;         // ISO date, e.g. "2026-09-14"
}
Starting mapping (verify every name against official docs before committing; put the URL and date in source / verifiedAt):

Goal	Meta	Google	Taboola	LinkedIn	TikTok
Awareness	Awareness	Awareness and consideration (Display / Demand Gen)	Brand awareness / Reach	Brand awareness	Reach
Consideration	Traffic; Engagement	Website traffic (Demand Gen / Display)	Website traffic	Website visits; Engagement	Traffic
Leads	Leads	Leads (Performance Max / Display)	Leads	Lead generation	Lead generation
Sales	Sales	Sales (Performance Max / Display)	Online purchases	Website conversions	Sales
Mark the "Google" column as approximate in the UI note, because Google campaign types don't map 1:1 to objectives.

3.3 Formats

export type Container =
  | "In-feed" | "Vertical" | "Recommendation" | "Multi-asset" | "Display" | "Carousel" | "Assignment";

export type Assembly =
  | "composed"          // we control geometry: resolver lays out text over/around image
  | "platform";         // network renders its own headline/CTA; we supply cropped image + copy fields

export interface Format {
  id: string;                     // "meta-single-image"
  network: NetworkId;
  name: string;                   // "Single image ad"
  container: Container;
  assembly: Assembly;
  objectives: readonly string[];  // NetworkObjective ids this format is available under
  buildable: boolean;             // false => show greyed with "Needs network setup"
  unbuildableReason?: string;
  requiredRoles?: readonly Role[];// e.g. Sales formats require an offer/price element
  source: string;
  verifiedAt: string;
}
Include non-buildable formats from the discussion so the taxonomy is complete: Meta Instant Forms, Meta Advantage+ catalog, Meta Collection, Meta click-to-message, Google Shopping, Google responsive search ads (text only: buildable: true only if you implement a text-only preview, otherwise false), Google App campaigns, YouTube Masthead, Local Services Ads, Taboola dynamic retargeting, LinkedIn Lead Gen Forms, LinkedIn Conversation/Message ads, LinkedIn Document ads, LinkedIn Job ads, Thought Leader ads.

3.4 Placements

export interface AcceptedSize {
  ratio: number;             // width / height, e.g. 0.8 for 4:5
  label: string;             // "4:5"
  recommended: { width: number; height: number };
  minimum: { width: number; height: number };
  tolerance?: number;        // relative ratio tolerance, default 0.02
}

export interface CopyField {
  key: "headline" | "longHeadline" | "description" | "body" | "brand" | "cta";
  label: string;             // platform's own name, e.g. "Primary text"
  limit?: number;            // characters (use Array.from(str).length)
  truncatesAt?: number;      // visible-before-"more" guideline, warning not error
  required: boolean;
}

export interface Placement {
  id: string;                       // "meta-feed"
  formatId: string;
  network: NetworkId;
  name: string;                     // "Facebook & Instagram feed"
  accepts: readonly AcceptedSize[]; // at least one
  copyFields: readonly CopyField[];
  /** Constraints for the resolver; required when format.assembly === "composed",
   *  and used for safe-zone linting on platform-assembled vertical placements. */
  surface: SurfaceTemplate;
  note?: string;                    // info, NOT counted as an issue
  source: string;
  verifiedAt: string;
}

/** Surface minus width/height; size comes from the chosen AcceptedSize. */
export type SurfaceTemplate = Omit<Surface, "id" | "name" | "width" | "height">;
Surface dimensions must be ≤ 2400 px (validateSurface). For 1080×1920 placements either keep them (valid) or render at recommended size and export at that size. Do not relax validation silently; if a placement needs more, raise the limit deliberately and add a test.

Safe areas for vertical placements (Stories, TikTok image) must encode the UI overlays as insets (top bar, bottom caption/CTA, right action rail for TikTok). Take the values from official safe-zone guidance and record the source.

The 4 assignment surfaces (portrait, landscape, broadcast, kiosk) become placements with network: "assignment", assembly: "composed", one AcceptedSize matching their existing dimensions, reusing their existing surface data from src/lib/data.ts. They must always be generated.

3.5 Initial placement catalog (image only)
Minimum set. Verify every dimension, ratio and limit against the linked official docs; do not trust these numbers blindly.

id	Network	Format	Assembly	Accepted ratios	Key copy limits
meta-feed	Meta	Single image	platform	1:1, 4:5, 1.91:1	Primary text 125 truncation, headline ~40 guideline
meta-stories	Meta	Stories image	composed	9:16	safe zones top/bottom
meta-right-column	Meta	Right column	platform	1.91:1, 1:1	headline
meta-carousel-card	Meta	Carousel card	platform	1:1	per-card headline; note "add more cards"
google-rda-landscape	Google	Responsive display	platform	1.91:1	headline 30, long headline 90, description 90
google-rda-square	Google	Responsive display	platform	1:1	same
google-300x250	Google	Display banner	composed	300×250 fixed	none (text in creative)
google-728x90	Google	Display banner	composed	728×90	—
google-160x600	Google	Display banner	composed	160×600	—
google-320x50	Google	Display banner	composed	320×50	— (stress case)
google-pmax-landscape / -square / -portrait	Google	Performance Max asset	platform	1.91:1 / 1:1 / 4:5	headline 30, long 90, description 90
google-demandgen	Google	Demand Gen image	platform	1.91:1, 1:1, 4:5	headline 40, description 90 (verify)
taboola-recommendation	Taboola	Native recommendation	platform	16:9 (verify)	title limit (verify), branding
taboola-direct-offer	Taboola	Direct-to-offer	platform	16:9 / 1:1 (verify)	title, CTA
linkedin-single-image	LinkedIn	Single image	platform	1.91:1, 1:1, 4:5 (verify)	intro text ~150 truncation, headline ~70
linkedin-carousel-card	LinkedIn	Carousel card	platform	1:1	card headline
tiktok-image	TikTok	Image ad (verify availability)	composed	9:16	safe zones incl. right rail
assignment-*	Assignment	—	composed	existing 4 surfaces	—
4. Goal-driven priorities
Add src/engine/catalog/goalPriorities.ts:


export const goalPriorities: Record<Goal, Record<Role, Priority>> = {
  Awareness:     { hero: 1, primary: 1, branding: 2, action: 3, secondary: 4 },
  Consideration: { primary: 1, hero: 2, action: 2, secondary: 3, branding: 4 },
  Leads:         { primary: 1, action: 1, hero: 2, secondary: 3, branding: 4 },
  Sales:         { secondary: 1, action: 1, primary: 2, hero: 2, branding: 4 }, // secondary = price/offer
};
Add a creative-level toggle "Use goal priorities" (default on). When on, toSpec() takes priorities from this table; when off, it uses the user's manual priorities as today.
The required flags stay controlled by the user (headline and CTA required by default).
The resolver is not changed. Only the spec it receives changes.
A test must show that the same creative + same surface gives different decisions under Awareness vs Sales on a constrained surface, e.g. branding or price dropped differently.
5. Generation pipeline (pure functions)
Create src/engine/catalog/plan.ts:


export type FitStatus = "Ready" | "Needs crop" | "Unsupported";

export interface Issue {
  severity: "error" | "warning" | "info";
  field?: CopyField["key"] | "image" | "destination";
  message: string;       // actionable: what is wrong + how to fix
}

export interface PlacementPlan {
  placement: Placement;
  format: Format;
  objectives: NetworkObjective[];       // objectives this placement serves
  recommendedForGoal: boolean;          // any objective.goal === current goal
  chosenSize: AcceptedSize | null;      // best match, null when unsupported
  fit: FitStatus;
  retainedArea: number;                 // 0..1 after crop
  crop: { x: number; y: number; width: number; height: number } | null; // source-pixel rect using focal point
  layout: ResolvedLayout | null;        // composed placements only
  issues: Issue[];                      // copy/destination/safe-area/contrast/resolution
  notes: string[];                      // info-only (placement.note), never affects status
}

export function planAll(input: {
  image: { width: number; height: number };
  creative: Creative;          // pass a plain-data projection, not a React type, to keep engine pure
  goal: Goal;
  destination: string;
  measure: Measure;
}): PlacementPlan[];
Algorithm per placement:

Buildable check. If format.buildable === false, return a plan with fit: "Unsupported", no layout, and issues = [{ severity: "info", message: format.unbuildableReason }]. The UI greys it out.
Pick size. For each AcceptedSize, compute retained = min(src/target, target/src). Choose the highest retained; tie → larger recommended area.
Fit status:
Ready: ratio within tolerance and source ≥ minimum size.
Needs crop: a crop to the chosen ratio still meets minimum.
Unsupported: even the best crop is below minimum. Issue: "Source is W×H; this placement needs at least …".
Crop rect. Cover-crop centred on creative.focal (reuse the canvas renderer's focal math; extract it into a shared pure helper if needed).
Layout (composed only). Build the Surface from placement.surface + chosenSize.recommended with id: placement.id, run resolve(toSpec(creative, goal), surface, measure). Map invalid / impossible to error issues carrying the resolver's reasons.
Copy checks. For each copyField: missing and required → error; over limit → error ("Shorten headline to 30 characters: currently 41"); over truncatesAt → warning.
Destination. Reuse validDestination; invalid → error.
Required roles. If the format requires a role the creative lacks (e.g. Sales requires an offer) → warning.
Platform-assembled vertical placements. No text is drawn by us; add an info note to keep key image content inside the safe area, and show the overlay.
recommendedForGoal = objectives.some(o => o.goal === goal).
fit reflects only geometry/resolution. Copy issues live in issues and never change fit. notes never count as issues. This fixes the current bug where any placement with extra can never show "Fits".

Performance: planAll must stay responsive for ~35 placements. Memoise per placement on (image dims, creative hash, goal, destination). Recompute on input with a ~150 ms debounce. Add a benchmark case to tests/resolver.bench.ts for planAll and report the real number in VERIFICATION.md. Do not invent numbers.

6. UI (CreativePlanner.tsx, split into smaller components)
Suggested components under src/components/planner/: IntakePanel, GoalBar, PlacementMatrix, PlacementCard, ComparePanel, ExportBar, NativeMockup.

6.1 Layout

[ Intake panel ]  |  [ Goal bar: Goal ▾ · Group by (Network | Goal | Size | Status) · Network chips · Status chips · "Show only recommended" toggle ]
                  |  [ Summary: 34 placements · 18 Ready · 9 Needs crop · 7 Unsupported · 5 recommended for Sales ]
                  |  [ Matrix: grouped cards ]
                  |  [ Compare panel: selected placements side by side ]
                  |  [ Export bar ]
6.2 Behaviour rules
Everything is generated on load using the sample creative. No empty state and no login required.
Goal re-ranks (recommended first within each group), adds a ★ "Recommended for {goal}" badge, changes element priorities (§4) and default CTA. Non-recommended cards stay visible with a muted tag listing the goals they do serve.
Network chips are view filters only ("All" default). They never trigger regeneration.
Group by:
Network → sections per network, then Assignment surfaces.
Goal → a section per goal listing placements whose objectives map to it. A placement can appear in several sections (this is the objective taxonomy view).
Size → 9:16, 4:5, 1:1, 1.91:1/16:9, fixed IAB, assignment.
Status → Ready, Needs crop, Unsupported.
Non-buildable formats: greyed card, "Needs network setup", link to source. They are excluded from the counts unless the "Show setup-only formats" toggle is on.
Selection: checkbox per card, no hard cap (the current limit of 3 is removed); the compare panel scrolls horizontally.
6.3 Placement card
Network · format · container, placement name.
Thumbnail:
Composed: renderDom of the ResolvedLayout, scaled to fit.
Platform-assembled: NativeMockup showing the cropped image + the network's native headline/CTA chrome.
Chosen size (e.g. "4:5 · 1080×1350"), fit badge, retained area %.
Issues list (errors first, then warnings), then notes (info, collapsed).
Actions: "Open in layout studio" (composed only, existing flow), "Download PNG".
6.4 Mockups
One mockup per container type at minimum (In-feed, Vertical with safe-zone overlay from placement.surface.safeArea, Recommendation widget grid, Display banner = the resolved layout itself). Label all mockups "Illustrative preview; the platform supplies its own interface."

6.5 Accessibility
Keyboard-reachable chips and cards.
aria-pressed on toggles.
aria-live summary counts.
Colour is not the only indicator of status (icon + text).
7. Optional animation (Phase 5)
Model: animation is a presentation layer over a ResolvedLayout. It never changes final geometry.


// src/render/animation.ts  (no React)
export type AnimationPreset = "none" | "fade" | "slide-up" | "pop-cta";
export interface AnimationPlan {
  preset: AnimationPreset;
  durationMs: number;            // total, default 2400
  steps: { elementId: string; startMs: number; endMs: number;
           from: { opacity: number; dx: number; dy: number; scale: number } }[];
}
export function planAnimation(layout: ResolvedLayout, spec: AdSpec, preset: AnimationPreset): AnimationPlan;
export function frameAt(layout: ResolvedLayout, plan: AnimationPlan, tMs: number): ResolvedLayout; // interpolated copy
Rules:

Order elements by priority ascending (1 first), then by reading order; stagger ~250 ms each.
Animate only opacity, translation and scale ≤ 1.0 around the element's own box. At t = durationMs, frameAt must return geometry identical to the input layout (test this).
Intermediate frames may not move an element outside the surface bounds (clamp dx/dy; test it).
prefers-reduced-motion: preview shows the final frame only; export still available on explicit click.
Preview: DOM with CSS transforms driven by frameAt, or canvas requestAnimationFrame.
Export: render frames via renderCanvas(frameAt(...)) onto a canvas, capture with canvas.captureStream() + MediaRecorder (video/webm). Feature-detect and hide the button if unsupported.
Per-creative setting animation: AnimationPreset (default "none"), persisted with the creative.
Do not claim GIF/HTML5 network compliance. If GIF export is added later, add network animation-length limits as data with sources.
8. Export and persistence
Batch PNG export: for selected placements (default: all Ready + Needs crop):
composed → renderCanvas(layout) at surface pixel size;
platform → the cropped source image at chosenSize.recommended.
Filename {network}-{placementId}-{w}x{h}.png.
Package as a zip (add a small dependency such as fflate, or fall back to sequential downloads).
Plan JSON v2: { version: 2, createdAt, scope disclaimer, goal, destination, creative (copy, focal, priorities, animation), image: { width, height }, placements: PlacementPlan without layout boxes (include status, chosenSize, issues, notes, selected) }. Keep the reader able to import v1 (ignore video fields).
Persistence: extend parseProject to accept the new creative fields (goal, useGoalPriorities, animation, destination, body, longHeadline, description). Unknown or missing values fall back to defaults. Planner settings move from the separate omniframe:planner:v1 key into the project, with a one-time migration.
9. Creative model changes (src/lib/creative.ts)
Add: body (primary text), longHeadline, description, destination, goal, useGoalPriorities, animation. toSpec(creative, goal?) applies §4 priorities when enabled. Copy fields map onto placements' copyFields by key. The layout spec continues to use headline / price / CTA / brand / image.

10. Phases (commit after each; keep the build and tests green)
Remove video.
Delete video placements, MediaKind/duration, video upload and <video> UI.
Accept only PNG/JPEG/WebP; simplify assetInfo.ts to images.
Update README with one line: "Video placements are out of scope; the engine composes static creatives."
Catalog + multi-size + three-way status.
Types, data, planAll steps 1–4 and 6–10 (no layout yet), notes separate from issues.
Replace the matrix UI; generate all placements; add chips / group-by / goal re-ranking.
Placement surfaces.
Add surface templates and composed-placement resolution (step 5).
Merge the 4 assignment surfaces into the catalog; add the safe-zone overlays from data.
Goal priorities + copy fields. §4 and §9, including the Awareness-vs-Sales test.
Export. Batch PNG, plan JSON v2, persistence migration.
Animation. §7, preview first, then WebM export.
Docs.
Update ARCHITECTURE.md with the catalog module and taxonomy diagram Goal → Network objective → Format → Placement → Surface → ResolvedLayout.
Update README "things to try" and VERIFICATION.md with real measured results.
11. Tests (Vitest)
Catalog integrity:
unique ids;
every placement's formatId exists;
every format's objective ids exist;
every buildable composed placement's surface passes validateSurface for each accepted size;
every entry has source + verifiedAt.
Size selection: 1080×1350 on meta-feed → Ready, 4:5. 1080×1080 on 9:16 Stories → Needs crop with correct retained area. 300×300 on a 1200×628-minimum placement → Unsupported.
Status independence: a missing headline does not change fit; a placement with note can be Ready.
Copy limits: grapheme counting via Array.from; limit → error, truncatesAt → warning.
Goal ranking: changing goal changes recommendedForGoal and never changes the count of generated plans.
Goal priorities: the Awareness vs Sales test on a constrained surface (e.g. google-320x50) produces different decisions.
Resolver untouched: existing engine.test.ts, types.test.ts and database.test.ts still pass. The renamed-surface determinism test still holds for placement-derived surfaces.
Animation: final frame equals the input layout; all frames inside surface bounds; reduced-motion path returns the final frame.
Persistence: v1 plan/project imports without error; the new fields round-trip.
Browser check: extend scripts/verify-browser.ts to load the planner, assert the placement count > 30, switch goal and assert that the order changes but the count doesn't, and export one PNG.
12. Acceptance criteria
On first load, without login or upload, all placements (≥ 30) render with status, preview and issues.
Changing the goal re-orders and re-badges placements and visibly recomposes composed layouts; nothing disappears.
Network chips and group-by only change the view.
A 4:5 image shows Meta Feed as Ready (not "needs crop").
Fit status never depends on copy or notes.
Non-buildable formats are visible (behind a toggle) with a clear reason.
Composed placements use the existing resolver with no placement-specific code; all pass geometryErrors.
Batch export produces correctly sized PNGs that match the on-screen layouts.
Animation (if enabled) ends on the exact resolved layout and respects reduced motion.
npm run build, npm test and the browser verification pass. The docs are updated with real results and an honest note on AI use.
13. Guardrails for Codex
Verify every platform dimension, ratio, copy limit and objective name against the official source before adding it. If it can't be verified, mark the entry buildable: false or leave it out. Never guess silently.
Don't modify resolver.ts unless a phase explicitly requires it. If you must, explain why in the commit message and add tests.
Keep engine modules pure (no React/DOM/src/lib imports).
Don't add conversion or performance claims anywhere in the UI or docs.
Keep commits small and descriptive, one per phase or sub-step.

---

## Addendum A

Implement everything in this addendum as part of the phases above. It overrides the main spec where they conflict. Before implementing, verify each item against the current code and the official platform sources. If something here conflicts with the code or can't be verified, stop and report it instead of guessing.
- No 3D conversion of uploaded images.
- No generative background extension or outpainting in this build.
- AI upscaling: optional, opt-in only, Phase 7 at the earliest (see A5). Don't implement it unless every earlier phase is done and passing.
- In src/lib/creative.ts and the editor UI, rename the product "price" concept to offer.
  - It's free text, max 40 characters.
  - Examples: "$49", "Free webinar", "Download the guide", "Apply by 30 Sept".
  - The layout role stays secondary; keep truncate behaviour unchanged.
- offer is optional. An empty offer means the element is left out of the spec entirely, not rendered empty.
- Persistence: parseProject must map old price values to offer. Add a migration test.
Add to the creative:
```ts
export type CampaignType = "Product" | "Service" | "Brand" | "Event" | "Hiring" | "LeadMagnet";

```
Default is "Product". It only affects:
- the default CTA suggestion (Product → "Shop now", Service → "Contact us", Brand → "Learn more", Event → "Register", Hiring → "Apply now", LeadMagnet → "Download");
- placeholder and helper text in the editor.
It must not change which placements are generated, their order, or their fit status. Add a test for this.
- If goal === "Sales" and the creative has no offer, use the Consideration priority set.
- Record this in the plan's notes: "No offer provided; using Consideration priorities."
- The format-level requiredRoles check for Sales becomes a warning, not an error: "Sales formats usually include an offer (price, discount or incentive)."
A5.1 Focus point per placement
- Add focalOverrides: Record<placementId, { x: number; y: number }> to the creative. Empty by default; validate that each value is 0–100.
- planAll uses the override when one exists, otherwise the creative-level focal point.
- Composed layouts pass the effective focal point into the spec.
- UI: each card with a crop gets "Adjust crop"; it opens focal X/Y sliders on the card and a "Reset to default" action.
A5.2 Crop-loss preview
- On every card with fit === "Needs crop", show the full source image with the area that gets cropped away dimmed, and the kept rectangle outlined.
- Use the crop rect from PlacementPlan; don't recompute it in the component.
A5.3 Resolution warnings
- When the source is below minimum after cropping, the issue must state the numbers: "Source crop is 640×800; this placement needs at least 1080×1350. Upload an image at least 1080 px wide."
- Also add a planner-level summary: "Upload at least W×H to make every placement Ready". Compute it as the smallest source size (at the current aspect ratio) that satisfies every buildable placement's minimum after cropping.
A5.4 Optional upscaling (Phase 7, only if time allows)
- Opt-in button "Try 2× upscale" per creative, never automatic.
- It must run in the browser (no sending the user's image to a third-party service). Load the model lazily, only when clicked.
- Show a before/after comparison before applying.
- Keep the original image. Plans and the UI must mark upscaled results "Upscaled".
- Fit status is always computed from the original upload's resolution. Upscaling must never turn a placement from Unsupported/Needs crop into Ready. Add a test.
- Add the model size, the licence, and the note "upscaling invents detail; review text, logos and faces" to the README.
- Non-product campaign:
  - an Event creative with a lifestyle image, no offer, goal Awareness → every buildable composed placement resolves to ready or adapted (or an impossible with reasons for extreme stress sizes, which you document);
  - no errors come from the missing offer.
- Sales without offer: uses Consideration priorities, produces the note, and gives a warning, not an error.
- Campaign type: changing it changes only the default CTA and helper text; generated plans (ids, order, fit) are identical.
- Focus override:
  - overriding one placement changes only that placement's crop; all others are unchanged;
  - out-of-range values are rejected by validation.
- Minimum upload summary: for a known catalog fixture, the computed recommended size matches a hand-calculated value.
- Migration: old projects with price load as offer.
- Upscaling (if implemented): fit status is unchanged by upscaling.
- A non-product creative (no offer) works across all placements without errors.
- Each crop can be adjusted per placement, and the cropped-away area is visible before export.
- Resolution issues state the exact sizes needed, and the planner shows one "upload at least W×H" recommendation.
- No 3D or outpainting features exist. Upscaling, if present, is opt-in, labelled, and never changes fit status.
After each phase:
1. Run npm run build, npm test, and the browser verification script. Fix any failures before moving on.
2. Update VERIFICATION.md with the actual commands run and their real results. Never write results you didn't observe.
3. In your final report, list:
   - every catalog value you verified, with its source URL;
   - every value you couldn't verify, and how you handled it (left out, or marked buildable: false);
   - any place where you departed from this spec, and why.

---

## Addendum B

Addendum B: Resolutions to review findings
This overrides the main spec and Addendum A where they conflict. Animation (§7) and upscaling (A5.4) are deferred follow-up scope; don't implement them in this pass. The static planner is the deliverable.

B1. Source fit vs. composed layout fit
Replaces §5 steps 3–5 and A5.2 where they conflict.

Platform-assembled placements: crop against the placement's chosen AcceptedSize (as specified). The crop preview and resolution check use that rect.
Composed placements: the relevant crop is the resolved hero image box, not the whole surface.
After resolve(), compute the source crop rect from the hero ResolvedImage box + the effective focal point, using the same pure helper the canvas renderer uses. Extract it to src/engine/crop.ts if it isn't already shared.
The crop preview, retained area and resolution check for composed placements use this rect.
If the hero was omitted, there is no crop; add a note "Image omitted by layout" with the resolver's reason.
Test: for every composed placement in a fixture, the crop rect reported by planAll equals the rect the canvas renderer draws.
B2. Minimum upload recommendation wording
Replaces A5.3's summary and A7's wording.

The text is: "Upload at least W×H to meet every supported crop's minimum resolution. Some placements will still need cropping."
W×H is the smallest source size at the current aspect ratio such that every buildable placement's best feasible crop meets its minimum.
Composed placements use their resolved hero box size from B1. Placements that can never be satisfied at this aspect ratio are excluded from the calculation and listed separately.
B3. Status model: fit vs. layout vs. export
Replaces the single fit semantics in §5. PlacementPlan gets three separate fields:


fit: "Ready" | "Needs crop" | "Unsupported";              // source geometry/resolution only
layoutStatus: "ready" | "adapted" | "invalid" | "impossible" | "n/a"; // composed only; "n/a" for platform
exportable: boolean;
exportKind: "composed-creative" | "image-asset" | null;
Export rules:

Composed: exportable only if fit !== "Unsupported" and layoutStatus is ready or adapted. invalid / impossible → not exportable; the card shows the resolver's reasons.
Platform-assembled: exportable if fit !== "Unsupported". exportKind: "image-asset". The download button and filename say "image asset", with the note "Excludes headline, CTA and platform interface."
Copy errors never block export, but stay visible on the card and in the plan JSON.
Card badges:

fit badge, always shown;
layoutStatus badge, composed only;
an export-disabled reason when not exportable.
B4. Size selection: feasibility first
Replaces §5 step 2.

For each AcceptedSize, compute the best crop at that ratio and check it against minimum.
Keep only the feasible sizes.
From the feasible set, choose the highest retained area; if tied, the larger recommended area; if still tied, catalog order.
Unsupported only when no accepted size is feasible. The issue then names the size that came closest and how much bigger the source must be.
Test: a source where the highest-retention ratio fails its minimum but another ratio passes → the passing ratio is chosen.

B5. Placement count
Replaces "≥ 30" in §12 and the browser-check count in §11.

Remove every arbitrary count.
Acceptance: every placement in the verified catalog is generated and rendered. The browser check asserts that the rendered card count equals catalog.placements.length (plus setup-only formats when that toggle is on), and that the count doesn't change when the goal changes.
Multiple accepted ratios stay within one placement; they don't become separate cards.
B6. Engine purity and module layout
Replaces §3 and §5 references that break the import rule.

Move everything planAll needs into pure engine modules:

New pure module	Contents	Compatibility
src/engine/creativeModel.ts	CreativeData (plain data type: copy fields, offer, campaign type, focal, overrides, priorities, goal settings, theme), toSpec(creative, goal)	src/lib/creative.ts re-exports these and keeps editor-only helpers
src/engine/catalog/assignmentSurfaces.ts	canonical data for the 4 required surfaces	src/lib/data.ts imports them from here
src/engine/crop.ts	cover-crop focal math	src/render/canvas.ts and dom.ts import from here
Also:

SurfaceTemplate must keep the discriminated union:

type SurfaceTemplate =
  | (Omit<SurfaceBase, "id" | "name" | "width" | "height"> & { input: "touch" | "pointer"; minTapTarget: number })
  | (Omit<SurfaceBase, "id" | "name" | "width" | "height"> & { input: "none"; minTapTarget?: never });
Export SurfaceBase from surfaces.ts if needed. Add a @ts-expect-error case to tests/types.test.ts: input: "none" with minTapTarget must not compile.

Add a test (or lint rule) that no file under src/engine/ imports from src/lib, src/components, src/render, react, or DOM globals.
B7. Migration and versioning
Replaces A2's migration line and §8's JSON notes. There are two separate formats:

Project data (localStorage / project JSON, currently version 2) → bump to version 3:

price → offer; priorities.price → priorities.offer.
An offer longer than 40 characters is kept in full; the editor shows a validation error asking the user to shorten it. Never silently truncate. Resolution still validates normally (the spec limit stays 300).
An empty or whitespace price → no offer.
Missing new fields get defaults.
Planner settings from the omniframe:planner:v1 key merge into the project once, and the old key is then removed.
v2 and v1 (legacy forma:) inputs still load. Add tests for each.
Planner report JSON (export-only):

Bump to report version 2, with a kind: "placement-plan-report" field.
It's a report, not a project backup: it contains no media. The app doesn't need to import it.
If import is added, it restores copy/settings only, and shows "The image isn't included in reports. Upload it again." Never claim the project was fully restored.
B8. Animation (deferred)
Keep §7 as a design note only. For the later implementation:

use a separate AnimationFrame type (per-element opacity + transform over an unchanged ResolvedLayout), not a modified ResolvedLayout, because ResolvedLayout has no opacity field and its scale means text shrinking;
both renderers get an optional frame argument;
decoded images are cached for the duration of a recording.
B9. Smaller corrections
Character counting: use Intl.Segmenter (grapheme) where available, and fall back to Array.from (code points). Put this in one helper, countChars(). Wording in the UI and docs: "characters".

CTA precedence (highest first):

the user's explicit choice;
the campaign-type suggestion (A3);
the goal suggestion.
Then, per placement: if the chosen CTA isn't in the network's ctaOptions, show a warning and suggest the closest supported option. Never change the creative's CTA automatically.

Sales-without-offer fallback (A4) applies only when useGoalPriorities is on. With manual priorities, only the warning applies.

Setup-only formats (formats with buildable: false and no placements):

They show as format-level cards in the matrix, hidden by default behind "Show setup-only formats".
They're grouped under their network, and excluded from status counts.
They show no preview, only the reason and the source link.
Browser acceptance checks:

Add Playwright as a dev dependency, a test file tests/e2e/planner.spec.ts, and the command npm run test:e2e, which runs against vite preview.
Keep the existing scripts/verify-browser.ts geometry harness unchanged.
Record the real e2e results in VERIFICATION.md.
B10. Platform verification gate
Treat catalog verification as its own acceptance gate, before Phase 3 UI work.
Deliver docs/catalog-verification.md, listing each placement/format: the values used, the official source URL, the date checked, and a status (verified / unverified / excluded).
Unverified entries don't ship as buildable.
TikTok: don't ship a generic single-image TikTok placement. Image delivery appears to go through Carousel Ads (per official docs). Model it as a TikTok carousel/image format only with verified specs; otherwise buildable: false with that reason.
Apply the same rigour to Taboola title limits and ratios, LinkedIn ratios and copy limits, and Google Demand Gen copy limits.
B11. Revised phase order
Remove video.
B6 module moves + B7 project migration (no behaviour change; all existing tests pass).
Catalog verification gate (B10).
Catalog + feasibility-first size selection (B4) + status model (B3) + matrix UI.
Placement surfaces + composed crop from the hero box (B1).
Goal priorities, offer and campaign type, CTA precedence, copy fields.
Per-placement focus, crop-loss preview, minimum-upload recommendation (B2).
Export (composed creatives + labelled image assets) + report JSON v2.
Playwright e2e + docs.
Deferred follow-up work: animation (B8), upscaling (A5.4).

One thing I'd add from my side: after Codex finishes step 2 (module moves plus migration), check the result yourself before letting it continue. That step moves the most files around, and if it goes wrong, every later phase will be harder to debug

---

## Addendum C

This overrides the main spec and Addenda A and B where they conflict.
For each buildable placement, for each AcceptedSize in catalog order, compute a candidate:
Platform-assembled:
1. cropRect = cover-crop of the source to size.ratio using the effective focal point.
2. feasible = crop dimensions ≥ size.minimum.
3. retained = crop area / source area.
Composed:
1. Build the surface from the template + size.recommended; run resolve().
2. If layoutStatus is invalid / impossible → candidate infeasible; keep the reasons.
3. If the hero is present: cropRect = source crop for the hero box (shared src/engine/crop.ts). feasible = crop source pixels ≥ hero box size × (size.minimum.width / size.recommended.width), i.e. the minimum scaled to the hero box; retained = crop area / source area.
4. If the hero was omitted: cropRect = null; feasible = true for geometry; retained = 0; add an info note "Image omitted by layout: {resolver reason}".
Selection:
1. Choose from feasible candidates by:
   1. composed candidates with the hero present before hero omitted;
   2. layoutStatus ready before adapted;
   3. higher retained;
   4. larger recommended area;
   5. catalog order.
2. No feasible candidate → fit: "Unsupported". Report the closest candidate's issue (the resolver reasons, or the source size needed).
Status for the chosen candidate:
- fit:
  - Ready if the ratio is within tolerance (platform) or retained ≥ 0.98 (composed) and the hero was not omitted;
  - otherwise Needs crop (the hero-omitted case is also Needs crop, with its note).
- exportable follows B3. A composed layout with the hero omitted is exportable (a valid resolver result) if its layoutStatus is ready / adapted.
Tests:
- a composed placement where the best-retention size is impossible but another resolves → the resolving size is chosen;
- a hero-omitted composed placement → Needs crop, exportable, with the note;
- the crop rect reported by planAll equals the one the canvas renderer draws (keep the B1 test).
- Migrated projects (any version below 3): useGoalPriorities: false, so their manual priorities stay in effect. Layout output for a migrated project must match the pre-migration output. Add a test resolving a v2 fixture before and after migration across the 4 assignment surfaces, and require identical ResolvedLayouts.
- New projects: useGoalPriorities: true.
- Old planner settings key (omniframe:planner:v1):
  - Delete it only after the migrated v3 project has been written and read back successfully.
  - On any failure, keep the old key and retry on next load.
  - Test both paths.
- Exact count check: only with all filters cleared, "Show setup-only formats" off, and Group by: Network selected. Then the rendered placement card count must equal catalog.placements.length, and every data-placement-id must be unique.
- Goal grouping: assert that the set of unique data-placement-id values equals the full catalog set (cards may repeat across sections), and that each section lists exactly the placements whose objectives map to that goal.
- Filters: assert that visible cards equal the expected subset computed from catalog data for that filter.
- Goal change: under Network grouping with no filters, the unique id set and count don't change; the order within groups may.
- Every card must have a data-placement-id attribute.
- Enforced limits (errors/warnings in issues): count Unicode code points with Array.from(text).length. Code-point counting behaves the same in every browser and in Node.
  - A catalog CopyField can override this with countRule: "codepoints" | "utf16", only where an official source says otherwise.
  - Record the rule and its source in docs/catalog-verification.md. If the source doesn't say, use "codepoints" and mark it "counting rule unverified".
- Human-facing counter in the editor: may show a grapheme count via Intl.Segmenter for display only. When the count differs from the enforced count, show both ("41 characters (42 counted by platform rules)").
- Enforced validation must never depend on Intl.Segmenter.
Until Playwright is added (revised step 9), each phase must pass:
1. npm run build (includes tsc -b and the @ts-expect-error checks);
2. npm test (unit + database tests);
3. the existing geometry harness in scripts/verify-browser.ts, unchanged, still passing;
4. a manual smoke check, recorded in VERIFICATION.md with the date and what was checked:
   - app loads;
   - a legacy v2 project opens and renders identically on the 4 assignment surfaces;
   - the planner renders cards;
   - one export works (from step 8 onwards).
From step 9 onwards, add npm run test:e2e to every check.
- In B10, "before Phase 3 UI work" means before revised step 4 (catalog + status model + matrix UI). The catalog verification gate is revised step 3 and must be complete before step 4 starts.
- All references to phases in the main spec and Addendum A should be read against the revised step order in B11.
- Checkpoint: stop after step 2 (module moves + migration) and report for human review before continuing:
  - the C2 identical-layout test result;
  - confirmation that old projects open;
  - the full list of moved files and re-exports.
With this, the spec set (main spec + Addendum A + B + C) is consistent. The final order is:
1. Remove video.
2. Module moves + migration. Stop for your review here.
3. Verify the catalog.
4. Matrix UI.
5. Placement surfaces.
6. Goal priorities and copy.
7. Crop tools.
8. Export.
9. E2E tests and docs.

---

## Addendum D

How it should work
The image is optional. So is every other element except what the user marks as required (headline and CTA by default).
Each placement declares how much it needs media: required, optional or none.
Without an image:
Composed placements (banners, Stories, the assignment surfaces) resolve as text-only layouts, headline, offer, CTA and brand on the theme background, so they stay valid and exportable.
Platform placements that need an image (Meta Feed, Taboola) show a new status, "Needs image", instead of "Unsupported". The problem is a missing input, not a size or fit problem.
Text-only formats such as Google responsive search ads or LinkedIn text ads can become buildable, which makes the catalog more complete.
The same applies to copy: fields are only required where a placement actually requires them. A missing optional field is a warning on that placement, never a block on the whole creative.
This fits the product idea better too: "one creative, many surfaces" works with whatever the user has, and the planner shows where an image would unlock more placements.

Here's the addendum covering both Codex's three points and optional images:

Written for: Codex, as Addendum D, the final brief amendments.

Addendum D: Final clarifications and optional media
This overrides earlier documents where they conflict.

D1. Minimum-resolution scaling uses both dimensions (amends C1)
For composed candidates:


scale = max(minimum.width / recommended.width, minimum.height / recommended.height)
feasible = cropSource.width  >= heroBox.width  * scale
        && cropSource.height >= heroBox.height * scale
minimum and recommended don't need matching aspect ratios.
Test: a fixture whose height minimum is stricter than its width minimum is rejected when the source height is too small.
D2. Assignment surfaces under Goal grouping (amends C3)
Under Group by: Goal, the 4 assignment surfaces appear once each in their own final section, "Assignment surfaces". They have no network objectives and no goal badge.
They're never marked "recommended". The goal still changes their element priorities when useGoalPriorities is on.
The C3 Goal-grouping test must assert:
the "Assignment surfaces" section contains exactly the 4 assignment placement ids;
they appear in no goal section;
the union of unique ids across all sections equals the full catalog set.
D3. Counter wording and unverified counting rules (amends C4, B10)
Label: when a field's countRule is verified, say "counted by {network} rules"; when unverified, say "counted by the planner". Never call an unverified rule a platform rule.
Gate: an unverified counting rule alone does not block buildable: true, provided the limit value itself is verified. The check is then shown as advisory: severity capped at warning, and the text "counting method unverified".
If the limit value is unverified, the field's check is dropped entirely; the entry can still be buildable if its media specs are verified. List both cases in docs/catalog-verification.md.
D4. Images are optional
D4.1 Creative model

The image is optional in CreativeData. No image → no hero element in the spec.
Only elements marked required must be present. Defaults: headline and CTA required; image, offer, brand and body optional.
validateSpec already requires at least one required element; keep that.
D4.2 Placement media requirement. Add to Placement:


media: "required" | "optional" | "none";
Catalog values need verification like every other value (B10).
"none" placements have an empty accepts list and no crop logic.
Examples, if verified: Google responsive search ads, LinkedIn text ads.
Formats previously set to buildable: false only because they are text-only can now become buildable when verified.
D4.3 Status. Extend fit:


fit: "Ready" | "Needs crop" | "Needs image" | "Unsupported" | "Text only";
Image present?	media	Placement type	Result
no	required	any	fit: "Needs image", not exportable, issue "Add an image to use this placement". Kept in counts under its own status chip.
no	optional	composed	Resolve without a hero. fit: "Text only"; exportable if layoutStatus is ready / adapted.
no	optional	platform	fit: "Text only"; export is the copy fields only (plan JSON). No image asset.
any	none	any	fit: "Text only"; any image is ignored, with the note "This format doesn't use images."
yes	any	any	Existing C1 algorithm.
D4.4 Upload recommendation (B2): hidden when there's no image. Show instead: "Add an image to unlock N placements", where N is the count of Needs image placements.

D4.5 UI

The intake panel says "Image (optional)".
The status chips include "Needs image" and "Text only".
Text-only composed previews render the resolved layout normally.
D4.6 Tests

A creative with no image:
every media: "required" placement → Needs image, not exportable;
every composed optional placement resolves (ready / adapted, or impossible with reasons for documented stress sizes);
no exceptions.
Adding an image moves Needs image placements into the C1 algorithm; the unique placement id set doesn't change.
media: "none" placements ignore an uploaded image and never produce crop issues.
Migration: existing projects always have an image, so their behaviour is unchanged (the C2 identical-layout test still passes).
Read together, the main spec plus Addenda A–D cover everything. Record them in the repo (e.g. as docs/planner-spec.md) so Codex and the interview prep use the same source of truth. The step-2 review checkpoint still applies.

---

## Addendum E

Addendum E: Optional media contracts
This overrides D4 and earlier documents where they conflict.

E1. Missing media through the pipeline
planAll input: image: { width: number; height: number } | null.
When image === null:
- skip decoding, inspectAsset, crop and resolution calculations, and focal overrides (keep them stored; ignore them);
- build no hero element.

Output size without an image: every buildable composed placement must declare

```ts
outputSize: { width: number; height: number }; // export pixel size when no image-size candidate applies
```

- With no image, composed placements resolve once at outputSize.
- With an image, the C1 candidates from accepts are used.
- If accepts is empty, outputSize is used in both cases.

UI:
- "Remove image" action in the intake panel. It sets the image to null, and Undo restores it.
- Replacing the image re-runs inspection.
- Persisted projects store image: null explicitly.

E2. Required-element settings
Add to CreativeData:

```ts
required: Record<Role, boolean>; // default: primary (headline) true, action (CTA) true, others false
```

Persisted in project v3. Migration sets it from the old project's existing required flags, so behaviour doesn't change (C2).

In toSpec:
- optional + blank → the element is left out of the AdSpec, with no issue;
- required + blank → the element is left out, and planAll adds a creative-level error "Add {field}: marked as required". Composed placements get layoutStatus: "invalid" with that reason and aren't exportable;
- at least one role must stay required. The editor prevents turning off the last one; validateSpec still enforces it.

An absent optional field produces no warning, unless the catalog defines a specific recommendation for that placement (e.g. recommendedRoles), which appears as info.

E3. Export contract
Replaces B3's exportKind and D4.3's export wording:

```ts
pngExport: { kind: "composed-creative" | "image-asset"; available: true } | { available: false; reason: string };
inReport: true; // every generated placement always appears in the plan report JSON
```

| Case | pngExport |
|---|---|
| Composed, layoutStatus ready / adapted, fit not Unsupported / Needs image | composed-creative (includes text-only banners) |
| Platform-assembled, fit Ready / Needs crop | image-asset |
| Platform-assembled, text only (no source image, or media: "none") | unavailable: "Copy-only placement: included in the plan report" |
| Needs image, Unsupported, invalid / impossible | unavailable, with the specific reason |

Batch PNG export:
- processes only available: true;
- skipped placements are listed in a summary ("5 skipped: 3 copy-only (in report), 2 need an image");
- the plan report JSON includes every placement, with its copy fields and issues.

Test: batch export on a mixed fixture produces the expected file list and the expected skipped list.

E4. Status precedence
Replaces D4.3's table. Evaluate strictly in this order:

1. format.buildable === false → setup-only (B9); no fit.
2. placement.media === "none" → fit: "Text only". Ignore any image; add the note "This format doesn't use a source image". Composed → resolve at outputSize.
3. image === null:
   - media: "required" → fit: "Needs image";
   - media: "optional" → fit: "Text only" (composed → resolve at outputSize).
4. Image present, media is required or optional → C1 algorithm → Ready / Needs crop / Unsupported.

layoutStatus is always computed and shown separately for composed placements. "Text only" describes the source-image situation, not feasibility; a text-only layout can still be impossible.

Test each branch, including an image present with media: "none" (ignored, no crop issues).

E5. What media means
Placement.media is the requirement for a user-supplied source image. It isn't the network's final upload format.
- A text-only composed banner still exports as an image (PNG), and correctly has media: "optional".
- media: "none" means the format never uses a source image (e.g. responsive search ads).

Newly buildable text-only formats must meet the same B10 gate:
- verified copy fields and limits (D3 rules);
- a verified media value;
- a preview design before they can be buildable. Add a copy-only mockup type showing the network's text ad structure, labelled illustrative.

If any of these is missing, the format stays buildable: false.

E6. Tests (in addition to D4.6)
- planAll with image: null performs no crop or decode calls. Assert with a spy or a pure-function check.
- Remove image → project saved with image: null → reload → the same plans.
- Required role left blank → a creative-level error; composed placements invalid; not PNG-exportable; still in the report.
- An optional blank role → left out of the spec, no issue.
- Turning off the last required role is prevented in the UI and rejected by validation.
- Every composed buildable placement has an outputSize that passes validateSurface together with its template.

The spec set (main spec plus Addenda A–E) is now complete. Keep the step-2 review checkpoint.
