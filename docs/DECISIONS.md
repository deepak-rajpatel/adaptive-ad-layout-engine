# Creative-first planner — decisions log

Last updated: 14 September 2026

This file records everything discussed, agreed and planned for the creative-first planner. The full implementation contract is [planner-spec.md](planner-spec.md): the main spec plus Addenda A–E, with later addenda overriding earlier ones. If this file and the spec disagree, the spec wins; update this file when that happens.

Contents:
1. Where this started
2. Original discussion: platform taxonomy
3. Original 4-tier architecture
4. Gap analysis of the existing build
5. Product idea (confirmed)
6. Taxonomy model (confirmed)
7. Decisions made
8. Status and export model
9. Size selection and cropping
10. Image-quality help
11. Optional media
12. Non-product campaigns
13. Copy and CTA rules
14. UI behaviour
15. Engineering rules
16. Migration and versioning
17. Testing and verification
18. Deferred features (designed, not yet built)
19. Review history
20. Execution plan
21. Open items

---

## 1. Where this started

- **Problem:** media buyers build ads separately in Meta Ads Manager, Google Ads, Taboola Realize, LinkedIn Campaign Manager and TikTok. Each uses its own terms, objective trees and format names.
- **Goal:** one platform where a user uploads a single creative and the system finds, previews and maps every eligible placement across Meta, Google, Taboola, LinkedIn and TikTok.
- **Industry note:** social in-feed, story and reels formats are **native advertising** (designed to look like the host platform), not traditional IAB display banners.
- **Assignment context:** this extends the FLAM Frontend R&D assignment "Adaptive Layout Engine for Multi-Surface Ads". The assignment is graded on algorithm (35%), correctness (25%), TypeScript and architecture (20%), demo (10%) and code quality (10%). The planner is Phase 3 of [PROJECT_PLAN.md](../PROJECT_PLAN.md) and must not weaken the graded core.

## 2. Original discussion: platform taxonomy

This is the reference list from the first discussion. Every entry must be verified against official sources before it enters the catalog (see §15).

**Meta (Facebook & Instagram, ODAX objectives)**
- Awareness: single image (Feed/Explore), in-stream video, Stories 9:16, Reels 9:16.
- Traffic: single image/video link post, carousel (up to 10 cards).
- Engagement: boosted posts, video views, click-to-message (Messenger, WhatsApp, Instagram DM).
- Leads: Instant Forms, automated chat flows, call ads.
- App promotion: app install ads, playable ads, deep-link re-engagement.
- Sales: Advantage+ catalog (dynamic product ads), Collection ads.

**Google Ads**
- Sales & leads: responsive search ads, Shopping, Performance Max, Local Services Ads, call-only.
- Traffic & consideration: Demand Gen (YouTube, Discover, Shorts, Gmail), responsive display ads.
- Awareness & reach: YouTube bumper (6s), skippable and non-skippable in-stream, Masthead, outstream, standard display banners.
- App promotion: App campaigns.

**Taboola (native)**
- Reach: outstream native video, high-impact headers, sponsored branded articles.
- Engagement: native recommendation teasers (16:9 thumbnail + headline), in-feed mid-article units, click-to-watch video.
- Leads: advertorial funnels (bridge pages), native carousels.
- Online purchases: direct-to-offer units, dynamic retargeting cards, Smartfeed e-commerce tiles.
- App promotion: native app install cards, app motion video.

**LinkedIn (B2B)**
- Brand awareness: single image/video, Thought Leader ads.
- Website visits / engagement: carousel, Document ads, Event ads.
- Lead generation: Lead Gen Forms, Sponsored Messaging / Conversation ads.
- Job postings: single job ads, dynamic Spotlight ads.

**Corrections agreed during review**
- Gmail Sponsored Promotions no longer exist as a separate format; they were folded into Discovery, now Demand Gen.
- Universal App Campaigns are now called App campaigns.
- YouTube Masthead and Local Services Ads are reservation or special-setup products. They are listed as setup-only, not as placements a file can "fit".
- Catalog/shopping formats come from product feeds, not uploads. They are setup-only.
- TikTok image delivery appears to go through Carousel Ads. There will be no generic single-image TikTok placement unless it is verified.
- Numbers from memory (e.g. a 65-character Taboola headline) must be verified before use.

## 3. Original 4-tier architecture

```
Tier 1: Asset core (media type, dimensions, aspect ratio)
  └─ Tier 2: Creative container (in-feed, vertical, recommendation, carousel, multi-asset)
       └─ Tier 3: Network placement matrix
            └─ Tier 4: Objective & copy (goal, headline limits, body, CTA)
```

Original proposed user flow: upload → detect → availability breakdown → side-by-side mockups → safe-zone and policy checks.

**What changed:** the objective moved **above** placements as a filter and ranking layer (media buyers start from the objective), and nothing is hidden (§5). The final model is in §6.

## 4. Gap analysis of the existing build

Findings from reviewing `src/engine/placements.ts` and `src/components/CreativePlanner.tsx` before planning:

- The catalog had only 10–11 placements, each with a single fixed size. A correct 4:5 image was flagged "needs crop" on Meta Feed.
- "Needs work" mixed crop problems, missing copy and guidance notes. Any placement with a guidance note could never show "Fits".
- The goal only changed the CTA text. The objective taxonomy wasn't used.
- Only one copy limit (the Google short headline) was checked.
- Video duration was read but never checked; file size was never recorded.
- The safe-zone overlay was one generic box, not network-specific data.
- The planner and the layout engine were separate. The engine's surfaces, safe areas and Canvas export weren't used by the planner.
- Previews were generic, not per-network.
- The planner's data had no verification dates.

## 5. Product idea (confirmed)

- **Promise:** one creative, many surfaces.
- **Generate everything:** as soon as copy exists (the image is optional), the app generates every placement in the verified catalog plus the 4 assignment surfaces.
- **Goal and network are views, not gates.** They re-rank, tag, group and filter; they never limit what is generated.
- **The layout resolver stays the core.** Placements are data; there is no network-specific layout code.
- **Two kinds of placement:**
  - **Composed:** we control the layout (display banners, Stories, assignment surfaces). The resolver builds the full creative.
  - **Platform-assembled:** the network draws its own headline and CTA (Meta Feed, Taboola, LinkedIn). We supply a cropped image plus copy fields.
- All results are **planning checks**, never platform approval. No conversion or performance claims.

## 6. Taxonomy model (confirmed)

```
Goal → Network objective → Format → Placement (surface + copy fields) → Resolved layout
```

- **Goals:** Awareness, Consideration, Leads, Sales.
- **Goal → network objective mapping:** each network's own objective names, verified with source and date. The Google mapping is marked approximate, because campaign types don't map 1:1.
- **Formats:**
  - list the objectives they serve;
  - are either composed or platform-assembled;
  - can be `buildable: false` with a reason ("Needs network setup: outside creative scope").
- **Placements:**
  - accept one or more sizes (ratio + recommended + minimum + tolerance);
  - declare copy fields with limits;
  - carry a surface template (safe area, minimum text size, tap target, contrast);
  - have `media: required | optional | none`;
  - composed placements have an `outputSize`;
  - have a source URL and verification date.
- **Assignment surfaces** (mobile portrait, mobile landscape, broadcast lower-third, retail kiosk) are placements under an "Assignment" network and are always generated.
- **Setup-only formats** included for completeness: Meta Instant Forms, Advantage+ catalog, Collection, click-to-message; Google Shopping, App campaigns, Masthead, Local Services Ads; Taboola dynamic retargeting; LinkedIn Lead Gen Forms, messaging, Document, Job, Thought Leader ads. Text-only formats (e.g. responsive search ads) can become buildable once verified.

## 7. Decisions made

| Topic | Decision | Why |
|---|---|---|
| Uploaded video | **Removed** | Not an assignment requirement; adds work that isn't graded |
| Animation | **Deferred** (designed, §18) | Useful, but after the static planner works |
| 3D conversion | **Rejected** | Out of scope; only suits product shots; no placement accepts 3D |
| Background extension / outpainting | **Not in this build** | Generated pixels; hard to verify |
| AI upscaling | **Deferred, opt-in only** (§18) | Invents detail; must never inflate fit status |
| Image | **Optional** | Much advertising is text-only; don't force artwork |
| Price | Renamed to **offer**, optional, free text | Works for non-product campaigns |
| Campaign type | Product · Service · Brand · Event · Hiring · Lead magnet | Sets the default CTA and helper text only |
| Goal priorities | On for new projects; **off for migrated ones** | Existing layouts must not change |
| Required elements | User-controlled; default headline + CTA; at least one required | Flexibility without invalid specs |
| Show all placements | Always; goal and network only change the view | Matches "one creative, many surfaces" |
| Placement count | No fixed number; the verified catalog defines it | Avoids arbitrary targets |
| Uploaded video placements (Reels, Shorts, TikTok video) | Removed with video | — |

## 8. Status and export model

Each placement plan carries separate fields.

**Fit** (source image only):

| Value | Meaning |
|---|---|
| `Ready` | Ratio matches within tolerance and resolution meets the minimum |
| `Needs crop` | A crop meets the minimum, or the layout omitted the image (with a note) |
| `Needs image` | The placement requires an image and none was supplied |
| `Text only` | No image, but the placement works without one; or `media: none` |
| `Unsupported` | No accepted size is feasible |

**Layout status** (composed only): `ready` · `adapted` · `invalid` · `impossible`. It is shown separately; "Text only" doesn't guarantee a feasible layout.

**PNG export:**
- `composed-creative`: composed placement, layout `ready` / `adapted`, fit not `Unsupported` / `Needs image`. Includes text-only banners.
- `image-asset`: platform-assembled, fit `Ready` / `Needs crop`. Labelled "Excludes headline, CTA and platform interface".
- **Unavailable**, with a reason: copy-only platform placements ("included in the plan report"), `Needs image`, `Unsupported`, `invalid` / `impossible`.

**Report:** every placement always appears in the plan report JSON.

**Rules:**
- Copy problems are issues and never change fit or block PNG export.
- Information notes never count as issues.
- Batch export processes only available placements and lists the skipped ones with reasons.

**Evaluation order:**
1. setup-only format;
2. `media: none`;
3. no image (`Needs image` or `Text only`);
4. image present → size-selection algorithm (§9).

## 9. Size selection and cropping

- **Feasibility first:** evaluate every accepted size against its minimum resolution, then pick the best feasible one.
- **Platform-assembled:** crop to the accepted ratio using the focal point.
- **Composed:** resolve each candidate surface first, then measure the crop on the **resolved hero image box**, so the preview matches the export exactly. The minimum is scaled by `max(minW/recW, minH/recH)` and checked on both dimensions.
- **Tie-breaks:**
  1. image present before image omitted;
  2. layout `ready` before `adapted`;
  3. higher retained area;
  4. larger recommended size;
  5. catalog order.
- `Unsupported` is used only when no size is feasible; it names the closest option and the size needed.
- Crop math is one shared pure helper (`src/engine/crop.ts`) used by `planAll` and both renderers.

## 10. Image-quality help

- **Focus point per placement:** overrides the creative default; "Reset to default" returns to it.
- **Crop-loss preview:** full image with the cropped-away area dimmed and the kept area outlined.
- **Resolution issues** state exact numbers ("Source crop is 640×800; needs at least 1080×1350").
- **Upload summary:** "Upload at least W×H to meet every supported crop's minimum resolution. Some placements will still need cropping." Placements that can never be satisfied at the current ratio are listed separately.
- **Without an image:** "Add an image to unlock N placements."

## 11. Optional media

- The image is optional. `planAll` accepts `image: null` and then skips decoding, cropping and resolution checks. Focus overrides are kept but ignored.
- "Remove image" action with Undo; persisted as `image: null`.
- `media` means the need for a **user-supplied source image**, not the network's final upload format. A text-only composed banner still exports as a PNG.
- Composed placements resolve at `outputSize` when there's no image.
- Newly buildable text-only formats need verified copy fields and limits, a verified `media` value, and a copy-only preview mockup. Otherwise they stay setup-only.

## 12. Non-product campaigns

- The engine never assumed a product; the image slot can hold any image.
- The offer is optional ("$49", "Free webinar", "Download the guide", "Apply by 30 Sept"). Blank means it's left out of the spec, not rendered empty.
- Campaign type sets the default CTA: Product → Shop now, Service → Contact us, Brand → Learn more, Event → Register, Hiring → Apply now, Lead magnet → Download. It never changes which placements are generated, their order, or their fit.
- Sales without an offer falls back to Consideration priorities (only when goal priorities are on), with a note. The Sales "usually includes an offer" check is a warning, not an error.
- Required test: an Event creative with no image or offer resolves without errors.

## 13. Copy and CTA rules

- **Copy fields per placement:** headline, long headline, description, body, brand, CTA, each with a platform label, a limit and a truncation guideline.
- **Required vs optional fields:**
  - required + blank → a creative-level error, and composed layouts are invalid;
  - optional + blank → left out, with no issue unless the catalog recommends the field.
- **Character counting:**
  - Enforced limits count Unicode code points (`Array.from`), which is the same in every browser and in Node. A catalog field can override this with a verified `utf16` rule.
  - The editor may also show a grapheme count for display only.
  - Labels: "counted by {network} rules" if verified; otherwise "counted by the planner".
  - An unverified counting method makes the check advisory (warning at most). An unverified limit value drops the check.
- **Goal priorities (default table):**
  - Awareness: image and headline first;
  - Consideration: headline first;
  - Leads: headline and CTA first;
  - Sales: offer and CTA first.

  The resolver is not changed; only the spec it receives.
- **CTA precedence:**
  1. the user's explicit choice;
  2. the campaign-type suggestion;
  3. the goal suggestion.

  A warning appears when the network doesn't support the CTA, with the closest supported option suggested. The CTA is never changed automatically.
- **Guideline examples from the discussion** (to be verified): Google short headline 30, long headline 90, description 90; Meta primary text about 125 before truncation; LinkedIn intro text about 150.

## 14. UI behaviour

- On first load, a sample creative generates every placement, with no upload or login needed.
- **Goal bar:** goal selector; Group by (Network · Goal · Size · Status); network chips; status chips; "Show only recommended"; "Show setup-only formats".
- **Summary line** with counts per status and the number recommended for the goal.
- **Goal:**
  - re-ranks within groups and adds a ★ "Recommended for {goal}" badge;
  - other placements stay visible with a muted tag;
  - also changes element priorities, so composed layouts recompose.
- **Group by Goal:** a placement can appear in several goal sections. The assignment surfaces get their own final "Assignment surfaces" section and are never marked recommended.
- **Group by Size:** 9:16, 4:5, 1:1, 1.91:1 / 16:9, fixed IAB sizes, assignment.
- **Placement card:**
  - network, format and container;
  - preview: the resolved layout for composed placements, a network mockup for platform ones, a copy-only mockup for text formats;
  - chosen size, fit badge, layout-status badge, retained area;
  - issues (errors first), then notes;
  - "Adjust crop", "Open in layout studio", "Download PNG" (or the reason it's unavailable).
- **Selection:** no cap on how many can be compared; the compare panel scrolls horizontally.
- **Mockups:** one per container type (in-feed, vertical with a data-driven safe-zone overlay, recommendation widget, display, copy-only), all labelled illustrative.
- **Accessibility:**
  - keyboard reachable;
  - `aria-pressed` toggles;
  - `aria-live` counts;
  - status shown by icon + text, not colour alone;
  - reduced motion respected.
- **Performance:**
  - memoise per placement;
  - wait ~150 ms after typing before recomputing;
  - measure with the existing benchmark and record the real numbers.

## 15. Engineering rules

- `src/engine/` stays pure: no imports from React, the DOM, `src/lib`, `src/components` or `src/render`. Enforced by a test.
- **New pure modules:**
  - `src/engine/catalog/` (types, networks, objectives, formats, placements, goal priorities, `plan.ts`);
  - `src/engine/creativeModel.ts` (`CreativeData`, `toSpec`);
  - `src/engine/crop.ts`;
  - `src/engine/catalog/assignmentSurfaces.ts`.

  Old paths keep compatibility re-exports.
- `SurfaceTemplate` keeps the discriminated union (`input: "none"` can't have a tap target; compile-time test).
- `resolver.ts` is not changed unless a step explicitly requires it.
- **Catalog verification gate:**
  - every value (sizes, ratios, limits, objective names, `media`, counting rules) needs an official source and a date in `docs/catalog-verification.md`;
  - unverified entries don't ship as buildable;
  - the same rigour applies to Taboola, LinkedIn, Google Demand Gen and TikTok.
- Surfaces stay within `validateSurface` limits. No silent loosening of validation.
- Small, descriptive commits, one per step or sub-step.

## 16. Migration and versioning

- **Project data → v3:**
  - `price` → `offer`, including its priority;
  - an offer longer than 40 characters is kept in full and shown as a validation error, never truncated;
  - `required` flags are carried over;
  - migrated projects get `useGoalPriorities: false`;
  - v1 (legacy `forma:`) and v2 still load.
- **Identical-layout guarantee:** a v2 project resolves to identical layouts before and after migration on all 4 assignment surfaces.
- **Old planner settings key** (`omniframe:planner:v1`): merged into the project; deleted only after the v3 save has been read back; retried on failure.
- **Plan report JSON → v2** (`kind: "placement-plan-report"`):
  - it's a report, not a backup, and contains no image;
  - if import is ever added, it restores copy and settings only and asks the user to upload the image again.

## 17. Testing and verification

**Unit tests:**
- catalog integrity;
- feasibility-first size selection;
- both-dimension minimums;
- fit independent of copy and notes;
- copy limits and counting;
- goal ranking doesn't change the count;
- Awareness vs Sales priorities give different decisions on a tight surface;
- crop rect equals the renderer's crop;
- hero-omitted case;
- no-image, `media: none` and required-blank branches;
- `planAll(null)` makes no crop or decode calls;
- batch export file list and skipped list;
- migration (v1/v2 → v3, identical layouts, settings-key deletion paths);
- focus overrides are isolated per placement;
- upload summary matches a hand calculation;
- campaign type only changes CTA and helper text;
- non-product creative resolves;
- engine import rule.

**Existing suites stay green:** `engine.test.ts`, `types.test.ts`, `database.test.ts`, the persistence tests, and the renamed-surface determinism test.

**Browser (Playwright, `npm run test:e2e` against `vite preview`, from step 9):**
- exact card count equals the catalog only with filters cleared and Network grouping;
- Goal grouping covers every id, with the Assignment section holding exactly the 4 surfaces;
- filters show the expected subsets;
- changing the goal keeps the id set;
- one export works.

**Before Playwright exists, each step passes:**
1. `npm run build`;
2. `npm test`;
3. the existing `scripts/verify-browser.ts` geometry harness;
4. a dated manual smoke check in `VERIFICATION.md`: app loads, a legacy project renders identically, planner cards render, and one export works from step 8.

**Honesty:** record only observed results; no invented benchmarks.

## 18. Deferred features (designed, not yet built)

**Animation**
- Animates the resolved layout only: opacity and movement, in priority order (priority 1 first), staggered about 250 ms.
- Uses a separate `AnimationFrame` type over an unchanged `ResolvedLayout`, because `ResolvedLayout` has no opacity field and its scale means text shrinking. Both renderers accept an optional frame.
- The final frame is identical to the checked layout; intermediate frames stay inside the surface bounds.
- Presets: None · Fade · Slide up · Pop CTA. Stored per creative; default None.
- Reduced motion: the preview shows the final frame only.
- Export: WebM via `canvas.captureStream()` + `MediaRecorder`, with decoded images cached during recording. GIF/HTML5 only later, with verified network animation limits.

**AI upscaling**
- Opt-in "Try 2× upscale", run in the browser only (no third-party upload), with the model loaded lazily.
- Before/after comparison; the original is kept; results labelled "Upscaled".
- Fit is always computed from the original resolution.
- README documents the model size, the licence, and "upscaling invents detail; review text, logos and faces".

## 19. Review history

| Round | Outcome |
|---|---|
| Initial gap analysis | Found the single-size placements, mixed status, unused objectives and planner/engine split |
| Video question | Video removed; animation proposed instead |
| Objectives question | The objective layer was restored to the workflow |
| Show-all question | Changed from filtering to generating everything, with goal/network as views |
| Main spec | Full implementation brief written |
| 3D / clarity question | 3D rejected; crop tools and warnings added; upscaling optional; non-product support → Addendum A |
| Codex review 1 | Source vs composed fit, export eligibility, feasibility first, placement count, engine purity, migration, animation contract → Addendum B |
| Codex review 2 | One size algorithm, migration keeps behaviour, conditional count assertions, deterministic counting → Addendum C |
| Codex review 3 + optional images | Both-dimension minimums, assignment section under Goal, counter labels, optional images → Addendum D |
| Codex review 4 | Nullable image, required settings, export contract, status precedence, meaning of `media` → Addendum E |
| Final | Spec complete (main + A–E) in `planner-spec.md`; this log created |

## 20. Execution plan

| Step | Work | Gate |
|---|---|---|
| 1 | Remove uploaded video (placements, `MediaKind`/duration, upload, `<video>` UI; images only; README note) | build + tests + geometry harness + smoke check |
| 2 | Module moves (§15) + v3 migration (§16), no behaviour change | **Stop for human review:** identical-layout test, old projects open, list of moved files and re-exports |
| 3 | Verify the platform catalog → `docs/catalog-verification.md` | Must be complete before step 4 |
| 4 | Catalog + feasibility-first size selection + status model + matrix UI | as step 1 |
| 5 | Placement surfaces + composed crop from the hero box | as step 1 |
| 6 | Goal priorities, offer, campaign type, CTA rules, copy fields, required settings, optional media | as step 1 |
| 7 | Per-placement focus, crop-loss preview, upload recommendation | as step 1 |
| 8 | PNG export (composed + image assets + skipped summary) + report JSON v2 | as step 1 + one export works |
| 9 | Playwright e2e + docs (ARCHITECTURE taxonomy diagram, README "things to try", VERIFICATION, CREATIVE_FIRST update) | all checks incl. e2e |
| Later | Animation, then upscaling | only after 1–9 pass |

**Rules for running each step:**
- Codex runs one or two steps at a time and commits each separately.
- Real results go in `VERIFICATION.md`.
- In its report, Codex lists the values it verified, the values it couldn't verify, and any departures from the spec.

**Kickoff prompt for Codex (steps 1–2):**

> Implement `docs/planner-spec.md` (main spec + Addenda A–E; later addenda override earlier ones). Follow the revised step order in B11. **This run: steps 1 and 2 only, then stop.** Step 1: remove uploaded-video support. Step 2: module moves (B6) and project migration to v3 (B7, C2, E2), with no behaviour change. Before stopping, run `npm run build`, `npm test`, `scripts/verify-browser.ts` and the C5 smoke check; record real results in `VERIFICATION.md`. Report the C2 identical-layout result, confirmation that v1/v2 projects open and render the same, the list of moved files and re-exports, and any ambiguity or departure from the spec. Commit each step separately. Don't start step 3.

## 21. Open items

- [x] Append Addendum E to `planner-spec.md`.
- [x] Commit the current project state before step 1 as a restore point.
- [x] Step 1: uploaded video removed.
- [x] Step 2: module moves + schema 3 migration. Results in `VERIFICATION.md`.
  - **Implementation note:** the offer keeps the internal element id `price`, so resolved layouts, explanations and renderer class names stay identical for old projects. Only the data field and UI label changed.
  - **Blank optional fields** are still sent to the resolver as before. Leaving them out (E2) is part of step 6, so step 2 changes no behaviour.
- [x] Step 3: platform catalog verified. See `docs/catalog-verification.md`.
  - Meta, Google, Taboola and LinkedIn sizes and copy limits were read on official pages.
  - Objective names come from official search summaries.
  - **TikTok is unverified** (the site was unreachable), so it is not buildable.
  - Meta Stories composes at 1080×1920, because 1440×2560 exceeds the 2400 px surface limit.
- [x] Steps 4–5: verified catalog (`src/engine/catalog/`), `planAll`, the placement matrix UI, and composed crops measured on the resolved image box. Done together, because both steps build the same planning function.
  - 27 placements: Meta 4, Google 16 (3 platform + 13 banners), Taboola 1, LinkedIn 2, assignment 4.
  - The engine already handles a missing image (E4 order). The planner UI can't remove an image yet; that comes in step 6.
  - **Which formats serve which objective** is a planning assumption, not a network rule. Example: Meta right column is tagged Traffic and Sales only.
  - **Still to do:** the compare panel is currently the "Selected only" filter over the same cards. Batch export is step 8.
- [x] Step 6: goal priorities (toggle), optional offer and image, campaign type with CTA suggestion, required elements, "Remove image" with Undo.
  - **Departure: goal priorities are off for the sample.** The spec says goal priorities default to on for new projects. The app always starts from the brief's example creative (headline/image 1, CTA/offer 2, logo 3), so turning them on would change the graded demo layouts. The planner shows a "Goal sets element priorities" toggle instead.
  - **Departure: a removed image is stored as `""`, not `null` (E1).** Same meaning everywhere (no hero element, `planAll` receives `image: null`), without making the image field nullable across the studio, library and cloud code.
  - **CTA suggestions come from the campaign type** and are applied only when the user clicks "Use it". Checking CTAs against each network's button list is not done: no network's CTA list has been verified yet.
- [x] Step 7: "Adjust crop" focus per placement (with reset), crop-loss preview on "Needs crop" cards, and the "Upload at least W×H" recommendation.
  - **How the recommendation works:** each plan records how much the source must grow for at least one accepted size to meet its minimum. The recommendation is the largest of those needs, at the current aspect ratio.
  - Placements that no resolution can fix (impossible layouts) are listed separately.
- [ ] Confirm the submission deadline. If time is short, steps 1–5 are the priority; 6–9 can shrink.
- [ ] Send the kickoff prompt (§20) to Codex.
- [ ] Review the step-2 report yourself: open an old project and confirm it looks the same on all four surfaces; understand every moved file.
- [ ] Step 3: verify platform specs together with Codex, using firsthand campaign experience.
- [ ] Update `CREATIVE_FIRST.md` in step 9. It still describes video upload and the old 11-profile planner.
