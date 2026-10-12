import { execFileSync } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parseTheme, type Theme } from "../packages/ui/src/theme/schema.ts";
import { themeStylesheet } from "../packages/ui/src/theme/variables.ts";
import { keyworkModuleUrl, keyworkRepo } from "./lib/keywork-checkout.ts";
import { repoRoot, reportViolations } from "./lib/repo-files.ts";

export const galleryFile = join(repoRoot, "packages/ui/src/theme/gallery.json");
export const stylesheetFile = join(repoRoot, "packages/ui/src/theme/keywork-night.css");
export const houseFile = join(repoRoot, "scripts/themes/house.json");
export const keyworkGalleryModule = "packages/shared/src/config/gallery.ts";
export const keyworkCompletionModule = "packages/shared/src/config/complete-theme.ts";
export const defaultThemeName = "keywork-night";
export const houseThemeNames = ["keywork-night", "keywork-day"] as const;

export interface GallerySource {
  readonly origin: string;
  readonly themes: readonly unknown[];
}

export type KeyworkCompletion = (theme: unknown) => unknown;

export async function gallerySource(root = keyworkRepo): Promise<GallerySource> {
  const served = await keyworkGallery(root);
  if (served !== undefined) return { origin: join(root, keyworkGalleryModule), themes: served };
  return { origin: houseFile, themes: await recordedThemes(houseFile) };
}

export async function keyworkCompletionOf(
  root = keyworkRepo,
): Promise<KeyworkCompletion | undefined> {
  const module = await keyworkModule<{ completeTheme?: KeyworkCompletion }>(
    keyworkCompletionModule,
    root,
  );
  return module?.completeTheme;
}

export function galleryViolations(themes: readonly unknown[]): string[] {
  const parsed: Theme[] = [];
  const refusals: string[] = [];
  for (const candidate of themes) {
    try {
      parsed.push(parseTheme(candidate));
    } catch (cause) {
      refusals.push(cause instanceof Error ? cause.message : String(cause));
    }
  }
  const names = parsed.map((theme) => theme.name);
  return [
    ...refusals,
    ...names
      .filter((name, index) => names.indexOf(name) !== index)
      .map((name) => `the gallery names "${name}" twice`),
    ...houseThemeNames
      .filter((name) => !names.includes(name))
      .map((name) => `the gallery lost the house theme "${name}"`),
    ...parsed
      .filter((theme) => theme.pair !== undefined && !names.includes(theme.pair))
      .map((theme) => `${theme.name} pairs with "${theme.pair}", which the gallery lacks`),
  ];
}

export function galleryDrift(recorded: readonly unknown[], source: GallerySource): string[] {
  const recordedByName = byName(recorded);
  const sourceByName = byName(source.themes);
  return [
    ...[...sourceByName.keys()]
      .filter((name) => !recordedByName.has(name))
      .map((name) => `${name} is in ${source.origin} but not the app gallery`),
    ...[...recordedByName.keys()]
      .filter((name) => !sourceByName.has(name))
      .map((name) => `${name} is in the app gallery but not ${source.origin}`),
    ...[...sourceByName.entries()]
      .filter(([name, theme]) => {
        const mine = recordedByName.get(name);
        return mine !== undefined && canonical(mine) !== canonical(theme);
      })
      .map(([name]) => `${name} differs from ${source.origin}`),
    ...(sameOrder(recorded, source.themes)
      ? []
      : [`the gallery order differs from ${source.origin}`]),
  ];
}

export function stylesheetOf(themes: readonly unknown[]): string {
  const theme = themes.map((candidate) => parseTheme(candidate)).find(isDefault);
  if (theme === undefined) throw new Error(`the gallery has no ${defaultThemeName}`);
  return themeStylesheet(theme);
}

export async function recordedThemes(file = galleryFile): Promise<unknown[]> {
  return (JSON.parse(await readFile(file, "utf8")) as { themes: unknown[] }).themes;
}

export async function syncThemes(source: GallerySource): Promise<void> {
  const violations = galleryViolations(source.themes);
  if (violations.length > 0) throw new Error(violations.join("\n"));
  await writeFile(galleryFile, `${JSON.stringify({ themes: source.themes }, null, 2)}\n`);
  execFileSync(process.execPath, ["x", "biome", "format", "--write", galleryFile], {
    cwd: repoRoot,
    stdio: "ignore",
  });
  await writeFile(stylesheetFile, stylesheetOf(source.themes));
}

export async function checkThemes(source: GallerySource): Promise<string[]> {
  const recorded = await recordedThemes();
  const stylesheet = await readFile(stylesheetFile, "utf8");
  return [
    ...galleryViolations(recorded),
    ...galleryDrift(recorded, source),
    ...(stylesheet === stylesheetOf(recorded)
      ? []
      : [
          "keywork-night.css differs from the gallery's keywork-night; run bun scripts/sync-themes.ts",
        ]),
  ];
}

async function keyworkGallery(root: string): Promise<readonly unknown[] | undefined> {
  const module = await keyworkModule<{ gallery?: readonly unknown[] }>(keyworkGalleryModule, root);
  return module?.gallery;
}

async function keyworkModule<Shape>(relative: string, root: string): Promise<Shape | undefined> {
  try {
    await access(join(root, relative));
  } catch {
    return undefined;
  }
  return (await import(keyworkModuleUrl(relative, root))) as Shape;
}

function byName(themes: readonly unknown[]): Map<string, unknown> {
  return new Map(themes.map((theme) => [nameOf(theme), theme]));
}

function nameOf(theme: unknown): string {
  return typeof theme === "object" && theme !== null && "name" in theme ? String(theme.name) : "";
}

function sameOrder(left: readonly unknown[], right: readonly unknown[]): boolean {
  return canonical(left.map(nameOf)) === canonical(right.map(nameOf));
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_, inner: unknown) =>
    typeof inner === "object" && inner !== null && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );
}

function isDefault(theme: Theme): boolean {
  return theme.name === defaultThemeName;
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { check: { type: "boolean", default: false } } });
  const source = await gallerySource();
  if (values.check) {
    process.exitCode = reportViolations(
      {
        check: "check:themes",
        heading: `the app gallery drifted from ${source.origin} (run bun scripts/sync-themes.ts):`,
        scanned: `${source.themes.length} themes from ${source.origin}`,
      },
      await checkThemes(source),
    );
  } else {
    await syncThemes(source);
    console.log(`synced ${source.themes.length} themes from ${source.origin}`);
  }
}
