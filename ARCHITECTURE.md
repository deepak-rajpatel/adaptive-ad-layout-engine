# Architecture

## Data flow

```text
Creative + Surface
       ↓
Runtime validation → contrast checks
       ↓
Text measurement → candidate geometry search
       ↓
Reject overlaps / out-of-bounds / minimum violations
       ↓
Score viable candidates, or omit next optional element and retry
       ↓
Resolution { status, elements, omitted, decisions, errors }
       ↓
DOM preview    Canvas preview / PNG export
```

## Boundaries

| Module                            | Responsibility                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| `src/engine/types.ts`             | Typed creative, surface, box, and result contracts                                     |
| `src/engine/resolve.ts`           | Pure geometry algorithm and runtime validation; no React or browser dependency         |
| `src/lib/measure.ts`              | Browser Canvas measurement adapter, using the same Arial font and weights as rendering |
| `src/components/Preview.tsx`      | Displays a resolution as DOM or Canvas, including focal-point cover cropping           |
| `src/lib/persistence.ts`          | Validated JSON import, browser storage, image normalization, and download helpers      |
| `src/components/AssetLibrary.tsx` | Reusable local images and user-scoped private Supabase storage                         |
| `src/App.tsx`                     | Editor, constraints, library workflow, and authentication orchestration                |
| `supabase/migrations`             | Explicit database grants, row ownership policies, and private asset bucket             |

## Candidate search

The available safe rectangle is the surface minus its inset. The solver uses dimension-derived spacing and preferred type sizes. It explores:

- Stack: ordered elements in a vertical flow; the image consumes remaining height.
- Split: image and text columns with several width allocations.
- Strip: image, primary copy, and offer/action columns with several allocations.
- Gallery: primary copy above an image and action row.

Each candidate wraps text with an injected width measurement function. Line heights, button padding, and target minima determine actual box heights. The engine tests geometry after placement. It ranks viable candidates by closeness to the arrangement's preferred aspect ratio plus a typography-size reward. Different surface dimensions select different geometries without consulting names or IDs.

The bounded search evaluates up to 40 arrangement/width/scale combinations per active-element set, with up to four active sets (five elements down to mandatory headline and CTA). Text measurement cost is proportional to copy length and candidate count. There is no recursive unbounded solver.

Priority is lexicographic at the element-retention level: every candidate preserving the current active set is considered before any additional omission. Optional elements are sorted by numeric priority, with declarative element order breaking ties. Headline and CTA remain mandatory regardless of their numeric priority.

## Correctness and rendering

A valid output has positive finite rectangles inside the safe area, no pairwise overlap, text at or above minimum font size, and a CTA meeting width and height minima. A separate geometry validator checks those properties. Invalid input and physically impossible input are distinct statuses.

DOM and Canvas consume the same lines, font sizes, line heights, and rectangles. The artboard is zoomed for viewing; export stays at the requested pixel dimensions. Images are cropped intentionally inside their boxes, using the same focal-point math for both backends.

Updates use a short whole-artboard reveal rather than interpolating independent rectangles through one another. Reduced-motion preferences disable animation. The built-in system font avoids a webfont download race. No runtime text is injected as HTML.

## Persistence and security

Guest drafts and saved versions use separate localStorage keys. Storage errors are reported; a failed write is not labeled saved. Imports are validated before use, and unsafe metadata links are removed. JSON exports embed image data rather than temporary object URLs.

Supabase Auth provides sessions and recovery. Publishable client configuration is intentionally public; authorization lives in database/storage policies. Every creative includes an owner UUID, and all four CRUD operations are restricted to that owner. Cross-user ownership changes fail policy checks. Cloud list responses are discarded when the signed-in identity changes during the request.

Private images are stored under `user-id/random-id.webp`. Reads/uploads require that folder owner. A signed URL is used only to display the library thumbnail. When selected, the image is downloaded into an embedded snapshot so the creative remains stable across URL expiration. The image-library upload is explicit, not an automatic side effect of choosing a local file.

The database test suite applies the actual migration SQL twice and checks isolation with two synthetic users under the authenticated role. This validates SQL semantics locally; real email delivery and deployed auth redirects still need a configured Supabase project.

## Tradeoffs

The solver deliberately uses a small, inspectable candidate family. It can report impossible where a more sophisticated solver might find another layout. It favors predictable behavior and explainability over arbitrary visual compositions. There is no claim of conversion optimization, platform approval, or global optimality.

Snapshots embed images for portability. This trades storage efficiency for reliable recovery and simple ownership. A larger product could normalize asset references, add version tables, paginate the creative list, and garbage-collect unused uploads. These extensions are not implied by the current app.
