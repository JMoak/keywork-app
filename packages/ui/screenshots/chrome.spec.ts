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

test("the outfit seams stage: three houses, three pane weights", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 760 });
  await page.goto(`${chromeGalleryUrl}?scene=outfit-seams`);
  await settled(page, "keywork-night");
  await expect(page.locator(".kw-frame[data-attire]")).toHaveCount(9);
  await page.screenshot({
    path: `${stagesDirectory}/stage--outfit-seams.png`,
    animations: "disabled",
  });
});

test("the children stage: a delegated child in its parent's transcript and in the tree", async ({
  page,
}) => {
  await page.setViewportSize(widths.wide);
  await page.goto(`${chromeGalleryUrl}?scene=children`);
  await settled(page, "keywork-night");
  await expect(page.locator(".kw-tool[data-child]")).toHaveCount(1);
  await expect(page.locator(".kw-tree-session[data-child]")).toHaveCount(2);
  await page.screenshot({
    path: `${stagesDirectory}/stage--children.png`,
    animations: "disabled",
  });
});

test("the turn ledger stage: every turn closed by its ledger, the ribbon ending the title row", async ({
  page,
}) => {
  await page.setViewportSize(widths.wide);
  await page.goto(`${chromeGalleryUrl}?scene=turn-ledger&theme=keywork-night`);
  await settled(page, "keywork-night");
  await expect(page.locator(".kw-ledger")).toHaveCount(2);
  await expect(page.locator(".kw-frame-turn")).toHaveText("turn 2 · 2 files · $0.0381");
  await expect(page.locator("[data-mark='restore']")).toHaveCount(1);
  await page.locator(".kw-ledger").last().focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".kw-ledger-file")).toHaveCount(2);
  await page.screenshot({
    path: `${stagesDirectory}/stage--turn-ledger.png`,
    animations: "disabled",
  });
});

test("the needs-you stage: the strip above the status line naming the next item", async ({
  page,
}) => {
  await page.setViewportSize(widths.wide);
  await page.goto(`${chromeGalleryUrl}?scene=needs-you&theme=keywork-night`);
  await settled(page, "keywork-night");
  await expect(page.locator(".kw-needs-you[data-detail='next']")).toHaveCount(1);
  await page.screenshot({
    path: `${stagesDirectory}/stage--needs-you.png`,
    animations: "disabled",
  });
});

test("the context stage: a 200k map in the house, fences past the window, a 1M map", async ({
  page,
}) => {
  await page.setViewportSize(widths.wide);
  await page.goto(`${chromeGalleryUrl}?scene=context`);
  await settled(page, "keywork-night");
  await expect(page.locator(".kw-context-map-grid")).toHaveCount(3);
  await expect(page.locator(".kw-context-map-finding")).toHaveCount(1);
  await page.screenshot({ path: `${stagesDirectory}/stage--context.png`, animations: "disabled" });
});

test("the asks stage: an edit's diff, a typeset command, an mcp call's arguments", async ({
  page,
}) => {
  await page.setViewportSize(widths.wide);
  await page.goto(`${chromeGalleryUrl}?scene=asks`);
  await settled(page, "keywork-night");
  await expect(page.locator(".kw-ask-consequence[data-ready]")).toHaveCount(1);
  await expect(page.locator(".kw-ask-command")).toHaveCount(1);
  await expect(page.locator(".kw-ask-call-args")).toHaveCount(1);
  await page.screenshot({ path: `${stagesDirectory}/stage--asks.png`, animations: "disabled" });
});

test("the desk stage: every session by what it wants, the strip down to its count", async ({
  page,
}) => {
  await page.setViewportSize(widths.wide);
  await page.goto(`${chromeGalleryUrl}?scene=desk&theme=keywork-night`);
  await settled(page, "keywork-night");
  await expect(page.locator(".kw-needs-you[data-detail='count']")).toHaveCount(1);
  await expect(page.locator(".kw-desk-group-name")).toHaveText([
    "needs you",
    "working",
    "back",
    "quiet",
  ]);
  await expect(page.locator(".kw-desk-row[data-cursor] .kw-desk-answer")).toHaveCount(2);
  await page.screenshot({ path: `${stagesDirectory}/stage--desk.png`, animations: "disabled" });
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
