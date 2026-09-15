# Placement catalog verification

Checked 14 September 2026, as the planner's data-verification gate. Only values in this file can ship in the catalog. Everything here is a planning check, not network approval.

**Status key**
- **Verified:** read on the official page linked.
- **Summary only:** stated in an official page's search-result summary; the full page was not read.
- **Derived:** not stated directly, but calculated from a verified value (explained inline).
- **Unverified:** not confirmed. The value is not used for checks.

**Counting rules:** no official page states how characters are counted (code points vs UTF-16). Every copy check therefore uses the planner's code-point count and is labelled "counted by the planner". Limits below that are recommendations ("to avoid truncation") become **warnings**, not errors (D3).

**Meta pages:** these were served in Hindi. The numbers are quoted from them unchanged; only the labels were translated.

---

## Meta

| Placement | Ratios | Recommended | Minimum | Copy | Status |
|---|---|---|---|---|---|
| **Feed** (Facebook & Instagram), platform-assembled | 4:5 recommended; accepted range 4:5 to 1.91:1, so 1:1 and 1.91:1 also fit | 1440×1800 (4:5) | width 600, height 750 for 4:5 (Facebook); width 500 (Instagram); tolerance 3% (FB) / 1% (IG) | Primary text: 125 recommended (IG), 50–150 (FB). Headline: 27 (FB), 40 (IG) | Verified. 1:1 and 1.91:1 are **derived** from the Instagram range "400×500 to 191×100". Their recommended sizes (1440×1440, 1440×754) are derived at the same 1440 px width. |
| **Stories** (Instagram), composed | 9:16 | at least 1440×2560 | width 500 (→ 500×889); tolerance 1% | Primary text 125 | Verified. Safe zone: keep the **top 14%, bottom ~35% and 6% on each side** free of text and logos. |
| **Right column** (Facebook), platform-assembled | 1:1 | at least 1080×1080 | 254×133 (as stated) | Headline 40 | Verified. Guide advises no text overlays at this size. |
| **Carousel card** (Facebook feed), platform-assembled | 1:1 | at least 1080×1080 | not stated separately; "at least 1080×1080" is used as the minimum (stricter) | Primary 80, headline 20, description 18; 2–10 cards; tolerance 3% | Verified. A search summary said "headline 45"; the official page says 20, and 20 is used. |

Sources:
- [Facebook feed image](https://www.facebook.com/business/ads-guide/image/facebook-feed)
- [Instagram feed image](https://www.facebook.com/business/ads-guide/update/image/instagram-feed)
- [Instagram Stories image](https://www.facebook.com/business/ads-guide/image/instagram-story)
- [Facebook right column](https://www.facebook.com/business/ads-guide/update/image/facebook-right-hand-column)
- [Facebook feed carousel](https://www.facebook.com/business/ads-guide/update/carousel/facebook-feed/link-clicks)

**Surface-size note (Stories):** the recommended 1440×2560 exceeds the engine's 2400 px surface limit. The composed Stories surface uses **1080×1920**: same 9:16 ratio, above the 500 px minimum width. Validation is not loosened. Safe insets at 1080×1920: top 269, bottom 672, left/right 65.

## Google

| Placement | Ratios | Recommended | Minimum | Copy | Status |
|---|---|---|---|---|---|
| **Responsive display**, platform-assembled | 1.91:1; 1:1 | 1200×628; 600×600 | 600×314; 300×300 | Headline 30 (1–5), long headline 90 (1), description 90 (1–5), business name 25 | Verified. **Conflict:** the older RDA page recommends a 1200×1200 square; the newer spec page says 600×600. The newer page is used for the recommended size; the minimum (300×300) is the same on both. |
| **Performance Max**, platform-assembled | 1.91:1; 1:1; 4:5 | 1200×628; 1200×1200; 960×1200 | 600×314; 300×300; 480×600 | Headlines 30 (3–15; at least one ≤ 15), long headline 90 (1–5), description 90 (2–5), business name 25 | Verified |
| **Demand Gen image**, platform-assembled | 1.91:1; 1:1; 4:5; 9:16 | 1200×628; 1200×1200; 960×1200; 1080×1920 | 600×314; 300×300; 480×600; 600×1067 | Headline 40, description 90, business name 25 | Verified. A search summary said "headline 15"; the official page says 40, and 40 is used. |
| **Uploaded display banners**, composed | Fixed sizes (below) | — | — | Text is part of the image | Verified. File types GIF/JPG/PNG, **max 150 KB**; GIF animation ≤ 30 s, must stop after 30 s, slower than 5 FPS. |

**Verified banner sizes:**
- 200×200, 240×400, 250×250, 250×360, 300×250, 336×280, 580×400;
- 120×600, 160×600, 300×600, 300×1050;
- 468×60, 728×90, 930×180, 970×90, 970×250, 980×120;
- 300×50, 320×50, 320×100.

The catalog uses the 13 already in the IAB presets (300×250, 728×90, 160×600, 300×600, 320×50, 320×100, 336×280, 970×250, 970×90, 120×600, 300×1050, 468×60, 300×50). All 13 are on Google's list.

**Export note:** PNG exports are not guaranteed to be under 150 KB. The planner shows this as an info note, not a pass/fail check.

Sources:
- [Responsive display specs](https://support.google.com/google-ads/answer/17090561?hl=en)
- [Responsive display (older page)](https://support.google.com/google-ads/answer/7005917)
- [Performance Max specs](https://support.google.com/google-ads/answer/17091269?hl=en)
- [Demand Gen asset specs](https://support.google.com/google-ads/answer/13704860?hl=en)
- [Demand Gen image specs](https://support.google.com/google-ads/answer/17140672?hl=en)
- [Uploaded display ads](https://support.google.com/google-ads/answer/1722096)

## Taboola

| Placement | Ratios | Recommended | Minimum | Copy | Status |
|---|---|---|---|---|---|
| **Native recommendation**, platform-assembled | 16:9 preferred; 4:3; 1:1 | 1200×674 (Realize help) / "1000×600 or larger" (Backstage API) | **600×400** (Backstage API); Realize help says 400×350. The stricter 600×400 is used. | Title 60 max (34–45 best), branding text 30 max, description 250 max (180–200 best) | Verified. Max file 5 MB (Realize) / 2.5 MB (Backstage). Publisher crops vary. |

Sources:
- [Realize title & thumbnail best practices](https://realize.com/help/en/articles/8964660-video-title-and-thumbnail-best-practices)
- [Backstage API thumbnail](https://developers.taboola.com/backstage-api/docs/item-thumbnail_url)

## LinkedIn

| Placement | Ratios | Recommended | Minimum | Copy | Status |
|---|---|---|---|---|---|
| **Single image**, platform-assembled | 1.91:1; 1:1; 4:5 | 1200×628; 1200×1200; 720×900 | 640×360; 360×360; 360×640 (as stated) | Intro text 150 before truncation (3,000 max); headline 70 before truncation (200 max); description 100 (300 max) | Verified. JPG/PNG/GIF, 5 MB. |
| **Carousel card**, platform-assembled | 1:1 | 1080×1080 | not stated; 1080×1080 is used as the minimum (stricter) | Intro text 150 before truncation (255 max); card headline "two lines" (no character limit on the official page); 2–10 cards | Verified. The card headline character limit (45 in a search summary) is **unverified**, so there is no headline length check. |

Sources:
- [Single image ads](https://www.linkedin.com/help/lms/answer/a426534)
- [Carousel ads](https://www.linkedin.com/help/lms/answer/a427022)

## TikTok: not verified

`ads.tiktok.com` could not be reached from this machine (DNS failure, twice). Search summaries mention image carousel ads (2–35 images; 1200×628 / 640×640 / 720×1280; "≤100 KB"), but none of it was read on an official page. Per B10:
- **TikTok formats ship as `buildable: false`,** with the reason "Specs not yet verified".
- **No generic single-image TikTok placement exists.** Image delivery appears to go through Carousel Ads.

Retry: [Carousel ads specs](https://ads.tiktok.com/help/article/specifications-for-carousel-ads).

---

## Objective names (goal mapping)

| Network | Official objective names | Status |
|---|---|---|
| Meta | Awareness, Traffic, Engagement, Leads, App promotion, Sales | Summary only: [Choosing objectives](https://www.facebook.com/business/help/1438417719786914) |
| Google | Sales, Leads, Website traffic, Product or brand consideration, Brand awareness and reach (for new campaigns shown as "YouTube reach, views, and engagements"), App promotion, Local store visits and promotions | Summary only: [About campaign objectives](https://support.google.com/google-ads/answer/7450050?hl=en) |
| Taboola | Brand Awareness, Website Engagement, Lead Generation, Online Purchases, App Promotion | Summary only: [Setting your marketing objective](https://help.taboola.com/hc/en-us/articles/115000946794-Setting-Your-Marketing-Objective) |
| LinkedIn | Brand awareness, Website visits, Engagement, Lead generation, Website conversions (also Video views, Job applicants, Talent leads) | Summary only: [Marketing objectives](https://www.linkedin.com/help/lms/answer/a424570) |

**Goal mapping used in the catalog.** This mapping is our interpretation, not a network rule. The Google column is approximate, because campaign types don't map 1:1.

| Goal | Meta | Google | Taboola | LinkedIn |
|---|---|---|---|---|
| Awareness | Awareness | Brand awareness and reach | Brand Awareness | Brand awareness |
| Consideration | Traffic; Engagement | Website traffic; Product or brand consideration | Website Engagement | Website visits; Engagement |
| Leads | Leads | Leads | Lead Generation | Lead generation |
| Sales | Sales | Sales | Online Purchases | Website conversions |

## Excluded or setup-only (not buildable)

- **TikTok:** all formats, until verified.
- **Meta:** Instant Forms, Advantage+ catalog, Collection, click-to-message.
- **Google:** Shopping, App campaigns, YouTube Masthead, Local Services Ads, responsive search ads (text-only formats need verified copy fields and a copy-only preview before they can be buildable, E5).
- **Taboola:** dynamic retargeting.
- **LinkedIn:** Lead Gen Forms, Conversation / Message ads, Document ads, Job ads, Thought Leader ads.

These appear only behind "Show setup-only formats", each with its reason.
