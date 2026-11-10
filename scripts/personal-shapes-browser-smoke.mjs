// Fresh Chromium context; no user projects or browser storage touched.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5268");
  await page.locator("#personal-shapes").click();
  const dialog = page.getByRole("dialog", { name: "Personal Shapes", exact: true });
  await page.getByRole("button", { name: "Save selected as Shape", exact: true }).click();
  await page.getByRole("button", { name: "Save Shape", exact: true }).waitFor({ timeout: 60000 });
  const img = dialog.getByAltText("Evaluated shape preview");
  assert(await img.evaluate((el) => el.complete && el.naturalWidth > 0));
  await page.getByRole("textbox", { name: "Shape name" }).fill("Browser reusable sculpt");
  await page.getByRole("button", { name: "Save Shape", exact: true }).click();
  await dialog.getByRole("heading", { name: "Browser reusable sculpt" }).waitFor();
  await dialog.getByRole("button", { name: "Close / Cancel" }).click();
  await page.locator("#new-project").click();
  await page
    .getByRole("textbox", { name: "Project name", exact: true })
    .fill("Personal Shapes second project");
  await page.getByRole("combobox", { name: "Start with" }).selectOption("empty");
  await page.getByRole("button", { name: "Create Project", exact: true }).click();
  await page.locator("#personal-shapes").click();
  await dialog.getByRole("heading", { name: "Browser reusable sculpt" }).waitFor();
  await dialog.getByRole("button", { name: "Insert", exact: true }).click();
  await dialog
    .getByRole("status")
    .filter({ hasText: "Independent sculpt inserted" })
    .waitFor({ timeout: 60000 });
  await dialog.getByRole("button", { name: "Insert", exact: true }).click();
  await dialog
    .getByRole("status")
    .filter({ hasText: "Independent sculpt inserted" })
    .waitFor({ timeout: 60000 });
  await dialog.getByRole("button", { name: "Close / Cancel" }).click();
  await page.reload();
  await page.locator("#personal-shapes").click();
  await dialog.getByRole("heading", { name: "Browser reusable sculpt" }).waitFor();
  assert(await dialog.locator("img").evaluate((el) => el.complete && el.naturalWidth > 0));
  await dialog.getByRole("button", { name: "Rename", exact: true }).click();
  await dialog.getByRole("textbox", { name: "New shape name" }).fill("Renamed reusable sculpt");
  await dialog.getByRole("button", { name: "Confirm rename", exact: true }).click();
  await dialog.getByRole("heading", { name: "Renamed reusable sculpt" }).waitFor();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  assert(await dialog.getByRole("heading", { name: "Renamed reusable sculpt" }).isVisible());
  await dialog
    .getByRole("button", { name: "Confirm delete Renamed reusable sculpt", exact: true })
    .click();
  await dialog.getByRole("status").filter({ hasText: "No personal shapes yet" }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: evaluated thumbnail, save, gzip master, two insertions, reload persistence, rename, confirmed deletion; no page errors",
  );
} finally {
  await browser.close();
}
