// Ad platforms acceptance checks (C3, D2): counts are exact only in the unfiltered Network view.
import { expect, test, type Page } from "@playwright/test";
import { placements } from "../../src/engine/catalog/data";

const catalogIds = placements.map((p) => p.id).sort();
const assignmentIds = placements.filter((p) => p.network === "assignment").map((p) => p.id).sort();
const metaIds = placements.filter((p) => p.network === "meta").map((p) => p.id).sort();

async function cardIds(page: Page, scope = page.locator(".planner-matrix")) {
  return scope.locator("[data-placement-id]").evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-placement-id")!),
  );
}
async function openPlanner(page: Page) {
  await page.goto("/?view=platforms");
  await expect(page.locator(".plan-summary")).toContainText(`${placements.length} of ${placements.length} placements`);
}
async function groupBy(page: Page, name: string) {
  await page.locator(".platforms .plan-more > summary").click();
  await page.getByRole("group", { name: "Group by" }).getByRole("button", { name, exact: true }).click();
}

test("renders one card per catalog placement in the unfiltered Network view", async ({ page }) => {
  await openPlanner(page);
  const ids = await cardIds(page);
  expect(ids).toHaveLength(placements.length);
  expect(new Set(ids).size).toBe(ids.length);
  expect([...ids].sort()).toEqual(catalogIds);
});

test("Goal grouping covers every placement and keeps assignment surfaces in their own section", async ({ page }) => {
  await openPlanner(page);
  await groupBy(page, "Goal");
  const ids = await cardIds(page);
  expect([...new Set(ids)].sort()).toEqual(catalogIds);
  const assignment = page.locator(".plan-group").filter({ has: page.locator("h2", { hasText: "Assignment surfaces" }) });
  expect((await cardIds(page, assignment)).sort()).toEqual(assignmentIds);
  const others = page.locator(".plan-group").filter({ hasNot: page.locator("h2", { hasText: "Assignment surfaces" }) });
  const elsewhere = await cardIds(page, others);
  expect(elsewhere.filter((id) => assignmentIds.includes(id))).toEqual([]);
});

test("the network filter shows exactly that network's placements", async ({ page }) => {
  await openPlanner(page);
  await page.getByLabel("Network", { exact: true }).selectOption("meta");
  expect((await cardIds(page)).sort()).toEqual(metaIds);
});

test("changing the goal re-ranks without adding or removing placements", async ({ page }) => {
  await openPlanner(page);
  const before = (await cardIds(page)).sort();
  await page.locator(".platforms-context select").selectOption("Leads");
  await expect(page.locator(".platforms-context select")).toHaveValue("Leads");
  const after = await cardIds(page);
  expect(after).toHaveLength(before.length);
  expect([...after].sort()).toEqual(before);
});

test("downloads a composed PNG and an image asset", async ({ page }) => {
  await openPlanner(page);
  const card = (id: string) => page.locator(`[data-placement-id="${id}"]`);
  const [png] = await Promise.all([
    page.waitForEvent("download"),
    card("google-300x250").getByRole("button", { name: "PNG" }).click(),
  ]);
  expect(png.suggestedFilename()).toBe("google-300x250-300x250.png");
  const [asset] = await Promise.all([
    page.waitForEvent("download"),
    card("meta-feed").getByRole("button", { name: "Image asset" }).click(),
  ]);
  expect(asset.suggestedFilename()).toMatch(/^meta-feed-\d+x\d+-image-asset\.png$/);
  await expect(page.locator(".planner-note[role=status]")).toContainText("Exported 1 PNG");
});
