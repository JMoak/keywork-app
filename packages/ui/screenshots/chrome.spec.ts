import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { chromeGalleryUrl } from "../playwright.config.ts";

const platformNames: Record<string, string> = { win32: "windows", darwin: "macos", linux: "linux" };
const platform = platformNames[process.platform] ?? process.platform;
const platformShots = resolve(import.meta.dirname, "../../../artifacts/shots", platform);
const shotsDirectory = resolve(platformShots, "chrome");
const stagesDirectory = resolve(platformShots, "themes");
const scenes = ["workspace", "transcript", "open"] as const;
const themes = ["keywork-night", "keywork-day", "gruvbox-light", "matte-black", "catppuccin-mocha"];
const widths = { wide: { width: 1440, height: 900 }, narrow: { width: 900, height: 720 } };

for (const [widthName, viewport] of Object.entries(widths)) {
  test(`chrome scenes per theme at the ${widthName} window`, async ({ page }) => {
    await page.setViewportSize(viewport);
    expect(await themesOf(page)).toEqual(expect.arrayContaining(themes));
    for (const theme of themes) {
      for (const scene of scenes) {
        await page.goto(`${chromeGalleryUrl}?scene=${scene}&theme=${theme}`);
        await settled(page, theme);
        await page.screenshot({
          path: `${shotsDirectory}/${scene}--theme-${theme}--${widthName}.png`,
          animations: "disabled",
        });
      }
    }
  });
}

test("the outfits stage: three panes, three themes, one house", async ({ page }) => {
  await page.setViewportSize(widths.wide);
  await page.goto(`${chromeGalleryUrl}?scene=outfits`);
  await settled(page, "keywork-night");
  await expect(page.locator(".kw-frame[data-attire]")).toHaveCount(2);
  await page.screenshot({ path: `${stagesDirectory}/stage--outfits.png`, animations: "disabled" });
});

async function themesOf(page: Page): Promise<string[]> {
  await page.goto(chromeGalleryUrl);
  await expect(page.locator("body[data-themes]")).toHaveCount(1);
  return ((await page.locator("body").getAttribute("data-themes")) ?? "").split(" ");
}

async function settled(page: Page, theme: string): Promise<void> {
  await expect(page.locator(`html[data-theme="${theme}"]`)).toHaveCount(1);
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content:
      "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }",
  });
  await page.waitForTimeout(200);
}
