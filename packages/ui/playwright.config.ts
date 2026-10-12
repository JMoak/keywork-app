import { defineConfig } from "@playwright/test";

export const devPageUrl = "http://127.0.0.1:5173/?dev";
export const chromeGalleryUrl = "http://127.0.0.1:5173/screenshots/chrome.html";

export default defineConfig({
  testDir: "screenshots",
  outputDir: "../../artifacts/playwright",
  reporter: "list",
  timeout: 300_000,
  projects: [
    {
      name: "screenshots",
      use: {
        browserName: "chromium",
        viewport: { width: 1200, height: 900 },
        deviceScaleFactor: 1,
        colorScheme: "dark",
      },
    },
  ],
  webServer: {
    command: "bun run dev --host 127.0.0.1",
    url: devPageUrl,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
