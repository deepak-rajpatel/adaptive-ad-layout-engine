# Verification record

Updated 14 September 2026, after the brief-aligned engine rework. Windows 11, Node.js 24.12.0.

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
