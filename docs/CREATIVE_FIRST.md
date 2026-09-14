# Creative-first planner

The assignment's constraint solver stays the composition engine. The planner starts from one creative and shows every place it can run. It keeps three things apart: the network's objective, the ad format, and the physical canvas.

Specification: [planner-spec.md](planner-spec.md). Decisions and progress: [DECISIONS.md](DECISIONS.md). Sources for every size and limit: [catalog-verification.md](catalog-verification.md).

## Workflow

1. **Image and copy.** Upload a PNG, JPEG or WebP (optional; original dimensions are kept). Fill in brand, headline, long headline, description, primary text, offer and CTA, and pick a campaign type. Required elements are user-controlled; headline and CTA are required by default.
2. **Every placement is generated.** 27 verified placements: Meta (feed, Stories, right column, carousel card), Google (responsive display, Performance Max, Demand Gen, 13 uploaded banners), Taboola, LinkedIn (single image, carousel card), and the four assignment surfaces. Setup-only formats are listed behind a toggle with the reason each can't be built.
3. **Explore.**
   - The goal re-ranks placements and badges the ones that suit it. With "Goal sets element priorities" on, it also changes element priorities, so composed layouts recompose.
   - Group by network, goal, size or status; filter with the network and status chips.
   - None of these change what is generated.
4. **Check each card.**
   - fit (`Ready`, `Needs crop`, `Needs image`, `Text only`, `Unsupported`);
   - layout status for composed placements;
   - the chosen size and share of the image kept;
   - copy-length and destination issues;
   - notes and the official source.
5. **Fix crops.** "Adjust crop" sets a focus point for that placement only. Cards that need a crop show the whole image with the kept area outlined. The planner recommends the smallest upload that meets every crop's minimum.
6. **Export.**
   - PNGs for the selected cards (or all of them): composed creatives at surface size, and platform images as image assets that are never enlarged beyond the source;
   - a JSON report of every placement;
   - or open any placement in the layout studio with its own constraints.

## Layers

| Layer | Implementation | Responsibility |
| --- | --- | --- |
| Creative | `src/engine/creativeModel.ts` | Copy, offer, image, priorities, required flags, goal settings; `toSpec()` |
| Catalog | `src/engine/catalog/data.ts` | Networks, objectives, formats, placements, surface templates (verified data) |
| Planning | `src/engine/catalog/plan.ts` | Size selection, fit, layout status, issues, upload recommendation, export planning |
| Layout | `src/engine/resolver.ts` | Unchanged; resolves composed placements like any other surface |
| UI and export | `src/components/CreativePlanner.tsx`, `src/lib/exporter.ts` | Matrix, cards, crop tools, PNG rendering |

The planning layer is pure TypeScript. A test enforces that nothing under `src/engine/` imports React, the DOM or app code.

## Boundaries

- **Planning checks, not approval.** File weight, policies, account eligibility and bidding are reviewed in each network.
- **Copy-length checks are advisory.** No network publishes how it counts characters, so the planner counts Unicode code points and labels the count "counted by the planner".
- **Objective mapping is an assumption.** The goal → objective mapping and which formats serve which objective are our interpretation.
- **Not included:**
  - video (out of scope);
  - animation and AI upscaling (designed, deferred);
  - TikTok (unverified);
  - catalog/feed, lead-form and messaging formats (setup-only);
  - network APIs and publishing.
- **The report is not a backup.** It contains no image. The project JSON export from the studio embeds the image.

## Verification

See [VERIFICATION.md](../VERIFICATION.md) for recorded results: unit tests, the geometry harness, the export check (`verify-export.html`) and the Playwright planner checks (`npm run test:e2e`).
