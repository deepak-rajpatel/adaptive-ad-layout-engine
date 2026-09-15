# Architecture

## Resolution flow

```text
AdSpec (defineAd)  +  Surface (defineSurface)  +  Measure (injected)
        │                    │                        │
        └──────────► resolve()  src/engine/resolver.ts ◄┘
                        │  1. validateSpec + validateSurface  → "invalid" + reasons
                        │  2. contrast checks                → "impossible" + reasons
                        │  3. degradation ladder × arrangements × width shares
                        │  4. geometryErrors() on every candidate
                        │  5. score survivors, or omit next optional element and retry
                        ▼
                  ResolvedLayout  src/engine/layout.ts
                        │  (boxes, lines, font sizes, colors, per-element explanations)
          ┌─────────────┴─────────────┐
   renderDom()  src/render/dom.ts   renderCanvas()  src/render/canvas.ts
          │                           │
   React <Preview> only mounts and zooms the artboard; it makes no layout decisions.
```

## Modules

| Module | Responsibility | Depends on |
| --- | --- | --- |
| `src/engine/spec.ts` | `AdSpec`, `ElementSpec`, `Role`, `Priority`, `defineAd`, runtime `validateSpec` | nothing |
| `src/engine/surfaces.ts` | `Surface` (discriminated by `input`), `defineSurface`, `validateSurface`, safe-area helpers | `layout.ts` types |
| `src/engine/text.ts` | `Measure` type (text, size, weight, font), measured word wrap with optional hyphenation, one-line ellipsis truncation | `spec.ts` types |
| `src/engine/fonts.ts` | The curated font set: installed system font stacks shared by measurement and both renderers | `spec.ts` types |
| `src/engine/contrast.ts` | WCAG contrast ratio; readable button text color | nothing |
| `src/engine/resolver.ts` | The algorithm: size plans, candidate generation, validation, scoring, explanations | the four above |
| `src/engine/layout.ts` | `ResolvedLayout` output contract consumed by renderers | `spec.ts` types |
| `src/render/dom.ts` | Framework-free DOM renderer | `layout.ts` |
| `src/render/canvas.ts` | Canvas 2D renderer and PNG export source | `layout.ts` |
| `src/engine/creativeModel.ts` | Creative data model (schema 3), goal priorities, `toSpec()` into an `AdSpec` | `spec.ts`, `placements.ts` |
| `src/engine/crop.ts` | Cover-crop math shared by the Canvas renderer and the planner | nothing |
| `src/engine/catalog/*` | Verified placement catalog, the four assignment surfaces, `planAll()`, upload and export planning | engine modules |
| `src/lib/creative.ts` | Re-exports the creative model for app code | `creativeModel.ts` |
| `src/lib/data.ts` | Studio surface presets as plain data (assignment four, stress, IAB, social, custom) | `surfaces.ts`, `catalog/assignmentSurfaces.ts` |
| `src/lib/exporter.ts` | Browser PNG rendering of planner exports | `catalog/plan.ts`, `render/canvas.ts` |
| `src/lib/measure.ts` | Browser adapter: Canvas `measureText` with the renderers' font stack | `text.ts` |
| `src/lib/persistence.ts` | Local storage, JSON import/export, upgrade of pre-brief saved data | `creative.ts`, `surfaces.ts` |
| `src/App.tsx`, `src/components/*` | Editor, inspector, library, auth, cloud UI | everything above |
| `supabase/migrations` | Tables, row ownership policies, private image bucket | — |

The engine folder imports nothing from React, the DOM, or `src/lib`. A new surface is a data entry in `data.ts` (or any object passing `validateSurface`); a new renderer only reads `ResolvedLayout`. Neither touches `resolver.ts`.

## TypeScript design

- **Role determines type.** `RoleTypes` maps each role to its one legal element type, and `ElementSpec` is a discriminated union over roles. `{ role: "hero", type: "text" }`, an unknown role, or `priority: 9` do not compile.
- **Truncation is only legal on secondary text.** `truncate?: R extends "secondary" ? boolean : never`.
- **Interaction constraints are a union.** `Surface` is `{ input: "touch" | "pointer"; minTapTarget: number } | { input: "none"; minTapTarget?: never }`. A broadcast surface with a tap target is a compile error.
- **`defineAd` / `defineSurface`** use `const` type parameters so literal roles and ids are preserved, and they also run the runtime validators, so data-level errors (duplicate ids, empty copy, unsafe image URLs, a far viewing distance with 14 px text, a safe area leaving under 32 px) throw immediately with readable messages.
- **Data from outside** (imports, localStorage, Supabase rows) is `unknown` until `validateSpec` / `validateSurface` pass; the resolver re-validates and returns `status: "invalid"` with reasons rather than throwing.
- **The output is renderer-ready.** `ResolvedElement` is a union of `ResolvedText` (`kind: "text" | "button"`) and `ResolvedImage`, each with absolute boxes, font size, weight, line height, pre-wrapped lines, colors, radius, and an `explanation` array. Renderers never measure, wrap, or choose colors.

`tests/types.test.ts` holds `@ts-expect-error` cases; `npm run build` (`tsc -b`) fails if any of them stops being an error.

## The algorithm

### Base sizes

The safe box is the surface minus its four insets. A base unit is `max(minTextSize, min(48, 6% of safe width, 16% of safe height))`. Preferred sizes are multiples of it: branding 0.78, headline 2.2, price 1.3, CTA 0.85. The spec's optional `button` style scales the CTA's preferred size and label padding (Small 0.8×, Medium 1× = the default, Large 1.25×) and sets its corner radius (capped at a pill); the surface's minimum text size and tap target still apply, and the contrast check uses the chosen button text color (automatic when omitted). Width drives type size, so losing height does not silently scale all text; it forces the degradation ladder instead.

### Degradation ladder (size plans)

For the current element set, `sizePlans()` produces an ordered list:

1. All text at preferred size.
2. For each priority level present, from the least important (highest number) up: that level's text at 80%, then 62%. Earlier (less important) levels stay reduced.
3. When a level containing truncatable secondary text has been reduced, a plan that truncates it to one line with an ellipsis.

So an element of priority `p` is never reduced while any element with priority `> p` is still above its smallest step. Text never goes below `minTextSize`; the tap target never goes below `minTapTarget`.

### Candidates

Each plan is tried in four arrangement families, each with several width shares (10 geometry variants in total):

- **stack** — reading order top to bottom; the image takes the height left after text is measured.
- **gallery** — branding and headline across the top; image and offer column below. Skipped when there is no image.
- **split** — image column beside a vertically centred text column.
- **strip** — image tile, message column, then an offer/CTA column.

Text is wrapped with the injected `Measure`. Headline and secondary text may hyphenate words wider than the column; CTA and branding may not. The CTA is sized to its label plus padding, never below the tap target. Any candidate failing `geometryErrors` (non-finite or empty boxes, outside the safe area, text below minimum, CTA below target, any pairwise overlap) is discarded. So is any candidate failing `completenessErrors`: every active element must be placed exactly once, and nothing outside the active set may appear. A candidate can therefore never drop an element; elements leave a layout only through the recorded omission step below.

### Composition families (optional preferences)

A spec may carry `composition: { family, imageShare, panel? }`. Without it, only the four arrangements above run, exactly as before. With it, the family is tried first for each element set, through the same degradation ladder, and the automatic arrangements are the fallback; the decisions say which was used and why.

| Family | Portrait (ratio < 0.9) | Square and landscape | Band (ratio ≥ 2.2) |
| --- | --- | --- | --- |
| `product` | copy on top, product region below | copy column left, product region right | message and offer columns, product region trailing |
| `panel` | photo on top, solid panel below | solid panel left, photo right | panel with message and offer columns, photo right |
| `type` | headline block, closing copy, decoration lower right | headline block, closing copy lower left, decoration lower right | message and offer columns, decoration trailing |

Each family tries the requested image share and ±10 points. Within the first plan that fits, variants are scored by kept text size, image area, truncation, distance from the requested share, and words broken by hyphenation.

Families reflow by aspect ratio; they never scale a fixed square design. Product images, photos and decoration are **background layers**: they may extend past the safe area to the surface edges, and `geometryErrors` rejects any content overlapping one unless the content sits entirely on a solid panel. Text therefore never sits on a photograph. Contrast is checked on every ground text can use: the background for the automatic arrangements and the product and typographic families, the panel fill for the panel family. If only the panel fails, the family is skipped with a reason; if every usable ground fails, the result is `impossible`.

Each family places a fixed set of roles: `product` and `panel` place text and the hero image (and need one); `type` places text and decoration but has no image slot. The automatic arrangements place text and the hero, never decoration. When the active elements include a role the family cannot place, the family is skipped for that element set with that reason in the decisions ("the preferred typographic composition cannot place image (hero), so an automatic arrangement was used"), and the automatic arrangements are tried.

Decoration (`role: "decoration"`, priority 5 and optional in the examples) is kept by the typographic family only at preferred text sizes. If no candidate fits, omission follows the declared priorities and required flags, and each omission records its actual reason (for example, "no arrangement available here can place it"). A required element that no available arrangement can place (required decoration with the product or panel family, for instance) makes the result `impossible`, and the error names the element and says which arrangements can place it.

### Composition typography defaults

Composition families apply a small set of reusable design defaults. The automatic arrangements do not, so legacy layouts are unchanged:

- **Headline measure:** a headline may take up to 20% off its style size (steps of 10%) to break into at most three lines without splitting a word. That size becomes its preferred size in that column. It is a design choice, not a degradation step, and is reported in the explanation.
- **Balanced breaks:** multi-line headlines and supporting lines use the narrowest measure that keeps their line count, so lines have similar lengths.
- **Line-quality scoring:** within one size plan, variants lose points for headlines over two lines and for a single-word last line.
- **Hierarchy:** in compositions, supporting copy is set at 0.8 × the base unit, below the offer (1.3) and headline (2.2). Automatic arrangements keep the original 0.95, so existing automatic layouts with a supporting line are unchanged.
- **Rhythm:** the supporting line sits half a gap under the headline, and the button gets 1.5 gaps above it.
- **Balance:** product-led side layouts centre the copy against the product.
- **Truncation is a permission, not an instruction:** wrapped copy is tried first, and an offer is cut to one line only when wrapping cannot fit.
- **Truncation never hides a price:** for any spec with a composition, in the family and in its automatic fallback alike, truncation that would hide a price, number or currency figure is refused. The ladder continues, and if nothing fits, the offer is omitted explicitly by priority with a reason. Specs without a composition keep the original ladder.
- **Badge against the product:** the hero's proportions are measured when an image is uploaded (directly or on the Create page), chosen from the image library, or restored, and they are saved with the creative. When the hero is shown whole and its proportions are known, the badge hugs the upper corner of the drawn image rectangle rather than its region's.

### Brand logo, image style, background graphics and badge

These are typed spec features resolved by the same code path on every surface. They are not coordinates and not per-campaign branches.

- **Logo** (`role: "logo"`, an image with `aspect`): laid out in the copy flow ahead of brand text in every arrangement and family. Its height is the base unit × 1.25, scaled by its priority's size plan and never below the surface's minimum text size. Its width follows the aspect ratio, capped at the column width. It has its own priority and required flag and is omitted like any other element. Brand text, the logo, or both may be present.
- **Image style** (`imageStyle`: mask `rect` | `rounded` | `circle`, radius, border): applied to the hero after each candidate is built. A circle is squared inside the intersection of the image region and the safe area, so it stays a circle on tall, wide and square surfaces (a full-bleed image becomes an in-safe-area image). Borders are drawn inside the edge, so geometry never grows. Masks and borders compose with cover or contain fitting and the focal point.
- **Offer badge** (`role: "badge"`, text on `badge.fill` with a `pill` or `circle` shape): placed after each candidate at a corner of the image region, then of the safe area. It is sized from its measured label plus padding (a circle circumscribes the label block). It is the one intentional content overlay: `geometryErrors` lets it overlap the hero or decoration, never text, the button or the logo. Its label contrast is checked against its own fill.

  **Coverage limit:** the badge may overlap at most 20% of the image's rendered rectangle. That is the drawn rectangle of a whole-image fit whose proportions are known, otherwise the image box. The measure is geometric, not detection of the visible product silhouette; a transparent cut-out's empty corners count as covered. At each size step (100%, 90%, then 80% of the badge size, never below the minimum text size), every allowed placement is tried: hugging the rendered image's upper corners, then the corners of the image and of the safe area. If none qualifies, the candidate is rejected and the resolver tries other candidates and size plans. After that, an optional badge is omitted by priority with that reason; a required badge makes the result `impossible` rather than exceeding the limit. The badge's explanation states its actual coverage.
- **Background graphics** (`graphic`: `block` | `diagonal` | `frame`): resolved after the layout, never counted as elements. Block and diagonal are anchored to the image region (inflated by half a gap unless the image already bleeds). The diagonal slants the edge that faces the middle of the surface, so it reshapes between tall, square and wide surfaces. Each is tested against every text element with a separating-axis polygon test, not its bounding box. If one would sit behind text, it is dropped with a reason in the decisions; text is only ever on the background or a solid panel. The frame is a stroke inside the safe-area margin, skipped with a reason when the margin is under 8 px.

Paint order is shared by both renderers: graphics under images, background images, panels, the frame, then content. The DOM draws polygons with `clip-path` and borders with an inset ring; the Canvas fills the same vertices and strokes inside the same edge.

Text and buttons may carry a `style` (font from the curated set, weight 400/600/700, a 0.6–1.6× preferred-size multiplier, alignment, colour). The multiplier changes the preferred size only; the minimum text size and the ladder still apply. `spacing` scales the gap between elements.

### Choosing and omitting

Within each search, size plans are strictly ordered: the resolver stops at the **first plan with any valid candidate** and scores only its variants. In automatic mode, text is never reduced when an automatic arrangement fits at a less degraded stage. With a composition preference, the preferred family is searched before automatic fallback, so it can win with reduced text even when an automatic arrangement would fit at preferred size. The following score applies to automatic arrangements:

```text
score = −40 · |ln(surfaceRatio / idealRatio[arrangement])|
        + 15 · (priority-weighted share of preferred text size kept)
        + 10 · (image area / surface area)
        − 20 · (any truncation)
```

Ideal ratios: stack 0.56, gallery 1, split 1.8, strip 5.8. The highest score wins; iteration order breaks ties, so output is deterministic. Omission is lexicographic: every plan and arrangement is tried with the current elements before anything is dropped. Only then is the next optional element omitted — highest priority number first, later-declared first on ties — and the search repeats. Required elements (`required: true`; headline and CTA in the demo) are never omitted. If only required elements remain and nothing fits, the result is `impossible` with a reason.

### Explanations

Every resolved element carries its slot ("Right text column, vertically centred of the split arrangement, at (…)"), its size and whether and why it was reduced, whether it sits at the surface minimum, how many measured lines it wraps to and at what width, truncation, and tap-target compliance. `decisions` records the chosen arrangement with the runner-up scores, the degradation plan applied, and each omission.

### Cost

Search is bounded by the active element set: each size plan tries up to 10 automatic geometry variants and, when requested, up to 3 composition shares per orientation (up to 2 orientations at intermediate aspect ratios). Each candidate can also try 3 badge sizes and a bounded set of placements. Each failed omission pass removes one optional element, so there are at most the optional-element count plus one passes. The number of size plans depends on the text priorities and truncatable content. There is no recursion or unbounded search. `npm run benchmark` measures automatic examples with a deterministic width stub; it is not a browser or all-composition benchmark.

## Correctness guarantees

- Valid output (`ready` / `adapted`) passes `geometryErrors`: content stays inside the safe area without unintended overlap, text ≥ `minTextSize`, CTA ≥ `minTapTarget` on interactive surfaces. Explicit background layers and panels may extend to canvas edges; ordinary copy over background imagery requires a solid backing panel; badges use their own checked fill and overlap rule.
- Intentional layering is explicit: background images and panels may reach the edges; graphics sit under images or in the margin and never behind text; the badge may overlap only the hero or decoration. Every other overlap is rejected.
- Valid output is complete: every spec element is either placed exactly once or listed in `omitted` with a reason in `decisions`. Required elements are never omitted. `tests/composition.test.ts` checks this for every composition family with absent, optional and required hero and decoration, on the four required surfaces.
- `invalid` (bad input) and `impossible` (valid input that cannot fit, cannot be placed, or fails contrast) are distinct and both carry reasons. Neither returns elements.
- No copy is silently cut: text wraps; only `truncate: true` secondary text may end in an ellipsis, and that is reported in its explanation and the decisions.
- Resolution depends only on dimensions and constraints. `tests/engine.test.ts` checks that renaming a surface yields an identical result.

## Extending the constraint model

- **Broadcast-safe areas**: already expressed as per-side insets (the lower-third uses 10% title-safe margins left and right). Action-safe versus title-safe could become two inset sets, with images allowed in action-safe and text restricted to title-safe.
- **Print bleed**: add a `bleed` inset outside the trim size. Background and images extend into it; the resolver keeps text inside `safeArea` exactly as now. The renderer would draw the artboard at trim + bleed.

## Rendering and export

DOM and Canvas consume the same `ResolvedLayout`: identical boxes, lines, font sizes, line heights, and colors. Images are cover-cropped with the same focal-point math. The editor zooms the native-size artboard to fit; PNG export renders at the surface's real pixel size. The artboard fades in on each update (opacity only, never geometry); reduced-motion preferences disable the animation.

Both renderers paint in one explicit order from `paintOrder()` in `layout.ts`: background colour, background images, panels, then content. Images use the same cover or contain maths (`crop.ts`). Fonts are installed system stacks (`fonts.ts`), so the font that wraps the text is the font that draws it; the Canvas renderer still waits for `document.fonts` before drawing and exporting.

Future animation fits after resolution: creative → resolved layout → animation transforms → renderer or exporter. Elements already have stable ids, separate content and assets, and an explicit layer order; transforms would never feed back into layout validation. No timeline, playback, GIF or video export exists yet.

## Persistence and cloud

Guest drafts and saved versions live in localStorage. `parseProject` validates and upgrades anything read back: projects saved before the brief-aligned model (1–100 priorities where higher meant more important, a single `safe` inset, `minFont` / `minTarget`) are converted, and the old `forma:` storage keys are still read.

Supabase provides email auth. The `creatives` table and the private `creative-assets` bucket are owner-scoped by row-level and storage policies (select, insert, update, delete); `tests/database.test.ts` runs the real migration SQL against PGlite with two synthetic users. When the deployment's tables or bucket are missing, the app detects PostgREST `PGRST205` or the storage error, disables cloud save and upload, and says so, instead of failing silently.

## Placement planner

```text
Goal → Network objective → Format → Placement (surface + copy fields) → ResolvedLayout
```

The catalog (`src/engine/catalog/data.ts`) is data only. Every value comes from `docs/catalog-verification.md`.
- **Formats** list the objectives they serve.
- **Setup-only formats** (catalogs, lead forms, Masthead, TikTok until verified) carry a reason and generate nothing.
- **Placements** hold one or more accepted sizes (ratio, recommended, minimum, tolerance), copy fields with limits, and a source-image requirement (`media`).
- **Composed placements** also carry a surface template, a `Surface` without identity or size that keeps the input/tap-target union.

`planAll()` plans every placement from one creative. Status is evaluated in a fixed order:
1. setup-only;
2. `media: "none"`;
3. no image (`Needs image` or `Text only`);
4. the size-selection algorithm below.

**Size selection is feasibility first:**
- **Platform-assembled placements** crop the source to each accepted ratio at the focal point.
- **Composed placements** resolve a surface per accepted size, then crop the source to the resolved image box, using the same `coverCrop` the Canvas renderer uses. The minimum is scaled to that box on both dimensions.
- Candidates that meet their minimum are ranked: image kept before image omitted, `ready` before `adapted`, then higher retained area, larger recommended size, and catalog order.
- `Unsupported` only when no candidate is feasible. The issue then states the source size needed.

**Separate results per plan:**
- `fit` (source image only) and `layoutStatus` (composed only);
- copy and destination `issues` (never changing fit);
- information-only `notes`;
- `minimumScale`, which drives the "upload at least W×H" recommendation;
- `pngExport`, which says whether a PNG can be exported and why not.

The goal only changes ranking, badges and (when switched on) element priorities in `toSpec`. The resolver never sees a network or placement name.

## Tradeoffs

The candidate family is small and inspectable. A general solver could find compositions this one reports as impossible, or score layouts differently. One element per role keeps the resolver readable; multiple secondary lines or a logo image would need slot rules for each role. The score weights are hand-tuned for predictability, not learned, and make no claim about conversion.
