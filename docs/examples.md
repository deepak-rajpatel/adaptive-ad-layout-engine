# Example ads

Eight editable examples, two per goal, defined in `src/engine/examples.ts`. Brands are fictional. Each example is a complete creative that resolves through the same engine as user-created ads; Home and the Create-page chooser show the actual resolved layout on the retail kiosk (1080 × 1080), which is the surface an example opens on. Unit tests check every example against validation and the four required surfaces.

| Goal | Example (id) | Image |
| --- | --- | --- |
| Sales | Voxora headphones (`sales-voxora-headphones`) | `public/headphones.jpg` (existing project asset) |
| Sales | Everyday essentials sale (`sales-dayform-essentials`) | Missing: text-only for now |
| Leads | Home-cleaning quote (`leads-tidyday-quote`) | Missing: text-only for now |
| Leads | Fitness consultation (`leads-movewell-consultation`) | Missing: text-only for now |
| Awareness | Coffee brand introduction (`awareness-morning-fold-coffee`) | Missing: text-only for now |
| Awareness | Community reading initiative (`awareness-open-shelf-reading`) | None, by design (text-only) |
| Traffic | Weekend travel guide (`traffic-weekend-notes-guide`) | Missing: text-only for now |
| Traffic | Workspace article (`traffic-small-space-workspace`) | Missing: text-only for now |

## Image provenance

- `public/headphones.jpg`: the project's existing product image, used only for Voxora.
- No other images have been added. The session that built this library had no image-generation capability, and the brief rules out hotlinking, stock downloads and image APIs.

## Images still needed

Place original images under `public/examples/` (JPEG or WebP; no baked-in text, prices, logos or buttons; subject centred so it crops to portrait, landscape, square and very wide strips), then set `image` (and `focalX` / `focalY` if needed) on the example:

- Everyday essentials: a coordinated arrangement of everyday accessories or home goods.
- Home cleaning: a bright, tidy living room.
- Fitness consultation: a welcoming fitness setting or exercise equipment.
- Coffee introduction: coffee packaging and a cup, warm lighting.
- Weekend travel: an inviting landscape or destination scene.
- Workspace article: a carefully arranged desk in a small workspace.

Record each image's source and licence here when added.
