import { describe, expect, it } from "vitest";
import { type AllowEntry, copyViolations, findCopyHits, keeperFacingPath } from "./check-copy.ts";
import allowlist from "./copy-allowlist.json" with { type: "json" };

const pane = "packages/ui/src/panes/memory/index.tsx";

const mentionsIn = (content: string) =>
  findCopyHits({ path: pane, content }).map(({ copy, mention }) => [copy, mention]);

const violationsIn = (content: string, entries: readonly AllowEntry[] = []) =>
  copyViolations([{ path: pane, content }], entries);

const productFix =
  'use the product profile\'s name from @keywork-app/product, or name the engine in plain words ("the engine", "the server")';

describe("check:copy", () => {
  it("passes a cli verb quoted as a command", () => {
    expect(mentionsIn('const line = "run `keywork trust` in a terminal";')).toEqual([
      ["run `keywork trust` in a terminal", "cli verb"],
    ]);
    expect(mentionsIn("const stop = `How to stop: \\`keywork node uninstall\\`.`;")).toEqual([
      ["How to stop: \\`keywork node uninstall\\`.", "cli verb"],
    ]);
    expect(violationsIn('const line = "run `keywork trust` in a terminal";')).toEqual([]);
  });

  it("passes identifiers, the engine binary and version, and the url scheme", () => {
    const content = [
      `const key = \`keywork.layout:\${workspace}\`;`,
      'const file = "~/.keywork/keywork.json";',
      'const host = "keyworkHost";',
      `const about = \`keywork \${expectedServerVersion} inside\`;`,
      'const echo = "the browser build has no keywork binary";',
      'const link = "keywork://open?path=C%3A";',
    ].join("\n");
    expect(mentionsIn(content).map(([, mention]) => mention)).toEqual([
      "identifier",
      "identifier",
      "identifier",
      "identifier",
      "engine version",
      "engine binary",
      "url scheme",
    ]);
    expect(violationsIn(content)).toEqual([]);
  });

  it("fails keywork named in a sentence, with its line and a fix", () => {
    const sentence = `const line = \`keywork reopened on \${name}\`;`;
    expect(violationsIn(["const a = 1;", sentence].join("\n"))).toEqual([
      `${pane}:2: "keywork reopened on \${name}" | fix: ${productFix}`,
    ]);
    expect(violationsIn('const title = () => <h1 class="kw-open-name">keywork</h1>;')).toEqual([
      `${pane}:1: "keywork" | fix: ${productFix}`,
    ]);
  });

  it("finds hard-coded Stead branding and accepts the profile, feature and scheme", () => {
    expect(violationsIn('const title = "About Stead";')).toEqual([
      `${pane}:1: "About Stead" | fix: ${productFix}`,
    ]);
    expect(violationsIn('const title = "start the stead app";')).toHaveLength(1);
    expect(violationsIn("const title = () => <h1>stead</h1>;")).toHaveLength(1);
    expect(violationsIn(`const line = \`starting \${profile.name}\`;`)).toEqual([]);
    expect(violationsIn('const line = "creatures live on the stead";')).toEqual([]);
    expect(violationsIn('const link = "stead://open?path=C%3A";')).toEqual([]);
  });

  it("asks for quotes around a command named bare", () => {
    expect(violationsIn('const line = "run keywork trust in a terminal";')).toEqual([
      `${pane}:1: "run keywork trust in a terminal" | fix: quote the command as \`keywork trust\`, or say "the server" where it names the running engine`,
    ]);
  });

  it("reads no comparison, case label or type, which a keeper never sees", () => {
    const content = [
      'type Program = "shell" | "keywork";',
      'const bridged = program === "keywork";',
      'switch (program) { case "keywork": break; }',
      "// keywork in a comment",
    ].join("\n");
    expect(mentionsIn(content)).toEqual([]);
  });

  it("excuses an allowlisted line, and fails an entry that excuses nothing", () => {
    const entry = { path: pane, pattern: 'program: "keywork" as const', reason: "a pty id" };
    expect(violationsIn('const link = { program: "keywork" as const };', [entry])).toEqual([]);
    expect(violationsIn('const link = { program: "shell" as const };', [entry])).toEqual([
      `scripts/copy-allowlist.json: ${pane} /program: "keywork" as const/ excuses nothing | fix: delete the entry; the string it excused is gone or reads under the rule now`,
    ]);
  });

  it("calls an entry stale when the line it names already reads under the rule", () => {
    const entry = { path: pane, pattern: "keywork trust", reason: "quoted already" };
    expect(violationsIn('const line = "run `keywork trust` in a terminal";', [entry])).toHaveLength(
      1,
    );
  });

  it("scans the renderer and the main process, never tests or their fixtures", () => {
    expect(keeperFacingPath("packages/ui/src/page/pane.tsx")).toBe(true);
    expect(keeperFacingPath("packages/desktop/src/main/screen/guards.ts")).toBe(true);
    expect(keeperFacingPath("packages/ui/src/page/pane.test.tsx")).toBe(false);
    expect(keeperFacingPath("packages/ui/src/panes/creature/testing.ts")).toBe(false);
    expect(keeperFacingPath("packages/ui/src/shell/client-testing.ts")).toBe(false);
    expect(keeperFacingPath("packages/ui/src/onboarding/fixtures.ts")).toBe(false);
    expect(keeperFacingPath("packages/desktop/src/main/screen/fakes.ts")).toBe(false);
    expect(keeperFacingPath("packages/desktop/e2e/first-light/driver.mjs")).toBe(false);
    expect(keeperFacingPath("packages/ui/src/companion/e2e/companion.electron.ts")).toBe(false);
  });

  it("keeps every allowlist entry on a scanned file with a reason", () => {
    for (const entry of allowlist) {
      expect(keeperFacingPath(entry.path)).toBe(true);
      expect(entry.reason).not.toBe("");
    }
  });
});
