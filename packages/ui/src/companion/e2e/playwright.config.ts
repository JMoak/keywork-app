import { defineConfig } from "@playwright/test";
import { companionPlatforms } from "./platforms.ts";

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.electron\.ts$/,
  outputDir: "../../../../../artifacts/playwright-companion",
  reporter: "list",
  timeout: 240_000,
  workers: 1,
  fullyParallel: false,
  projects: [
    ...companionPlatforms.map((target) => ({
      name: target.project,
      grepInvert: /@perf/,
      metadata: { platform: target.platform, session: target.session },
    })),
    { name: "perf", grep: /@perf/ },
  ],
});
