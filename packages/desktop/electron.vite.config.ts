import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import solid from "vite-plugin-solid";

const ui = resolve(import.meta.dirname, "../ui");

const workspacePackages = ["@keywork-app/client", "@keywork-app/protocol"];

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin({ exclude: workspacePackages })] },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    build: { rollupOptions: { output: { format: "cjs", entryFileNames: "[name].js" } } },
  },
  renderer: {
    root: ui,
    plugins: [solid(), tailwindcss()],
    build: { rollupOptions: { input: resolve(ui, "index.html") } },
  },
});
