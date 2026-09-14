// Ad Designer acceptance checks at desktop, tablet and phone widths.
// Everything asserted comes from the real resolver output and both renderers.
// Set DESIGNER_SHOTS=<folder> to also save review screenshots.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const shots = process.env.DESIGNER_SHOTS;

async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Ad Designer", level: 1 })).toBeVisible();
}
const noHorizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const accordion = (page: Page, name: string) =>
  page
    .locator("details.accordion")
    .filter({ has: page.locator("summary", { hasText: name }) });
// The hidden planner stays mounted, so scope field lookups to the designer's Edit panel.
// Goal is the Edit panel's first menu (a wrapped select's name also includes its chosen option).
const goalSelect = (page: Page) => page.locator("#panel-edit select").first();
const headline = (page: Page) => page.locator("#panel-edit textarea").first();
const pngSize = (file: string) => {
  const buf = readFileSync(file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
};

test.describe("desktop", () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test("three columns, four resolved surface previews, Sales first, settings collapsed", async ({ page }) => {
    await open(page);
    for (const id of ["#panel-edit", "#panel-preview", "#panel-inspect"])
      await expect(page.locator(id)).toBeVisible();
    // Columns: creative left, preview centre (widest), settings right, sharing one row.
    const [edit, preview, settings] = await Promise.all(
      ["#panel-edit", "#panel-preview", "#panel-inspect"].map(async (id) => (await page.locator(id).boundingBox())!),
    );
    expect(edit.x + edit.width).toBeLessThanOrEqual(preview.x + 1);
    expect(preview.x + preview.width).toBeLessThanOrEqual(settings.x + 1);
    expect(Math.abs(edit.y - preview.y)).toBeLessThan(2);
    expect(Math.abs(settings.y - preview.y)).toBeLessThan(2);
    expect(preview.width).toBeGreaterThan(edit.width);
    expect(preview.width).toBeGreaterThan(settings.width);
    const cards = page.locator(".surface-card");
    await expect(cards).toHaveCount(4);
    for (let i = 0; i < 4; i++) await expect(cards.nth(i).locator(".preview-frame")).toBeVisible();
    await expect(goalSelect(page).locator("option").first()).toHaveText("Sales");
    for (const name of ["Accessibility", "Element priorities", "Layout details", "Test smaller sizes"])
      await expect(accordion(page, name)).not.toHaveAttribute("open");
    await expect(page.locator(".check-card.passed")).toContainText("checks passed");
    expect(await noHorizontalOverflow(page)).toBe(true);
    if (shots) await page.screenshot({ path: `${shots}/designer-desktop.png`, fullPage: true });
  });

  test("copy edits reach both renderers; surfaces, dimensions, guides and details work", async ({ page }) => {
    await open(page);
    const stage = page.locator(".canvas-stage");
    await headline(page).fill("Hear every detail.");
    await expect(stage.locator(".ad-scale")).toHaveAttribute("aria-label", /Hear every detail\./);
    await expect(stage.locator(".ad-headline")).toContainText("Hear");

    await page.getByRole("button", { name: "Canvas", exact: true }).click();
    const canvas = stage.locator("canvas");
    await expect(canvas).toBeVisible();
    await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.width)).toBe(1080);
    await expect(stage.locator(".ad-scale")).toHaveAttribute("aria-label", /Hear every detail\./);
    // Canvas pixels: not blank, and a copy edit made in Canvas mode repaints them.
    const pixels = () => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
    const blank = await canvas.evaluate((c: HTMLCanvasElement) => {
      const b = document.createElement("canvas");
      b.width = c.width;
      b.height = c.height;
      return b.toDataURL();
    });
    await expect.poll(pixels).not.toBe(blank);
    const before = await pixels();
    await headline(page).fill("A different headline.");
    await expect.poll(pixels).not.toBe(before);
    await expect(stage.locator(".ad-scale")).toHaveAttribute("aria-label", /A different headline\./);
    await page.getByRole("button", { name: "DOM", exact: true }).click();

    await page.locator(".surface-card", { hasText: "Broadcast" }).click();
    await expect(page.locator(".stage-caption")).toContainText("1920 × 250");
    await page.getByRole("spinbutton", { name: /width/i }).fill("1600");
    await expect(page.locator(".stage-caption")).toContainText("1600 × 250");

    const guides = page.getByRole("switch", { name: "Safe-area guides" });
    await guides.click();
    await expect(guides).toHaveAttribute("aria-checked", "true");
    await expect(stage.locator(".safe-guide")).toBeVisible();

    const details = accordion(page, "Layout details");
    await details.locator("summary").click();
    await expect(details).toHaveAttribute("open", "");
    await expect(details.locator(".decisions li").first()).toBeVisible();
    await expect(details.locator(".explain-item").first()).toBeVisible();
  });

  test("PNG export is native size; Save version, JSON export and import work", async ({ page }) => {
    await open(page);
    const [png] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export PNG" }).click(),
    ]);
    expect(pngSize((await png.path())!)).toEqual({ width: 1080, height: 1080 });

    // Save through the real buttons: toolbar opens the dialog, the dialog's button saves.
    await page.locator(".designer-toolbar").getByRole("button", { name: "Save version" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Creative name").fill("Designer e2e save");
    await dialog.getByRole("button", { name: "Save version" }).click();
    await expect(page.getByText("Version saved in this browser", { exact: false })).toBeVisible();
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: /My creatives/ }).click();
    await expect(page.getByRole("heading", { name: "Designer e2e save" })).toBeVisible();
    await page.getByRole("button", { name: "Ad Designer", exact: true }).click();

    await accordion(page, "Project options").locator("summary").click();
    const [json] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export JSON" }).click(),
    ]);
    const project = JSON.parse(readFileSync((await json.path())!, "utf8"));
    expect(project.creative.headline).toBe("Sound without limits.");

    project.creative.headline = "Imported headline.";
    await page.locator('input[type="file"][accept*="json"]').setInputFiles({
      name: "project.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
    await expect(headline(page)).toHaveValue("Imported headline.");
  });

  test("an impossible layout stays visible and disables export", async ({ page }) => {
    await open(page);
    await page.getByRole("spinbutton", { name: /height/i }).fill("40");
    await expect(page.locator(".check-card.failed")).toBeVisible();
    await expect(page.locator(".check-card.failed li").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Export PNG" })).toBeDisabled();
    if (shots) await page.screenshot({ path: `${shots}/designer-impossible.png` });
  });
});

test.describe("tablet", () => {
  test.use({ viewport: { width: 1024, height: 900 } });

  test("settings move under the preview without horizontal overflow", async ({ page }) => {
    await open(page);
    await expect(page.locator("#panel-inspect")).toBeVisible();
    await expect(page.locator(".surface-card .preview-frame")).toHaveCount(4);
    // Editor and preview share the first row; settings sit fully below them, full width.
    const [edit, preview, settings, workspace] = await Promise.all(
      ["#panel-edit", "#panel-preview", "#panel-inspect", ".designer .workspace"].map(
        async (sel) => (await page.locator(sel).boundingBox())!,
      ),
    );
    expect(edit.x + edit.width).toBeLessThanOrEqual(preview.x + 1);
    expect(Math.abs(edit.y - preview.y)).toBeLessThan(2);
    expect(settings.y).toBeGreaterThanOrEqual(Math.max(edit.y + edit.height, preview.y + preview.height) - 1);
    expect(Math.abs(settings.x - workspace.x)).toBeLessThan(2);
    expect(settings.width).toBeGreaterThan(workspace.width - 4);
    expect(await noHorizontalOverflow(page)).toBe(true);
    if (shots) await page.screenshot({ path: `${shots}/designer-tablet.png`, fullPage: true });
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("preview first, labelled Edit and Settings tabs, all four surfaces, no overflow", async ({ page }) => {
    await open(page);
    const tabs = page.getByRole("tablist", { name: "Designer panels" });
    await expect(tabs.getByRole("tab", { name: "Preview" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#panel-preview")).toBeVisible();
    await expect(page.locator("#panel-edit")).toBeHidden();
    await expect(page.locator(".surface-card .preview-frame")).toHaveCount(4);
    expect(await noHorizontalOverflow(page)).toBe(true);
    if (shots) await page.screenshot({ path: `${shots}/designer-phone-preview.png`, fullPage: true });

    await tabs.getByRole("tab", { name: "Edit" }).click();
    await expect(page.locator("#panel-edit")).toBeVisible();
    await expect(page.locator("#panel-preview")).toBeHidden();
    expect(await noHorizontalOverflow(page)).toBe(true);
    if (shots) await page.screenshot({ path: `${shots}/designer-phone-edit.png`, fullPage: true });

    await tabs.getByRole("tab", { name: "Settings" }).click();
    await expect(page.locator("#panel-inspect")).toBeVisible();
    expect(await noHorizontalOverflow(page)).toBe(true);
    if (shots) await page.screenshot({ path: `${shots}/designer-phone-settings.png`, fullPage: true });
  });
});
