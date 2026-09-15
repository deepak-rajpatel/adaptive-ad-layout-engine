# Verification record

## Final submission — 15 September 2026

### Implementation checks reported by Claude Code

The following results are from Claude's final implementation handoff. Codex reviewed the source and captures but did not rerun these suites or the build during final submission preparation, as requested by the author.

| Check | Reported result |
| --- | --- |
| Unit tests | 155/155 passed across 14 files |
| Strict TypeScript and Vite production build | Passed |
| Playwright browser tests | 22/22 passed in Microsoft Edge |

Coverage includes assignment surfaces, arbitrary dimensions, required-content completeness, priority omissions, legacy defaults, persistence, logo proportions, image fitting, mask and border geometry, polygon overlap, badge contrast and the 20% badge-coverage rule. Browser checks cover the connected editor workflow, import/export and image proportions through uploads and saved work. Live Supabase image-library selection was not browser-tested.

### Final source and screenshot review

Codex reviewed the candidate completeness checks, composition typography, image-proportion handling and badge placement. The badge accepts only placements covering at most 20% of the rendered image rectangle; it tries smaller readable sizes before rejecting the candidate. Other candidates and normal priority omissions follow. This measures rectangle overlap, not the visible product silhouette.

The five curated screenshots under `docs/screenshots/` were refreshed from the current source through the local Vite development server. They show first-visit Home, Create, ZESTO in Ad Designer, Ad platforms and the empty local library. Temporary capture code was kept in an ignored folder and removed afterwards. Earlier v11–v13 comparison boards remain outside the repository.

Submission preparation also adds a known-clutter path guard, a local pre-commit hook and a CI invocation. The staged-path guard and staged diff are reviewed before commit. This is repository hygiene, not application testing.

## Reproduce application verification

```sh
npm ci
npm test
npm run build
npm run test:e2e
```

Browser tests require Microsoft Edge as configured in `playwright.config.ts`. GitHub Actions runs the tracked-path guard, unit tests and production build; browser tests are local only.

Optional diagnostics: run `npm run dev`, then open `verify.html` for browser text/geometry checks or `verify-export.html` for PNG dimensions. `npm run benchmark` measures the resolver with a deterministic text-width substitute; it is not a browser or all-composition benchmark.

## Limits and unfinished work

- ZESTO uses original SVG illustration, not food photography. Its photographic direction remains unfinished pending a suitable asset; this does not prevent the assignment demo from running.
- The 240×80 example deliberately omits optional content by priority. Required elements are never silently omitted.
- Typography and available composition families form a bounded search, not a general typesetting solver. Very long content may produce an impossible result.
- Specs with a composition protect numeric/currency content from truncation, including automatic fallback. Legacy automatic specs retain their original truncation behaviour.
- Edge is the only browser reported as verified. No full accessibility audit or pixel-perfect cross-platform renderer equivalence is claimed.
- Cloud CRUD, storage, email delivery and auth redirects were not live-verified during this pass. PGlite policy tests do not certify a deployed Supabase project.
- Remote images may prevent export through CORS. File-weight limits and ad-network acceptance are not automatically certified.
- Historical automatic-layout timings are not new performance measurements of the expanded engine.
