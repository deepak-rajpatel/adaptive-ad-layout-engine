# Creative-first product update

The assignment's constraint solver remains the composition engine. A new planning layer starts with the source asset and makes the distinction between a physical canvas, an ad format and a campaign strategy visible.

## Implemented workflow

1. Upload PNG, JPEG, WebP, MP4 or WebM (image limit 10 MB; video limit 100 MB). Images retain their original dimensions in this workflow. Browser decoding reads media type, width, height and video duration. Unsupported or unreadable files show an error.
2. Edit the shared brand/headline, primary text, destination and goal. Goals suggest a CTA; they do not imply that bidding or platform objectives have been configured.
3. Inspect 11 explicit profiles spanning five networks and six container families. Filter by network or status, and expand individual reasons. Matching geometry does not complete multi-asset or carousel requirements.
4. Select up to three illustrative previews. Media crops independently from the surrounding headline/CTA. Focal sliders change the crop; vertical guides highlight approximate areas for manual review.
5. Export the planning report as JSON, including dimensions, crop retention, reasons, source links, selected profiles and strategy. Media files are not embedded in this report.
6. Open an image profile in the existing layout studio. Its dimensions and safe margins become a Surface, and the existing resolver, DOM/Canvas renderers and PNG export handle a composed concept. Native submission still uses separate media/copy.

## Four layers

| Layer     | Implementation                                      | Responsibility                                                                                |
| --------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Asset     | `src/lib/assetInfo.ts`                              | Decode image/video metadata with errors and timeout                                           |
| Container | `Placement.container` in `src/engine/placements.ts` | In-feed, vertical, recommendation, carousel, multi-asset, display                             |
| Placement | `assessPlacement`                                   | Media-kind compatibility, crop loss, target resolution, required fields and additional assets |
| Strategy  | `CreativePlanner` goal and copy fields              | Destination, headline, body and suggested CTA                                                 |

The placement engine is pure TypeScript and independent of React and the layout solver. Profile dimensions are explicit planning targets, not a complete account of accepted network ratios or delivery rules. “Unsupported” means the supplied media kind cannot fill this particular profile.

## Persistence and boundaries

- Brand, headline, focal position and image participate in the existing creative draft/version workflow. Large original images may exceed browser storage; the existing draft-status message reports this, and studio JSON export can preserve the creative.
- Goal, destination and body save separately as one workspace brief. Named creative versions and cloud rows do not yet contain these fields. The exported planning report preserves them.
- Video uses an object URL and stays available while switching between app views. Reloading ends the video session. Frame rate, codec, audio and video transcoding are not implemented.
- Safe-zone overlays are illustrative. No OCR or automatic detection of embedded-text collisions is claimed. Copy checks cover the Google short headline field and a 125-character feed-preview guideline; this is not a comprehensive network policy linter.
- Carousel and responsive display entries explicitly request their additional assets. They are not complete multi-asset editors. Text-only search, HTML5, catalogs, forms, messaging and ad account publishing remain outside the implemented workflow.
- Network API connections, campaign creation, bidding and delivery analytics require a separate integration layer. No ads are published by this app.

## Reference guidance

Reviewed 14 September 2026. Profile source links are available in the UI and exported plan.

- [Google responsive display](https://support.google.com/google-ads/answer/7005917): independently supplied images and text; short and long headlines have distinct limits.
- [YouTube Shorts](https://support.google.com/google-ads/answer/16041697): vertical video recommendations and campaign-specific behavior. This planner models a video profile; it does not rule out image eligibility in other campaign formats.
- [LinkedIn single-image specifications](https://www.linkedin.com/help/linkedin/answer/a426534): format-specific image guidance.
- [Taboola thumbnails](https://developers.taboola.com/backstage-api/docs/item-thumbnail_url): 1000 × 600 or larger for broad placement coverage; publisher crops vary.
- [TikTok in-feed](https://ads.tiktok.com/help/article/tiktok-auction-in-feed-ads): video profile requirements.
- [Meta Ads Guide](https://www.facebook.com/business/ads-guide): placement-specific requirements; generic social ratios are not universal eligibility rules.

## Verification

The added unit suite checks valid destinations, unreadable dimensions, image/video incompatibility, crop loss and post-crop resolution, multi-asset requirements, short headline overflow, blank copy and unknown video duration. Existing layout, persistence, type and database-policy tests remain part of the validation run.

Validation on 14 September 2026: production build passed; all 41 tests across five files passed. Browser checks covered the 390px mobile view, goal/CTA changes, network and status filters including an empty result, image upload retaining 1254 × 1254 pixels, a generated 1080 × 1920 one-second MP4, and image-profile handoff to the layout studio. The in-app browser did not report a download event for the JSON export; actual file delivery remains unverified in that browser.
