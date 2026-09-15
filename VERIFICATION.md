# Verification record

## Current submission — 15 September 2026 (correctness and cleanup pass)

Verified locally after fixing composition completeness. Environment: Windows, Node.js 24.12.0, installed Microsoft Edge through Playwright.

| Check | Result |
| --- | --- |
| `npm test` (Vitest) | **124/124 tests passed across 13 files** |
| New completeness regression tests run against the pre-fix resolver | **10 of the 10 new composition cases failed**, confirming they detect the defect; all pass with the fix |
| `tsc -b` (strict) and `npm run build` | **Passed** |
| Playwright against the production build | **21/21 passed**, including 3 new composition checks in DOM and Canvas |
| Local Markdown links and runtime asset paths | No broken local links; every `/examples/…` and `/headphones.jpg` path used by the app exists in `public/` |

### Defect fixed in this pass

Composition candidates could leave out active elements while returning `ready`. The typographic family has no image slot; the product and panel families have no decoration slot. Reproduced on the sample creative on the kiosk:

- type composition with a required hero image: the image disappeared;
- product or panel composition with a required decoration: the decoration disappeared.

The resolver now rejects any candidate that does not place every active element exactly once (`completenessErrors`, alongside `geometryErrors`). A family that cannot place an active role is skipped with that reason, and the automatic arrangements are tried. Optional elements leave only through the recorded omission step, with their actual reason. A required element that no available arrangement can place returns `impossible`, naming the element and the arrangements that could place it. Legacy layouts are unchanged (v2 golden fixtures still match), and the three composition examples still resolve with their families on the kiosk.

Coverage: `tests/composition.test.ts` → *content completeness* checks every family with absent, optional and required hero and decoration on all four surfaces. It requires each element to be placed exactly once or recorded as omitted, required elements never omitted, and valid geometry. It also covers the three reported cases and the completeness check itself. `tests/e2e/composition.spec.ts` imports each reported case through the UI and checks the DOM, the Canvas pixels and the reported decisions.

## What the automated checks cover

- Four assignment surfaces and arbitrary dimensions, valid geometry, priority-based degradation, minimum text sizes and tap targets, required-content preservation, and explicit impossible results.
- Typed and runtime validation of specs, surfaces and output; engine independence from React and DOM APIs.
- Three new composition directions on all four required surfaces, panel-backed text, contrast checks, aspect-ratio reflow, font-aware measurement and optional decoration.
- Content completeness: no candidate may drop, duplicate or add elements; omissions are explicit and reasoned; required content is never lost silently.
- Legacy project migration, new-field defaults, project round trips and an identical-layout check against saved v2 golden fixtures.
- Example validation and independence: editing an opened example does not mutate its source definition.
- Owner-scoped database and storage policies in PGlite using the migration SQL. This is not a live Supabase certification.
- Planner coverage, filters, ordering, composed output and image-asset downloads.
- Browser workflows for creating, editing, saving, reopening, importing and exporting; draft preservation; desktop, tablet and phone layouts; Appearance changes in DOM/Canvas and native-size PNG downloads.

## Screenshot evidence

The five current screenshots in `docs/screenshots/` were refreshed on 15 September after the checks. Home and Ad Designer were visually inspected during submission preparation. They are genuine application captures, not generated design references.

The screenshots predate this pass's resolver fix. The fix changes behaviour only for composition settings the screenshots do not show, so they still reflect the current UI.

## Reproduce locally

```sh
npm ci
npm test
npm run build
npm run test:e2e
```

`test:e2e` requires Microsoft Edge as configured in `playwright.config.ts`. GitHub Actions runs the unit suite and production build; it does not currently run the Edge browser suite.

For optional diagnostics, run `npm run dev` and open `verify.html` for real-browser text/geometry checks or `verify-export.html` for PNG dimensions. `npm run benchmark` measures resolver execution with a deterministic text-width stub.

## Historical evidence and limits

- `verify.html` re-runs the real-browser text and geometry check on demand; its earlier saved output was a superseded automatic-mode baseline and is no longer in the repository.
- Earlier Node benchmarks measured roughly 1–2 ms per automatic surface. They exclude browser measurement, rendering and the new composition families.
- Current tests cover Chromium-based Edge only; other browsers and a full accessibility audit remain unverified.
- Live cloud CRUD, storage, email delivery and auth redirects were not checked in this pass. Configure Supabase and perform the README's two-account checks before treating cloud use as verified.
- Image export may fail for remote sources that disallow cross-origin access. Network file-weight limits and ad-platform approval are not automatically certified.
- Visual comparison is not pixel-perfect DOM/Canvas equivalence across operating systems. Installed font fallbacks can change appearance.
