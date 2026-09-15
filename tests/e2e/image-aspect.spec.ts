// Image proportions are measured for Create-page and direct uploads and survive saving,
// reopening and reloading (they let a badge hug a whole-image product cut-out).
import { expect, test, type Page } from "@playwright/test";

const draftAspect = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("omniframe:draft:v1") ?? "{}").creative?.imageAspect);
/** A solid PNG of the given size, drawn in the page. */
const png = async (page: Page, width: number, height: number) => {
  const url = await page.evaluate(
    ([w, h]) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#e8591a";
      ctx.fillRect(0, 0, w, h);
      return c.toDataURL("image/png");
    },
    [width, height],
  );
  return { name: `${width}x${height}.png`, mimeType: "image/png", buffer: Buffer.from(url.split(",")[1], "base64") };
};

test.use({ viewport: { width: 1440, height: 1000 } });

test("image proportions are measured on upload and survive save, reopen and reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create an ad" }).first().click();
  await page.getByLabel("Creative name").fill("Aspect test");
  await page.getByLabel("Headline").fill("Aspect check");
  await page.getByLabel("Upload an image").setInputFiles(await png(page, 300, 150));
  await page.getByRole("button", { name: /Open Ad Designer/ }).click();
  await expect(page.getByRole("heading", { name: "Ad Designer", level: 1 })).toBeVisible();
  await expect.poll(() => draftAspect(page)).toBe(2);

  // A direct upload in the Ad Designer replaces the proportions.
  await page.locator('#panel-edit input[type="file"][accept="image/png,image/jpeg,image/webp"]:not([aria-label])').setInputFiles(await png(page, 100, 200));
  await expect.poll(() => draftAspect(page)).toBe(0.5);

  // Save a version, change the image, then reopen the saved version.
  await page.locator(".designer-toolbar").getByRole("button", { name: "Save version" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Save version" }).click();
  await expect(dialog).toBeHidden();
  await page.locator('#panel-edit input[type="file"][accept="image/png,image/jpeg,image/webp"]:not([aria-label])').setInputFiles(await png(page, 400, 100));
  await expect.poll(() => draftAspect(page)).toBe(4);
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "My creatives", exact: true }).click();
  await page.getByRole("button", { name: "Open Aspect test", exact: true }).click();
  await expect.poll(() => draftAspect(page)).toBe(0.5);

  await page.reload();
  await expect.poll(() => draftAspect(page)).toBe(0.5);
});
