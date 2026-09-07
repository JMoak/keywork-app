import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          include: [
            "packages/protocol/src/**/*.test.ts",
            "packages/client/src/**/*.test.ts",
            "packages/desktop/src/**/*.test.ts",
            "scripts/**/*.test.ts",
          ],
          environment: "node",
        },
      },
      {
        plugins: [solid({ hot: false })],
        resolve: { conditions: ["development", "browser"] },
        test: {
          name: "ui",
          include: ["packages/ui/src/**/*.test.{ts,tsx}"],
          environment: "happy-dom",
        },
      },
    ],
  },
});
