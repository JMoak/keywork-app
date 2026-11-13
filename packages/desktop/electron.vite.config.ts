import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { build, type Plugin, type ResolvedConfig, type Rollup } from "vite";
import solid from "vite-plugin-solid";
import { contentPolicyPlugin } from "./src/shared/content-policy.ts";

const ui = resolve(import.meta.dirname, "../ui");

const workspacePackages = [
  "@keywork-app/client",
  "@keywork-app/protocol",
  "@keywork-app/screen",
  "@keywork-app/habitat",
  "@keywork-app/ui",
  "@keywork-app/product",
];

export const nativeModules = ["node-pty"];

const preloadEntries = {
  index: resolve(import.meta.dirname, "src/preload/index.ts"),
  companion: resolve(import.meta.dirname, "src/preload/companion.ts"),
};

const sandboxedPreloadOutput: Rollup.OutputOptions = {
  format: "cjs",
  entryFileNames: "[name].js",
  inlineDynamicImports: true,
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    build: {
      rollupOptions: {
        preserveEntrySignatures: "strict",
        output: { chunkFileNames: "[name]-[hash].js" },
        input: {
          index: resolve(import.meta.dirname, "src/main/index.ts"),
          runtime: resolve(import.meta.dirname, "src/main/runtime.ts"),
        },
        external: nativeModules,
      },
    },
  },
  preload: {
    plugins: [standalonePreloads({ companion: preloadEntries.companion })],
    build: {
      externalizeDeps: false,
      rollupOptions: {
        input: { index: preloadEntries.index },
        output: sandboxedPreloadOutput,
      },
    },
  },
  renderer: {
    root: ui,
    plugins: [solid(), tailwindcss(), contentPolicyPlugin()],
    build: { rollupOptions: { input: resolve(ui, "index.html") } },
  },
});

function standalonePreloads(entries: Record<string, string>): Plugin {
  let preload: ResolvedConfig;
  return {
    name: "keywork:standalone-preloads",
    apply: "build",
    configResolved(resolved) {
      preload = resolved;
    },
    async buildStart() {
      for (const [name, entry] of Object.entries(entries)) {
        const bundle = await bundleAlone(preload, name, entry);
        for (const id of bundle.moduleIds.filter(isSourceFile)) this.addWatchFile(id);
        this.emitFile({ type: "asset", fileName: bundle.fileName, source: bundle.code });
      }
    },
  };
}

async function bundleAlone(
  preload: ResolvedConfig,
  name: string,
  entry: string,
): Promise<Rollup.OutputChunk> {
  const built = await build({
    configFile: false,
    root: preload.root,
    mode: preload.mode,
    logLevel: "warn",
    define: preload.define ?? {},
    ssr: { noExternal: true, resolve: preload.ssr.resolve ?? {} },
    build: {
      ssr: true,
      write: false,
      target: preload.build.target,
      minify: false,
      rollupOptions: {
        input: { [name]: entry },
        ...(preload.build.rollupOptions.external !== undefined && {
          external: preload.build.rollupOptions.external,
        }),
        output: sandboxedPreloadOutput,
      },
    },
  });
  const outputs = (Array.isArray(built) ? built : [built]) as Rollup.RollupOutput[];
  const chunks = outputs.flatMap((output) => output.output);
  const [bundle, ...strays] = chunks;
  if (bundle === undefined || bundle.type !== "chunk" || strays.length > 0) {
    throw new Error(`preload ${name} must bundle to exactly one file`);
  }
  return bundle;
}

function isSourceFile(id: string): boolean {
  return !id.startsWith("\0");
}
