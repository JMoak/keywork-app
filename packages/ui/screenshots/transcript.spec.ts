import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { devPageUrl } from "../playwright.config.ts";

const platformNames: Record<string, string> = { win32: "windows", darwin: "macos", linux: "linux" };
const platform = platformNames[process.platform] ?? process.platform;
const shotsDirectory = resolve(import.meta.dirname, "../../../artifacts/shots", platform);
const tiers = ["broadsheet", "column", "clipping", "masthead"];

for (const tier of tiers) {
  test(`transcript scenarios per flavor at the ${tier} tier`, async ({ page }) => {
    await page.goto(devPageUrl);
    await page.evaluate(() => {
      document.body.insertAdjacentHTML(
        "beforeend",
        "<style>*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }</style>",
      );
    });
    await choose(page, "width", tier);
    for (const flavor of await choicesOf(page, "flavor", (name) => name !== "system")) {
      await choose(page, "flavor", flavor);
      for (const scenario of await choicesOf(page, "scenario")) {
        await choose(page, "scenario", scenario);
        await settled(page);
        await page.locator(".kw-dev-frame").screenshot({
          path: `${shotsDirectory}/${scenario}--${flavor}--${tier}.png`,
          animations: "disabled",
        });
      }
    }
  });
}

function field(page: Page, label: string) {
  return page.locator(".kw-dev-field", { hasText: label }).locator("select");
}

async function choicesOf(
  page: Page,
  label: string,
  keep: (value: string) => boolean = () => true,
): Promise<string[]> {
  const values = await field(page, label)
    .locator("option")
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  return values.filter(keep);
}

async function choose(page: Page, label: string, value: string): Promise<void> {
  await field(page, label).selectOption(value);
}

async function settled(page: Page): Promise<void> {
  await expect(page.locator(".kw-dev-stamp[data-live]")).toHaveCount(0, { timeout: 30_000 });
  await page.waitForTimeout(250);
}
