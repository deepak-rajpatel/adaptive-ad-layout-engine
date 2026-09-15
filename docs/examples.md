# Example ads

Nine editable examples: three Sales and two each for Leads, Awareness and Traffic, defined in `src/engine/examples.ts`. Brands are fictional. Each example is a complete creative that resolves through the same engine as user-created ads; Home and the Create-page chooser show the actual resolved layout on the retail kiosk (1080 × 1080), which is the surface an example opens on. Unit tests cover every example's validation and the four required surfaces.

| Goal | Example (id) | Image |
| --- | --- | --- |
| Sales | Voxora headphones (`sales-voxora-headphones`) | `public/headphones.jpg` (existing project asset) |
| Sales | Everyday essentials sale (`sales-dayform-essentials`) | `public/examples/dayform-accessories.jpg` |
| Sales | Noodle bowl delivery (`sales-zesto-noodle-bowl`) | Illustration `public/examples/zesto-noodle-bowl.svg`; logo `public/examples/zesto-logo.svg` |
| Leads | Home-cleaning quote (`leads-tidyday-quote`) | `public/examples/tidyday-living-room.jpg` |
| Leads | Fitness consultation (`leads-movewell-consultation`) | `public/examples/movewell-fitness.jpg` |
| Awareness | Coffee brand introduction (`awareness-morning-fold-coffee`) | `public/examples/morning-fold-coffee.jpg` |
| Awareness | Community reading initiative (`awareness-open-shelf-reading`) | No photo, by design. Decoration: `public/examples/open-shelf-book.svg` |
| Traffic | Weekend travel guide (`traffic-weekend-notes-guide`) | `public/examples/weekend-notes-travel.jpg` |
| Traffic | Workspace article (`traffic-small-space-workspace`) | `public/examples/small-space-desk.jpg` |

## Creative directions

DAYFORM, TIDYDAY and OPEN SHELF follow three approved AI-generated visual references. Those flattened PNGs were art direction only: they were never loaded by the application and are kept outside the submission. Each example is rebuilt from separate, editable elements through reusable composition families, not example-specific code:

| Example | Composition | Editable elements |
| --- | --- | --- |
| DAYFORM | Product-led, 52% product region | Brand, headline, supporting line, offer, button; product photo (replace, fit, focal point) |
| TIDYDAY | Photo and panel, forest-green panel | Brand, headline, supporting line, offer, button; room photo; panel colour |
| OPEN SHELF | Typographic, serif headline, decoration | Brand, headline, tagline (offer), button; replaceable book decoration |
| ZESTO | Product-led, transparent illustration (Fit whole image), diagonal background division | Image logo (no brand text), headline, supporting line, offer, circular "30% OFF" badge, button; each is independent |

CTAs use the curated button list (Shop Now, Get Quote, Learn More) rather than the references' custom labels. The layouts reflow on the four required surfaces; see ARCHITECTURE.md.

## Image provenance

- `public/headphones.jpg`: a fictional, unbranded headphone product render made with Codex's built-in image-generation tool on 14 September 2026 (a web-optimized copy of the original render; no text, logo or watermark). Used by Voxora and the Home hero demonstration.
- The six JPEG files in `public/examples/` are original AI-generated images, created on 15 September 2026 with Codex's built-in OpenAI image-generation tool for these fictional campaigns. They are not stock photos and do not show verified real places, products or venues. No third-party licence is claimed; use is subject to the applicable OpenAI terms. The exact generation prompts are in [generated-example-assets.md](generated-example-assets.md).
- Each is a photograph only, with no headlines, logos, prices or buttons. All ad text stays as separate, editable elements.
- `public/examples/open-shelf-book.svg`: an original abstract open-book illustration, hand-authored as vector code for this project (15 September 2026). It has no external source and contains no text. It is decoration: replaceable, never cropped, and the first element omitted when space is short.
- `public/examples/zesto-noodle-bowl.svg` and `public/examples/zesto-logo.svg`: original vector artwork for the fictional ZESTO brand, hand-authored as SVG code for this project (15 September 2026). The bowl is a top-down illustration on a transparent background. The logo's wordmark is drawn as paths, not font text. Neither has an external source, and neither contains ad copy. The bowl is an illustration, not food photography: no food photograph was available and none was generated or downloaded. A real photograph (ideally a transparent cut-out) can replace it through the editor without code changes.
- Superseded Home/UI mockups and implementation handoff notes are archived locally outside the submission. No example photographs were cropped from a UI mockup.
- The Home hero demonstration uses the Voxora example (and so `public/headphones.jpg`), resolved live on the portrait, kiosk and broadcast surfaces.

## Crop settings

Focal points (`focalX`, `focalY`, in percent) were chosen by checking the resolved image regions on all four required surfaces. The engine cover-crops each image into its own region; very wide regions cannot show every object, so the main subject is kept.

| Example | Focal point | Kept in view |
| --- | --- | --- |
| DAYFORM | 50, 55 | Tote and bottle |
| TIDYDAY | 52, 60 | Sofa and coffee table |
| MOVEWELL | 50, 62 | Dumbbells, mat and bottle |
| MORNING FOLD | 56, 58 | Coffee bag and cup |
| WEEKEND NOTES | 50, 53 | Lakeside cabin |
| SMALL SPACE | 50, 45 | Desktop and lamp |
