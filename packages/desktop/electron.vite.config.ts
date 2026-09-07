import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import solid from "vite-plugin-solid";

const ui = resolve(import.meta.dirname, "../ui");

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    root: ui,
    plugins: [solid(), tailwindcss()],
    build: { rollupOptions: { input: resolve(ui, "index.html") } },
  },
});
