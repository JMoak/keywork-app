import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export const devProxyPath = "/kw";

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      [devProxyPath]: {
        target: process.env.KEYWORK_SERVER ?? "http://127.0.0.1:4770",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/kw/, ""),
      },
    },
  },
});
