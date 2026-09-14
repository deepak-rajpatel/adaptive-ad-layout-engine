# Verification record

Date: 14 September 2026. Build environment: Windows, Node.js 24.12.0.

## Automated

- Engine tests: all four required profiles retain five elements and select four distinct arrangements; name/ID independence; geometry checks across 221 dimension combinations; optional-element priority order; impossible inputs; malformed input; known contrast ratios; deterministic text wrapping.
- Import tests: round trip, invalid payloads, executable metadata links, and object-valued display metadata.
- Database tests: actual migration SQL run against PGlite with synthetic Supabase auth/storage scaffolding. Owner CRUD visibility; cross-user read/update/delete/forged-insert denial; forbidden ownership transfer; anonymous denial; private storage folder isolation. Migrations are run twice to check rerun behavior.
- TypeScript strict compilation and Vite production build.
- npm dependency audit.

## Browser checks

Checked using the in-app Chromium browser:

- Desktop 1440px, tablet 820px, phone 390px, and small phone 320px layouts.
- Editing headline updates every required preview.
- Save local version, open library, favorite, filter favorites, reload, and restore browser draft.
- Mobile Edit / Preview / Inspect navigation.
- Constrained dimensions yield optional elements in priority order without dropping headline/CTA.
- Canvas rendering loads the product image and matches the selected layout family.
- No console errors observed during the checked edit/save/render flows.

## External provisioning

A read-only request to the configured Supabase Auth settings returned HTTP 200: email signup is enabled, signup is not disabled, and email confirmation is required.

The dashboard account is not connected to this task's browser tools. The publishable key cannot create tables, policies, or buckets. Consequently, live cloud CRUD, storage upload, email delivery, and auth redirects cannot be certified until the owner runs the two SQL migrations and configures the production Site URL. Local database policy tests do not establish that these migrations have been applied to production.

The local guest studio is independently usable. The application reports cloud failures instead of silently claiming to save.

## Final local results

- 17 tests passed across 3 suites.
- Strict TypeScript and production build passed.
- npm audit reported 0 vulnerabilities.
- Solver benchmark: 1,000 runs after 100 warm-up runs, Node 24.12.0; mean 0.283 ms, p95 0.552 ms. Uses a deterministic width stub and excludes browser font measurement/rendering. Reproduce with npm run benchmark.
- At 320px, the header was corrected to two rows; document width no longer exceeds the viewport. Keyboard arrow navigation between mobile panels was checked.
- PNG generation reported a 600 × 600px export in-browser. The in-app browser did not expose a download-completion event, so file delivery should also be checked in a normal browser.

## Deployment verification

- Commit 1427254 passed GitHub Actions and Vercel deployment checks. The production URL returned HTTP 200 and the studio rendered in Chromium.
- A read-only production Supabase check returned PGRST205 for public.creatives, confirming that the first migration had not yet been applied.
- The generated PNG was slow on the test connection. A 128,930-byte JPEG web copy replaces the 1,674,977-byte original in the default creative (about 92% less data). The original remains in design, and the old asset URL redirects for saved-version compatibility.
