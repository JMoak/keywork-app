import { describe, expect, it } from "vitest";
import { type AllowEntry, copyViolations, findCopyHits } from "./check-copy.ts";

const pane = "packages/ui/src/panes/memory/index.tsx";

const mentionsIn = (content: string) =>
  findCopyHits({ path: pane, content }).map(({ copy, mention }) => [copy, mention]);

const violationsIn = (content: string, entries: readonly AllowEntry[] = []) =>
  copyViolations([{ path: pane, content }], entries);

const productFix =
  'use the product profile\'s name from @keywork-app/product, or name the engine in plain words ("the engine", "the server")';

describe("check:copy", () => {
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

  it("excuses an allowlisted line, and fails an entry that excuses nothing", () => {
    const entry = { path: pane, pattern: 'program: "keywork" as const', reason: "a pty id" };
    expect(violationsIn('const link = { program: "keywork" as const };', [entry])).toEqual([]);
    expect(violationsIn('const link = { program: "shell" as const };', [entry])).toEqual([
      `scripts/copy-allowlist.json: ${pane} /program: "keywork" as const/ excuses nothing | fix: delete the entry; the string it excused is gone or reads under the rule now`,
    ]);
  });
});
