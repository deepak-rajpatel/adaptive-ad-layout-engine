// Composition completeness in the real app: a preferred composition must never drop an element
// silently. Each case imports a project through the UI and checks DOM, Canvas and the reported
// decisions for the same resolved layout.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

type Creative = Record<string, unknown> & { required: Record<string, boolean> };
const book = "/examples/open-shelf-book.svg";
const stage = (page: Page) => page.locator(".canvas-stage");

async function importProject(page: Page, change: (c: Creative) => void) {
  await page.goto("/?view=designer");
  await page.locator(".accordion", { hasText: "Project options" }).locator("summary").click();
  const [json] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export JSON" }).click(),
  ]);
  const project = JSON.parse(readFileSync((await json.path())!, "utf8"));
  change(project.creative);
  await page.locator('#panel-edit input[type="file"][accept*="json"]').setInputFiles({
    name: "project.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.getByText(/Project imported|previous draft was kept/)).toBeVisible();
}
async function decisions(page: Page) {
  await page.locator(".accordion", { hasText: "Layout details" }).locator("summary").click();
  return page.locator("ol.decisions");
}
/** Canvas pixels at native coordinates. */
const pixels = (page: Page, points: [number, number][]) =>
  stage(page)
    .locator("canvas")
    .evaluate(
      (c: HTMLCanvasElement, pts) =>
        pts.map(([x, y]) => Array.from(c.getContext("2d")!.getImageData(x, y, 1, 1).data.slice(0, 3))),
      points,
    );
const box = (page: Page, selector: string) =>
  stage(page)
    .locator(selector)
    .evaluate((el: HTMLElement) => ({
      x: parseFloat(el.style.left),
      y: parseFloat(el.style.top),
      w: parseFloat(el.style.width),
      h: parseFloat(el.style.height),
    }));

test.use({ viewport: { width: 1440, height: 1000 } });

test("typographic composition with a required image keeps the image in DOM and Canvas", async ({ page }) => {
  await importProject(page, (c) => {
    c.composition = "type";
    c.required = { ...c.required, image: true };
  });
  for (const id of ["image", "headline", "cta"]) await expect(stage(page).locator(`.ad-${id}`)).toBeVisible();
  await expect(await decisions(page)).toContainText("typographic composition cannot place image (hero)");
  const b = await box(page, ".ad-image");
  await page.getByRole("button", { name: "Canvas", exact: true }).click();
  await expect.poll(() => stage(page).locator("canvas").evaluate((c: HTMLCanvasElement) => c.width)).toBe(1080);
  // The image region in Canvas is drawn, not left as the background colour (#f5f0e7).
  const grid: [number, number][] = [];
  for (let i = 1; i <= 5; i++) for (let j = 1; j <= 5; j++) grid.push([Math.round(b.x + (b.w * i) / 6), Math.round(b.y + (b.h * j) / 6)]);
  await expect
    .poll(async () =>
      (await pixels(page, grid)).filter(([r, g, bl]) => Math.max(Math.abs(r - 245), Math.abs(g - 240), Math.abs(bl - 231)) > 40).length,
    )
    .toBeGreaterThanOrEqual(3);
});

test("product composition with a required decoration is reported impossible, never shown without it", async ({ page }) => {
  await importProject(page, (c) => {
    c.composition = "product";
    c.decoration = book;
    c.required = { ...c.required, decoration: true };
  });
  const impossible = stage(page).locator(".impossible");
  await expect(impossible).toContainText("Required decoration cannot be placed");
  await expect(impossible).toContainText("typographic composition");
  await expect(page.getByRole("button", { name: "Export PNG" })).toBeDisabled();
  await page.getByRole("button", { name: "Canvas", exact: true }).click();
  await expect(stage(page).locator(".impossible")).toContainText("Required decoration cannot be placed");
  await expect(stage(page).locator("canvas")).toHaveCount(0);
});

test("panel composition with an optional decoration omits it explicitly and renders the rest", async ({ page }) => {
  await importProject(page, (c) => {
    c.composition = "panel";
    c.decoration = book;
  });
  await expect(stage(page).locator(".ad-panel")).toBeVisible();
  await expect(stage(page).locator(".ad-decoration")).toHaveCount(0);
  for (const id of ["image", "headline", "cta"]) await expect(stage(page).locator(`.ad-${id}`)).toBeVisible();
  await expect(await decisions(page)).toContainText("decoration (decoration, priority 5) omitted: no arrangement available here can place it");
  const panel = await box(page, ".ad-panel");
  const fill = await stage(page)
    .locator(".ad-panel")
    .evaluate((el: HTMLElement) => getComputedStyle(el).backgroundColor.match(/\d+/g)!.slice(0, 3).map(Number));
  await page.getByRole("button", { name: "Canvas", exact: true }).click();
  await expect.poll(() => stage(page).locator("canvas").evaluate((c: HTMLCanvasElement) => c.width)).toBe(1080);
  // A point on the panel outside the safe area (so no text): Canvas paints the same panel fill.
  const corner: [number, number] = [Math.round(panel.x + 6), Math.round(panel.y + panel.h - 6)];
  await expect.poll(async () => (await pixels(page, [corner]))[0]).toEqual(fill);
});
