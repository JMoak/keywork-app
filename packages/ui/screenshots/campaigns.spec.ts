import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const output =
  process.env.CAMPAIGN_SHOTS ?? resolve(import.meta.dirname, "../../../artifacts/shots/campaigns");

test("campaign monitoring remains readable at desktop and narrow widths", async ({ page }) => {
  test.setTimeout(30_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "warning" && message.text().includes("computations"))
      errors.push(message.text());
  });
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("http://127.0.0.1:5173/screenshots/campaigns.html");
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();
  await expect(page.getByRole("heading", { name: "A calmer first five minutes" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Cumulative reported costs/ })).toBeVisible();
  await page.screenshot({
    path: resolve(output, "campaign-overview-wide.png"),
    animations: "disabled",
  });
  await page.getByLabel("Compare with baseline").check();
  await expect(page.locator(".kw-campaign-artifact pre")).toHaveCount(2);
  await page.getByRole("region", { name: "Artifacts", exact: true }).screenshot({
    path: resolve(output, "campaign-artifacts-wide.png"),
    animations: "disabled",
  });
  const artifactPicker = page.getByRole("combobox", { name: "Inspect artifact", exact: true });
  await artifactPicker.selectOption("baseline");
  await expect(page.locator(".kw-campaign-artifact pre")).toHaveCount(1);
  await page
    .getByRole("region", { name: "Achievements", exact: true })
    .getByRole("button", { name: "Inspect artifact", exact: true })
    .click();
  await expect(artifactPicker).toBeFocused();
  await expect(artifactPicker).toHaveValue("improved");
  await expect(artifactPicker).toBeInViewport();
  await page.goto("http://127.0.0.1:5173/screenshots/campaigns.html?paused=1");
  await page.getByText("Review artifact", { exact: true }).click();
  await page
    .getByLabel("Your observation for A visitor can finish setup")
    .fill("This note applies only to the improved artifact.");
  await page.getByLabel("I inspected this artifact", { exact: true }).check();
  await page
    .getByRole("combobox", { name: "Inspect artifact", exact: true })
    .selectOption("baseline");
  await expect(page.getByLabel("Your observation for A visitor can finish setup")).toHaveValue("");
  await expect(page.getByLabel("I inspected this artifact", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("Verdict for A visitor can finish setup")).toHaveValue("uncertain");
  await page.locator("[data-review]").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: resolve(output, "campaign-human-review.png"),
    animations: "disabled",
  });
  await page
    .getByLabel("Your observation for A visitor can finish setup")
    .fill("Setup still asks for account details before showing the workspace.");
  await page.getByLabel("Verdict for A visitor can finish setup").selectOption("fail");
  await page.getByLabel("Reason for this review").fill("Reviewed the starting brief.");
  await page.getByLabel("I inspected this artifact", { exact: true }).check();
  await page.getByRole("button", { name: "Record review", exact: true }).click();
  await expect(page.getByText("Review recorded", { exact: true })).toBeVisible();
  await expect(page.getByLabel("I inspected this artifact", { exact: true })).not.toBeChecked();
  await page.locator("[data-review]").screenshot({
    path: resolve(output, "campaign-review-recorded.png"),
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:5173/screenshots/campaigns.html?theme=keywork-day");
  await expect(page.getByRole("heading", { name: "A calmer first five minutes" })).toBeVisible();
  await page.screenshot({
    path: resolve(output, "campaign-overview-narrow.png"),
    animations: "disabled",
  });
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll("main *")]
      .filter((element) => element.getBoundingClientRect().right > window.innerWidth)
      .map((element) => `${element.tagName}.${element.className}`)
      .slice(0, 10),
  );
  expect(overflow).toEqual([]);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("http://127.0.0.1:5173/screenshots/campaigns.html?create=1");
  const model = page.getByRole("combobox", { name: "Model", exact: true });
  await expect(model).toHaveValue("fixture-model");
  await expect(page.getByLabel("Provider", { exact: true })).toHaveCount(0);
  await model.selectOption("custom");
  await page.getByLabel("Provider", { exact: true }).fill("openrouter");
  await page.getByLabel("Model identifier", { exact: true }).fill("model-b");
  await model.selectOption("fixture-model");
  await expect(page.getByLabel("Provider", { exact: true })).toHaveCount(0);
  await model.selectOption("custom");
  await expect(page.getByLabel("Model identifier", { exact: true })).toHaveValue("model-b");
  await page.locator("form").screenshot({
    path: resolve(output, "campaign-create-custom-model.png"),
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
