# Forma — Adaptive Ad Layout Engine

[Live studio](https://adaptive-ad-layout-engine.vercel.app/) · [Source](https://github.com/deepak-rajpatel/adaptive-ad-layout-engine)

Create one ad and adapt it to mobile portrait, mobile landscape, a broadcast lower-third, and a square retail kiosk. The TypeScript resolver measures text, explores candidate arrangements, and returns explicit geometry and explanations. No login is required to try the engine.

## Three things to try

1. Change the headline. All four previews update from the same creative specification.
2. Choose **Push the limits**. Optional elements yield in ascending priority order; the headline and CTA remain mandatory. Increase the minimum text size or shrink dimensions further to see an explicit impossible result.
3. Switch **DOM / Canvas**, export a full-resolution PNG, then save a version and find it in **My creatives**. Guest versions stay in this browser; cloud versions require the Supabase setup below.

## Features

- Four required surfaces plus custom dimensions, Google Display size presets, and a clearly labeled Taboola concept canvas.
- Real Canvas text metrics, deterministic wrapping, minimum font/target constraints, safe areas, contrast checking, and overlap/bounds validation.
- DOM and Canvas render the same resolved elements. PNG export uses native surface dimensions, not the scaled editor preview.
- Image uploads, focal-point controls, palette editing, and priority controls.
- Responsive desktop, tablet, and phone workspace; light/dark themes; keyboard-accessible controls and reduced-motion support.
- Autosaved browser drafts, named versions, favorites, collections, duplicate, rename, delete, and portable JSON import/export with embedded images.
- Supabase email signup/login, password recovery, private cloud creatives, and a private reusable image library.

## Run locally

Use Node.js 22.12+ or 24 LTS and npm.

```sh
npm ci
# Copy .env.example to .env.local and fill in your Supabase project URL and publishable key.
npm run dev
```

The studio also runs without Supabase configuration; guest editing and local saving remain available.

```sh
npm test
npm run build
npm run preview
```

Scripts invoke Node entry points directly because Windows command shims can fail when the parent folder contains an ampersand. The same scripts work on Vercel/Linux.

## Supabase setup (required for cloud features)

Creating the Supabase project and setting environment variables alone does not create application tables.

1. In **SQL Editor**, run these files in order:
   - `supabase/migrations/202609140001_creatives.sql`
   - `supabase/migrations/202609140002_assets.sql`
2. In **Authentication → URL Configuration**, set **Site URL** to `https://adaptive-ad-layout-engine.vercel.app`.
3. Add the production URL and `http://127.0.0.1:5173` to the allowed redirect URLs. Only add preview URLs you control when testing authentication on preview deployments.
4. Keep email confirmation enabled. For real users, configure your own email provider/SMTP in Supabase; its default email service has delivery restrictions and rate limits. Test the confirmation and recovery messages before inviting reviewers to create accounts.
5. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to `.env.local` and Vercel Production/Preview as **Config** variables. Never put a secret/service-role key into a `VITE_` variable.
6. Create a test account through the app, confirm its email, save a cloud version, sign out, and verify a different account cannot see it.

The migrations grant authenticated access explicitly because automatic exposure of new tables can be disabled. Row-level security restricts each creative to `auth.uid() = user_id`. The private image bucket permits reads/uploads only inside the signed-in user's folder. The application never needs an administrative key.

Cloud image previews use short-lived signed URLs. Selecting an image downloads and embeds a copy into the creative so saved versions do not break when the signed URL expires. Uploads are normalized to WebP at up to 1200px; each cloud asset is limited to 3 MB. The image library lists the latest 100 assets.

## Vercel deployment

The repository is connected to Vercel. `vercel.json` selects Vite, builds with `npm run build`, and publishes `dist`. Pushes to `main` trigger production deployments. Database migrations must be applied separately; a frontend deployment does not run SQL.

A working frontend does not prove cloud provisioning is complete. If cloud setup is unavailable, the app reports the failure and local saves remain usable.

## Algorithm

See [ARCHITECTURE.md](ARCHITECTURE.md) for the data flow and tradeoffs.

The engine validates inputs, computes text/background and button contrast, and explores four generic arrangements: stack, split, strip, and gallery. For each it tries preferred typography at four scales and multiple width allocations. Invalid geometry is rejected. A score balances surface aspect ratio and readable typography; stable iteration order breaks ties.

Only after every candidate fails does the engine omit the next optional element by ascending priority and retry. Headline and CTA cannot be omitted. If those cannot fit, the result is `impossible`, not a clipped or falsely successful ad. Font and target constraints are never relaxed below the supplied minima.

There are no surface-name or platform-name branches in the resolver. Breakpoints organize the editing interface; they do not decide ad geometry. Scaling an artboard to fit the workspace is viewing zoom only.

## Verification

Automated tests exercise a grid of unfamiliar dimensions, all required arrangements, deterministic priority omission, contrast, invalid inputs, text wrapping, portable import validation, and Postgres ownership policies. Database tests use PGlite (actual Postgres semantics) with a minimal Supabase auth/storage test schema; they are not a substitute for testing the configured live Supabase instance.

See [VERIFICATION.md](VERIFICATION.md) for the recorded checks and remaining external setup.

## Scope and limitations

- Accessibility checks cover solid-color text/background contrast and CTA target dimensions. They do not constitute a complete WCAG audit. No text is placed on top of product photography.
- The four candidate arrangement families are a bounded search, not a globally optimal layout solver. Unsupported unbreakable text can produce an explicit impossible result. The engine does not silently truncate copy.
- Images intentionally use cover cropping with user-controlled focal points. Text and element boxes cannot overlap or leave the safe area.
- Saved versions are snapshots, not collaborative editing or automatic cross-device draft synchronization. Collections are labels on versions.
- Local data can be lost when browser storage is cleared or full. JSON export embeds the image for backup. Cloud deletion removes the selected saved version.
- Google presets check canvas dimensions only. The Taboola canvas is a composition concept: actual native ads assemble separate assets. Neither checks all network policies or guarantees approval. Meta-specific presets are not claimed because its current official specification page could not be verified during this build; arbitrary social dimensions can be entered as a custom surface.
- External HTTPS images may fail PNG export if their server blocks cross-origin access. Upload a local image instead.

## Sources

- [Google Display sizes](https://support.google.com/google-ads/answer/7031480)
- [Taboola image specifications](https://developers.taboola.com/backstage-api/docs/item-thumbnail_url)
- [Supabase React setup](https://supabase.com/docs/guides/getting-started/quickstarts/reactjs)
- [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase storage access controls](https://supabase.com/docs/guides/storage/security/access-control)

## AI use and time accounting

Codex assisted with architecture, implementation, tests, debugging, and documentation. The built-in image generator created the responsive design reference and the sample headphone product image. The reference is a design concept, not a screenshot of working software. Prompts and asset provenance are in [design/README.md](design/README.md).

Implementation took place on 14 September 2026. The first recorded generation/setup checkpoint was at 03:18 IST; a scheduled continuation resumed at 05:20 IST after an interruption. No reliable active-work timer was maintained, so an exact human-hours total is not claimed. This is an AI-assisted implementation and should be reviewed and understood by the submitting developer.
