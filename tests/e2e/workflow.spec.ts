// The connected journey: Home → Create an ad → Ad Designer → Ad platforms → Save / Export,
// reopening from My creatives and continuing a draft from Home. Uses real persistence.
// Set DESIGNER_SHOTS=<folder> to also save review screenshots.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const shots = process.env.DESIGNER_SHOTS;
const nav = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name, exact: true })
    .click();
const headline = (page: Page) => page.locator("#panel-edit textarea").first();
const brand = (page: Page) => page.locator("#panel-edit input").first();
const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};
const pngSize = (file: string) => {
  const buf = readFileSync(file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
};

test.describe("desktop", () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test("first visit → create → edit → platforms → save → reopen → continue → export", async ({ page }) => {
    // 1. First visit: no fabricated work.
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "One ad. Every screen." })).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue editing/ })).toHaveCount(0);
    await shot(page, "flow-1-home-first");
    await page.getByRole("button", { name: "Create an ad" }).first().click();
    await expect(page.getByRole("heading", { name: "Create your first ad" })).toBeVisible();

    // The headline is the only thing needed to begin.
    await page.getByRole("button", { name: /Open Ad Designer/ }).click();
    await expect(page.getByText("Add a headline to continue")).toBeVisible();
    await page.locator(".goal-tile", { hasText: "Leads" }).click();
    await page.getByLabel("Creative name").fill("Launch test");
    await page.getByLabel("Headline").fill("Hello world");
    await shot(page, "flow-2-create");
    await page.getByRole("button", { name: /Open Ad Designer/ }).click();

    // 2. The new creative is open and editable; the chosen goal is the designer's goal.
    await expect(page.getByRole("heading", { name: "Ad Designer", level: 1 })).toBeVisible();
    await expect(headline(page)).toHaveValue("Hello world");
    await expect(page.locator("#panel-edit select").first()).toHaveValue("Leads");
    await expect(page.locator(".designer-toolbar")).toContainText("Launch test");
    await brand(page).fill("ACME");

    // 3. Browse platforms with the same creative, then open a placement.
    await nav(page, "Ad platforms");
    await expect(page.locator(".platforms-context")).toContainText("Launch test");
    await expect(page.locator(".platforms-context select")).toHaveValue("Leads");
    await shot(page, "flow-3-platforms");
    await page
      .locator('[data-placement-id="google-300x250"]')
      .getByRole("button", { name: /Open in Ad Designer/ })
      .click();

    // 4. Back in the designer at that placement, nothing lost.
    await expect(page.locator(".stage-caption")).toContainText("300 × 250");
    await expect(headline(page)).toHaveValue("Hello world");
    await expect(brand(page)).toHaveValue("ACME");

    // 5. Save through the real buttons, keep editing, then reopen the saved version.
    await page.locator(".designer-toolbar").getByRole("button", { name: "Save version" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Creative name")).toHaveValue("Launch test");
    await dialog.getByRole("button", { name: "Save version" }).click();
    await expect(dialog).toBeHidden();
    await headline(page).fill("Changed after saving");
    await nav(page, "My creatives");
    await expect(page.getByRole("heading", { name: "My creatives", level: 1 })).toBeVisible();
    await shot(page, "flow-5-my-creatives");
    await page.getByRole("button", { name: "Open Launch test" }).click();
    await expect(headline(page)).toHaveValue("Hello world");
    // The unsaved edit was not silently discarded.
    await expect(page.getByText("Your previous draft was kept in My creatives.")).toBeVisible();

    // 6. Home now shows the real draft and recent creatives; continue editing.
    await nav(page, "Home");
    await expect(page.getByRole("heading", { name: "Your recent creatives" })).toBeVisible();
    await expect(page.locator(".continue-card")).toContainText("Launch test");
    await expect(page.locator(".home-recent")).toContainText("Launch test (draft)");
    await shot(page, "flow-6-home-returning");
    await page.getByRole("button", { name: /Continue editing/ }).click();
    await expect(headline(page)).toHaveValue("Hello world");

    // 7. Export at the placement's native size.
    const [png] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export PNG" }).click(),
    ]);
    expect(pngSize((await png.path())!)).toEqual({ width: 300, height: 250 });

    // Reloading keeps the recoverable draft.
    await expect(page.getByText("Draft saved on this device")).toBeVisible();
    await page.reload();
    await expect(page.locator(".continue-card")).toContainText("Launch test");
  });
});

test.describe("work protection", () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test("unfinished Create inputs survive navigation", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Create an ad" }).first().click();
    await page.locator(".goal-tile", { hasText: "Awareness" }).click();
    await page.getByLabel("Creative name").fill("Half done");
    await page.getByLabel("Headline").fill("Not finished yet");
    await nav(page, "Ad platforms");
    await nav(page, "Home");
    await page.getByRole("button", { name: "Create an ad" }).first().click();
    await expect(page.getByLabel("Creative name")).toHaveValue("Half done");
    await expect(page.getByLabel("Headline")).toHaveValue("Not finished yet");
    await expect(page.locator(".goal-tile.selected")).toHaveText(/Awareness/);
  });

  test("importing JSON in the Ad Designer keeps the unsaved draft first", async ({ page }) => {
    await page.goto("/?view=designer");
    await page.locator(".accordion", { hasText: "Project options" }).locator("summary").click();
    const [json] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export JSON" }).click(),
    ]);
    const project = JSON.parse(readFileSync((await json.path())!, "utf8"));
    project.creative.headline = "Imported headline.";
    await headline(page).fill("My unsaved edit");
    await page.locator('#panel-edit input[type="file"][accept*="json"]').setInputFiles({
      name: "project.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
    await expect(headline(page)).toHaveValue("Imported headline.");
    await expect(page.getByText(/previous draft was kept in My creatives/)).toBeVisible();
    await nav(page, "My creatives");
    await expect(page.getByRole("heading", { name: "VOXORA (draft)" })).toBeVisible();
  });
});

test.describe("examples", () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test("Home gallery: filter, navigate, use and edit an example; the library copy stays unchanged", async ({ page }) => {
    await page.goto("/");
    const gallery = page.locator(".example-gallery");
    const row = gallery.locator(".gallery-row");
    // First visit: examples straight away, no recent section, no modal needed.
    await expect(page.getByRole("heading", { name: "Your recent creatives" })).toHaveCount(0);
    await expect(row.locator(".example-card")).toHaveCount(8);
    await expect(row.locator(".example-card .preview-frame")).toHaveCount(8);
    // The hero demonstrates one creative on three real surfaces.
    await expect(page.locator(".hero-demo figcaption")).toHaveText(["320 × 480", "1080 × 1080", "1920 × 250"]);
    await shot(page, "home-gallery-first");

    // Next scrolls inside the row only; changing the filter returns to the start.
    await gallery.getByRole("button", { name: "Next examples" }).click();
    await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    expect(await noOverflow(page)).toBe(true);
    await gallery.getByRole("button", { name: "Traffic", exact: true }).click();
    await expect(row.locator(".example-card")).toHaveCount(2);
    await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBe(0);

    const useSmallSpace = () =>
      page
        .locator('.example-gallery [data-example-id="traffic-small-space-workspace"]')
        .getByRole("button", { name: /Use example/ })
        .click();
    await useSmallSpace();
    await expect(headline(page)).toHaveValue("Make room for better work.");
    await expect(page.locator("#panel-edit select").first()).toHaveValue("Consideration");
    await expect(page.locator(".stage-caption")).toContainText("1080 × 1080");
    await expect(page.locator(".designer .surface-card .preview-frame")).toHaveCount(4);

    await headline(page).fill("My own workspace headline");
    await nav(page, "Home");
    await expect(page.getByRole("heading", { name: "Your recent creatives" })).toBeVisible();
    await shot(page, "home-gallery-returning");
    await useSmallSpace();
    // The edited draft was kept, and the example opens as originally defined.
    await expect(headline(page)).toHaveValue("Make room for better work.");
    await nav(page, "My creatives");
    await expect(page.getByRole("heading", { name: "Workspace article (draft)" })).toBeVisible();
  });

  test("the Create page chooser reuses the examples and keeps unfinished inputs", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Create an ad" }).first().click();
    await page.getByLabel("Creative name").fill("Still typing");
    await page.getByRole("button", { name: "Try an example" }).click();
    const dialog = page.getByRole("dialog", { name: "Choose an example" });
    await expect(dialog.locator(".example-card")).toHaveCount(8);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByLabel("Creative name")).toHaveValue("Still typing");
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("main navigation works at a narrow width without horizontal scrolling", async ({ page }) => {
    await page.goto("/");
    const stops: [string, string][] = [
      ["Home", "One ad. Every screen."],
      ["Ad Designer", "Ad Designer"],
      ["Ad platforms", "Ad platforms"],
      ["My creatives", "My creatives"],
    ];
    for (const [link, heading] of stops) {
      await nav(page, link);
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
      expect(await noOverflow(page)).toBe(true);
      await shot(page, `phone-${link.toLowerCase().replace(/ /g, "-")}`);
    }
    await nav(page, "Home");
    await page.getByRole("button", { name: "Create an ad" }).first().click();
    await expect(page.getByRole("heading", { name: "Create your first ad" })).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
    await shot(page, "phone-create");
  });
});
