# Verification record

Updated 14 September 2026, after the brief-aligned engine rework. Windows 11, Node.js 24.12.0.

## Planner rework, steps 1–2 (14 September 2026)

Plan: [docs/planner-spec.md](docs/planner-spec.md) and [docs/DECISIONS.md](docs/DECISIONS.md). Windows 11, Node.js 24.12.0, Microsoft Edge (headless) against the Vite dev server.

**Baseline before changes:** `npm run build` passed; `npm test` 41/41 passed. Committed as the restore point.

**Step 1: uploaded video removed**
- `npm run build` passed.
- `npm test` 41/41 passed (the video test was replaced by an "image placements only" test).
- Geometry harness (`verify.html`): 25 presets, 0 problems.

**Step 2: module moves + schema 3 migration**
- `npm run build` passed.
- `npm test` 50/50 passed across 7 files.
- Geometry harness: 25 presets, 0 problems. Assignment surfaces unchanged: portrait stack, landscape gallery, broadcast strip, kiosk gallery; all `ready`, nothing omitted.
- **Identical-layout check (C2):** before any step-2 change, layouts for the sample and a stress variant (long offer, reordered priorities; includes `adapted` results) were captured on the four assignment surfaces into `tests/fixtures/v2-golden.json`, using the deterministic width stub. After migration, the schema-2 projects resolve to identical layouts on all four surfaces.
- **Migration tests:**
  - `price` → `offer`, with its priority, not truncated (60-character offer kept);
  - required flags become explicit (headline + CTA);
  - migrated projects get `useGoalPriorities: false`;
  - v1 and legacy projects reach schema 3;
  - schema-3 projects and version-less schema-3 library rows are not rewritten.
- **Old planner key:** merged into the creative; deleted only after the schema-3 draft reads back; kept when the draft is missing or unreadable.
- **Engine purity:** no file under `src/engine/` imports from outside the engine or uses DOM globals.
- **Manual smoke check (headless Edge):**
  - the planner page renders all 8 placement rows;
  - `?surface=kiosk` renders the studio artboards, including the offer element;
  - the editor shows the "Offer" field.
- **Not checked in a browser:** opening a real, previously saved v2 draft from browser storage. The unit tests cover parsing and identical layouts; the headless run starts with empty storage.

**Step 3: catalog verification**
- See [docs/catalog-verification.md](docs/catalog-verification.md). No code changes.

**Steps 4–5: catalog, planning function, placement matrix, composed crops**
- `npm run build` passed.
- `npm test` 60/60 passed across 7 files. The old placements test is replaced by `tests/plan.test.ts`.
- **Plan tests:**
  - catalog integrity (unique ids, references, sources; every composed placement's surface validates at each accepted size; no TikTok placement);
  - 4:5 and 1:1 images are both Ready on Meta feed;
  - feasibility is checked before retention;
  - Unsupported only when no size is feasible, stating the size needed;
  - fit is independent of copy and notes;
  - copy over a limit is an advisory warning;
  - destinations are checked only on network placements;
  - changing the goal re-ranks without changing the placement set;
  - assignment surfaces are never "recommended";
  - composed crops equal the renderer's cover crop of the resolved image box;
  - every banner and assignment surface resolves with the sample;
  - a per-placement focus moves only that crop;
  - with no image, placements that need one show "Needs image" and the rest resolve as text only.
- **Geometry harness:** 25 presets, 0 problems.
- **Browser smoke check (headless Edge, sample image 1254 × 1254):**
  - the planner renders 27 cards with 27 unique `data-placement-id`s, equal to the catalog;
  - 18 layout thumbnails (the composed placements);
  - summary "27 placements · 13 Ready · 14 Needs crop · 20 recommended for Awareness".

**Step 6: goal priorities, optional offer and image, campaign type, required elements**
- `npm run build` passed.
- `npm test` 70/70 passed across 8 files. New: `tests/goals.test.ts`, plus a compile-time case in `tests/types.test.ts`.
- **Goal-priority tests:**
  - goal priorities apply only when switched on;
  - on the 320×50 banner, Awareness and Sales drop different elements;
  - Sales without an offer uses Consideration priorities, with a note on composed placements and an offer warning on Sales placements;
  - with manual priorities there is no fallback note, but the warning remains.
- **Element tests:**
  - blank optional brand and offer are left out of the spec with no issue;
  - a blank required headline makes composed layouts invalid;
  - a creative with no required element is rejected.
- **Campaign and non-product tests:**
  - campaign type changes no generated plan;
  - an Event creative with no image and no offer resolves every composed placement as `ready` or `adapted`;
  - only image-dependent placements show "Needs image".
- **Compile time:** a surface template with `input: "none"` and a tap target does not compile.
- **Migration:** the identical-layout check still passes. Migrated projects keep manual priorities.
- **Geometry harness:** 25 presets, 0 problems; assignment surfaces unchanged.
- **Browser smoke check (headless Edge):** 27 unique cards, 18 layout thumbnails; the required-elements, campaign-type, goal-priority and "Remove image" controls render.
- **Not checked in a browser:** clicking "Remove image" and "Undo" (the headless check cannot interact). The no-image path is covered by unit tests.

**Step 7: per-placement crop focus, crop-loss preview, minimum-upload recommendation**
- `npm run build` passed.
- `npm test` 74/74 passed across 9 files. New: `tests/upload.test.ts`.
- **Upload tests:**
  - hand calculation: a 300×300 source on LinkedIn single image needs ×1.2, so 360×360 (1.91:1 would need ×2.29 and 4:5 ×2.13; the best size wins);
  - the recommendation takes the largest need across all placements and keeps the aspect ratio;
  - an image that already meets every minimum is reported as such;
  - there is no recommendation without an image.
- The per-placement focus test from step 4 still passes: an override moves only that placement's crop.
- **Geometry harness:** 25 presets, 0 problems.
- **Browser smoke check (headless Edge, sample 1254 × 1254):**
  - 27 unique cards;
  - 25 "Adjust crop" controls (every card with a crop);
  - 12 crop-loss previews (the "Needs crop" cards that have a crop; the other 2 "Needs crop" cards are composed placements where the layout omitted the image);
  - upload line: "Your image meets every supported crop's minimum resolution. Some placements will still need cropping."
- **Not checked in a browser:** dragging the "Adjust crop" sliders (the headless check cannot interact).

## Automated (`npm test`, `npm run build`)

36 tests across 4 suites pass. `tsc -b` (strict) and the Vite production build pass. Local-library regression coverage verifies unreadable records survive subsequent saves and favorite changes, and malformed stored JSON is not overwritten.

- **Brief surfaces:** mobile portrait 320×480, mobile landscape 480×320, broadcast 1920×250 (far viewing, 32 px text, no input), kiosk 1080×1080 (touch, 60 px target) keep all five elements at preferred size with no geometry errors. Tall, wide, and square resolve to stack, strip, and gallery; landscape also fits gallery at full size. Minimum broadcast text is ≥ 32 px; the kiosk CTA is ≥ 60×60 px.
- **Stage ordering (regression):** on a 300×200 surface the sample resolves `ready` with no text reduced (previously a shrunk gallery outscored a full-size strip); across a 20 × 15 grid, text is only reduced when the decisions report a degradation stage.
- **All 18 IAB and social presets** resolve with headline and CTA and valid geometry.
- **Name independence:** renaming a surface gives an identical result.
- **Degradation order:** size plans never reduce priority *p* while priority > *p* text is above its smallest step; on the kiosk, shrinking height makes branding shrink and then drop first, headline and CTA intact; the constrained banner omits brand → price → image (priorities 3, 2, 1); flipping priorities changes the order; long secondary text truncates to one measured line with an ellipsis before it is dropped.
- **Grid:** 17 × 13 unfamiliar dimensions; every valid result passes `geometryErrors` and carries per-element explanations; impossible results carry no elements.
- **Validation:** NaN dimensions, far viewing distance with small text, tap target on a non-interactive surface, oversized safe area, duplicate ids, role/type mismatch, and unsafe image URLs are reported; `defineAd` and `defineSurface` throw.
- **Compile-time (`tests/types.test.ts`):** role/type mismatch, unknown role, priority outside 1–5, truncation on a button, and a tap target on `input: "none"` are all `@ts-expect-error`; the build fails if any becomes legal.
- **Persistence:** round trip, malformed imports, upgrade of pre-brief projects (1–100 priorities, single `safe` inset), script-URL stripping. Legacy detection uses the schema version (`1` or absent) and legacy surface fields, not the headline value: `{headline:1, image:80, cta:100, brand:40, price:60}` now migrates (regression). Version 2 data is never rewritten. Unreadable library entries are counted and reported instead of silently hidden.
- **Database (PGlite, real migration SQL, run twice):** owner CRUD; cross-user read/update/delete/forged insert denied; ownership transfer denied; anonymous denied; storage folder isolation; only the owner can delete an image.

## Real browser text measurement

`verify.html` (dev server) resolves every preset with Canvas `measureText`, renders it through the framework-free DOM renderer, measures every rendered line with an inline span, and checks for overflow, overlap, and safe-area violations.

Result on Microsoft Edge 153 (Chromium, headless): **25 presets, 0 problems.** Raw output: [`docs/browser-verification.json`](docs/browser-verification.json).

| Group | Result |
| --- | --- |
| Required four | portrait stack, landscape gallery, broadcast strip, kiosk gallery; all at preferred size, nothing omitted |
| IAB display (13) | all valid; 320×50 and 300×50 omit brand, price, image in priority order; 468×60, 320×100, 970×250 adapt by shrinking lower-priority text |
| Social (5) | all valid at preferred size, nothing omitted |

These results depend on the installed Arial metrics. Other systems substitute a similar sans-serif. The resolver always measures in the browser it runs in, so layouts stay consistent with what that browser draws.

## Benchmark (`npm run benchmark`)

Vitest bench, deterministic width stub (excludes browser measurement and rendering), Node 24.12.0: mean ≈ 1.3–2.1 ms per surface for the four required surfaces, ≈ 44 ms for all 25 presets. The expanded degradation ladder costs about three to four times the previous single-scale search.

## Supabase (read-only checks against the configured project)

- Auth settings endpoint: reachable; email auth enabled.
- `public.creatives`: `PGRST205` (table not found). **Migrations have not been applied.**
- `creative-assets` bucket: not found.

The app detects both and disables cloud save, the cloud library, and image upload with an explanation. Login works independently. Cloud features cannot be certified until the owner runs the three SQL files in `supabase/migrations` and repeats the two-account test in the README.

## Not verified

- Live cloud CRUD, storage upload/delete, email delivery, and auth redirects (blocked on the migrations above).
- Browsers other than Chromium-based Edge.
- A full WCAG audit; only text/button contrast and target sizes are modeled.
