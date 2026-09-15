# Verification record

## Current submission — 15 September 2026

Verified locally after the editable composition and Home updates. Environment: Windows, Node.js 24.12.0, installed Microsoft Edge through Playwright. These are executed checks, not claims based only on the implementation handoff.

| Check | Result |
| --- | --- |
| `npm test` | **113/113 tests passed across 13 files** |
| `npm run build` (strict TypeScript plus Vite) | **Passed** |
| `node node_modules/@playwright/test/cli.js test` against the production build | **18/18 passed** |
| Updated application screenshots | Home, Create, TIDYDAY in Ad Designer, Ad platforms, empty My creatives captured from the production preview |

The type checker and Vite commands were run directly, equivalent to the build script. Browser tests used the resulting production build. Documentation and screenshots were updated afterwards; application code was not changed during submission preparation.

## What the automated checks cover

- Four assignment surfaces and arbitrary dimensions, valid geometry, priority-based degradation, minimum text sizes and tap targets, required-content preservation, and explicit impossible results.
- Typed and runtime validation of specs, surfaces and output; engine independence from React and DOM APIs.
- Three new composition directions on all four required surfaces, panel-backed text, contrast checks, aspect-ratio reflow, font-aware measurement and optional decoration.
- Legacy project migration, new-field defaults, project round trips and an identical-layout check against saved v2 golden fixtures.
- Example validation and independence: editing an opened example does not mutate its source definition.
- Owner-scoped database and storage policies in PGlite using the migration SQL. This is not a live Supabase certification.
- Planner coverage, filters, ordering, composed output and image-asset downloads.
- Browser workflows for creating, editing, saving, reopening, importing and exporting; draft preservation; desktop, tablet and phone layouts; Appearance changes in DOM/Canvas and native-size PNG downloads.

## Screenshot evidence

The five current screenshots in `docs/screenshots/` were refreshed on 15 September after the checks. Home and Ad Designer were visually inspected during submission preparation. They are genuine application captures, not generated design references.

Claude's implementation handoff additionally reports comparing all three new directions on four surfaces in both DOM and Canvas, including native-size exports. Those temporary comparison captures were not retained; that full comparison was not independently repeated in this submission pass.

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

- `docs/browser-verification.json` is an earlier automatic-mode baseline: 25 presets with no reported problems. It is retained as historical evidence, not a current check of the new composition families.
- Earlier Node benchmarks measured roughly 1–2 ms per automatic surface. They exclude browser measurement, rendering and the new composition families.
- Current tests cover Chromium-based Edge only; other browsers and a full accessibility audit remain unverified.
- Live cloud CRUD, storage, email delivery and auth redirects were not checked in this pass. Configure Supabase and perform the README's two-account checks before treating cloud use as verified.
- Image export may fail for remote sources that disallow cross-origin access. Network file-weight limits and ad-platform approval are not automatically certified.
- Visual comparison is not pixel-perfect DOM/Canvas equivalence across operating systems. Installed font fallbacks can change appearance.
