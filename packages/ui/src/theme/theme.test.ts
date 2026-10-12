import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { completeTheme } from "./complete.ts";
import { apcaLc } from "./contrast.ts";
import { mixOklab } from "./oklab.ts";
import { contrastFailures, parseTheme, type ThemeDeclaration } from "./schema.ts";
import {
  diffKeys,
  sectionFloors,
  syntaxKeys,
  terminalChromatics,
  terminalKeys,
} from "./sections.ts";
import { gallery, keyworkDay, keyworkNight } from "./themes.ts";
import {
  applyTheme,
  dressElement,
  fontVariables,
  themeAttributes,
  themeStylesheet,
  themeVariables,
  undressElement,
  variablesOfStylesheet,
} from "./variables.ts";

const bareNight: ThemeDeclaration = {
  name: "keywork-night",
  appearance: "dark",
  tokens: keyworkNight.tokens,
  density: keyworkNight.density,
  gap: 0,
  chromeWeight: "seams",
  instruments: "calm",
};

describe("parseTheme", () => {
  it("accepts every gallery theme with no contrast failures", () => {
    for (const theme of gallery) expect(contrastFailures(theme), theme.name).toEqual([]);
    expect(keyworkDay.appearance).toBe("light");
    expect(keyworkNight.pair).toBe("keywork-day");
  });

  it("refuses a theme below the floor with keywork's exact message shape", () => {
    const washedOut = {
      ...bareNight,
      name: "washed-out",
      tokens: { ...bareNight.tokens, text: "#3a3f5c" },
    };
    expect(() => parseTheme(washedOut)).toThrow(
      /^theme "washed-out" fails the contrast floor:\n {2}text on background measures Lc \d+\.\d, needs at least 60\n/,
    );
    expect(() => parseTheme(washedOut)).toThrow(
      /raise the ink or deepen the ground, then reload it\.$/,
    );
  });

  it("refuses a malformed shape naming the path", () => {
    expect(() =>
      parseTheme({ ...bareNight, tokens: { ...bareNight.tokens, accent: "purple" } }),
    ).toThrow("theme file does not fit the schema at tokens.accent: colors must be #rrggbb");
    expect(() => parseTheme({ ...bareNight, terminal: { red: "#ffffff" } })).toThrow(
      /^theme file does not fit the schema at terminal\./,
    );
  });

  it.each([
    [
      "terminal",
      { terminal: { ...keyworkNight.terminal, red: "#2a2b36" } },
      /terminal\.red on background measures Lc \d+\.\d, needs at least 30/,
    ],
    [
      "syntax",
      { syntax: { ...keyworkNight.syntax, keyword: "#2a2b36" } },
      /syntax\.keyword on panel measures .*, needs at least 30/,
    ],
    [
      "comment",
      { syntax: { ...keyworkNight.syntax, comment: "#20212c" } },
      /syntax\.comment on panel measures .*, needs at least 15/,
    ],
    [
      "diff",
      { diff: { ...keyworkNight.diff, insertedLine: "#9ece6a" } },
      /text on diff\.insertedLine measures .*, needs at least 60/,
    ],
    [
      "selection",
      { selection: { background: "#9d7cd8" } },
      /text on selection\.background measures .*, needs at least 45/,
    ],
    [
      "selection text",
      { selection: { background: "#24283b", text: "#2a2b36" } },
      /selection\.text on selection\.background measures .*, needs at least 45/,
    ],
    ["cursor", { cursor: "#2a2b36" }, /cursor on background measures .*, needs at least 40/],
  ])("holds a declared %s section to its floor in keywork's words", (_, section, message) => {
    expect(() => parseTheme({ ...bareNight, ...section })).toThrow(message);
  });

  it("measures light ink on dark ground and dark ink on light ground symmetrically enough", () => {
    expect(apcaLc("#c0caf5", "#1a1b26")).toBeGreaterThan(60);
    expect(apcaLc("#2b3150", "#e9ebf2")).toBeGreaterThan(60);
    expect(apcaLc("#1a1b26", "#1a1b26")).toBe(0);
  });
});

describe("completeTheme", () => {
  const night = completeTheme(bareNight);
  const { tokens } = bareNight;

  it("fills every absent section and keeps a declared one whole", () => {
    expect(Object.keys(night.terminal)).toEqual([...terminalKeys]);
    expect(Object.keys(night.syntax)).toEqual([...syntaxKeys]);
    expect(Object.keys(night.diff)).toEqual([...diffKeys]);
    const dressed = completeTheme({ ...bareNight, terminal: keyworkNight.terminal });
    expect(dressed.terminal).toEqual(keyworkNight.terminal);
    expect(dressed.syntax).toEqual(night.syntax);
  });

  it("derives the terminal from the outcome, accent and ramp inks and the text rungs", () => {
    const yellow = mixOklab(tokens.success, tokens.error, 0.5);
    expect(night.terminal).toMatchObject({
      black: tokens.panelLift,
      red: tokens.error,
      green: tokens.success,
      yellow,
      blue: tokens.ramp[1],
      magenta: tokens.accent,
      cyan: tokens.ramp[2],
      white: tokens.textMid,
      brightBlack: tokens.textDim,
      brightRed: mixOklab(tokens.error, tokens.text, 0.2),
      brightYellow: mixOklab(yellow, tokens.text, 0.2),
      brightWhite: tokens.text,
    });
  });

  it("falls back to accent for blue and accentSoft for cyan on a one-stop ramp", () => {
    const flat = completeTheme({ ...bareNight, tokens: { ...tokens, ramp: [tokens.accent] } });
    expect(flat.terminal.blue).toBe(tokens.accent);
    expect(flat.terminal.cyan).toBe(tokens.accentSoft);
  });

  it("derives syntax from the same inks, the diff in OKLab, selection from accentSoft", () => {
    expect(night.syntax).toMatchObject({
      comment: tokens.textDim,
      keyword: tokens.accent,
      string: tokens.success,
      number: night.terminal.yellow,
      function: tokens.ramp[1],
      type: tokens.ramp[2],
      variable: tokens.text,
      operator: tokens.textMid,
      invalid: tokens.error,
    });
    expect(night.diff).toEqual({
      insertedLine: mixOklab(tokens.panel, tokens.success, 0.14),
      deletedLine: mixOklab(tokens.panel, tokens.error, 0.14),
      insertedText: mixOklab(tokens.panel, tokens.success, 0.28),
      deletedText: mixOklab(tokens.panel, tokens.error, 0.28),
    });
    expect(night.selection).toEqual({
      background: mixOklab(tokens.panelLift, tokens.accentSoft, 0.3),
    });
    expect(night.cursor).toBe(tokens.accent);
  });

  it("steps a derived ink toward the text until it clears its floor", () => {
    const dim = { ...bareNight, tokens: { ...tokens, ramp: ["#bb9af7", "#2b3260"] } };
    const theme = completeTheme(dim);
    expect(theme.terminal.blue).not.toBe("#2b3260");
    for (const key of terminalChromatics) {
      expect(apcaLc(theme.terminal[key], tokens.background), key).toBeGreaterThanOrEqual(
        sectionFloors.terminal,
      );
    }
  });

  it("eases a diff line back toward the panel until the text reads on it", () => {
    const softer = completeTheme({ ...bareNight, tokens: { ...tokens, text: "#b0b9e2" } });
    expect(softer.diff.insertedLine).not.toBe(mixOklab(tokens.panel, tokens.success, 0.14));
    expect(apcaLc("#b0b9e2", softer.diff.insertedLine)).toBeGreaterThanOrEqual(60);
  });

  it("is deterministic", () => {
    expect(completeTheme(bareNight)).toEqual(night);
  });
});

describe("themeVariables", () => {
  it("maps every token, three ramp stops, the density mapping, the appearance and the fonts", () => {
    const variables = themeVariables(keyworkNight);
    expect(variables["--kw-background"]).toBe("#1a1b26");
    expect(variables["--kw-panel-lift"]).toBe("#24283b");
    expect(variables["--kw-ramp-3"]).toBe("#7dcfff");
    expect(variables["--kw-density-full"]).toBe("var(--kw-accent)");
    expect(variables["--kw-density-light"]).toBe("var(--kw-text-dim)");
    expect(variables["--kw-appearance"]).toBe("dark");
    expect(variables["--kw-font-prose"]).toContain("serif");
  });

  it("emits every section for the shell and the editors to read", () => {
    const variables = themeVariables(keyworkNight);
    expect(variables["--kw-terminal-bright-black"]).toBe(keyworkNight.terminal.brightBlack);
    expect(variables["--kw-terminal-cyan"]).toBe(keyworkNight.terminal.cyan);
    expect(variables["--kw-syntax-keyword"]).toBe(keyworkNight.syntax.keyword);
    expect(variables["--kw-diff-inserted-line"]).toBe(keyworkNight.diff.insertedLine);
    expect(variables["--kw-diff-deleted-text"]).toBe(keyworkNight.diff.deletedText);
    expect(variables["--kw-selection"]).toBe(keyworkNight.selection.background);
    expect(variables["--kw-selection-text"]).toBe(
      keyworkNight.selection.text ?? keyworkNight.tokens.text,
    );
    expect(variables["--kw-cursor"]).toBe(keyworkNight.cursor);
    expect(variables["--kw-gap"]).toBe("0");
    const names = Object.keys(variables);
    expect(names.filter((name) => name.startsWith("--kw-terminal-"))).toHaveLength(16);
    expect(names.filter((name) => name.startsWith("--kw-syntax-"))).toHaveLength(15);
    expect(names.filter((name) => name.startsWith("--kw-diff-"))).toHaveLength(4);
  });

  it("falls back to the text ink for selected text a theme leaves unstated", () => {
    expect(themeVariables(completeTheme(bareNight))["--kw-selection-text"]).toBe(
      bareNight.tokens.text,
    );
  });

  it("leads with the bundled faces and keeps a block-element mono before any system default", () => {
    const families = (stack: string | undefined) =>
      (stack ?? "").split(",").map((family) => family.trim().replace(/"/g, ""));
    const mono = families(fontVariables["--kw-font-mono"]);
    expect(mono[0]).toBe("JetBrains Mono");
    expect(mono.indexOf("Cascadia Code")).toBe(1);
    expect(mono.indexOf("ui-monospace")).toBeGreaterThan(mono.indexOf("DejaVu Sans Mono"));
    expect(mono.at(-1)).toBe("monospace");
    expect(families(fontVariables["--kw-font-prose"])[0]).toBe("Source Serif 4");
  });

  it("repeats the last ramp stop when a theme declares fewer than three", () => {
    const flat = parseTheme({ ...bareNight, tokens: { ...bareNight.tokens, ramp: ["#bb9af7"] } });
    expect(themeVariables(flat)["--kw-ramp-3"]).toBe("#bb9af7");
  });

  it("marks the root with the theme's name, appearance, chrome, instruments and gap", () => {
    const root = document.createElement("div");
    const airy = parseTheme({
      ...bareNight,
      name: "airy",
      chromeWeight: "borderless",
      instruments: "cockpit",
      gap: 2,
    });
    applyTheme(airy, root);
    expect({ ...root.dataset }).toEqual({
      theme: "airy",
      appearance: "dark",
      chrome: "borderless",
      instruments: "cockpit",
      gap: "2",
    });
    expect(root.style.getPropertyValue("--kw-gap")).toBe("2");
    expect(root.style.getPropertyValue("--kw-terminal-red")).toBe(airy.terminal.red);
    expect(themeAttributes(keyworkDay).appearance).toBe("light");
  });

  it("is the single source the default stylesheet is derived from", () => {
    const css = readFileSync(
      join(process.cwd(), "packages/ui/src/theme/keywork-night.css"),
      "utf8",
    );
    expect(variablesOfStylesheet(css)).toEqual(themeVariables(keyworkNight));
    expect(css).toBe(themeStylesheet(keyworkNight));
  });
});

describe("dressing a single element", () => {
  it("dresses an element in everything but the house's gap", () => {
    const element = document.createElement("section");
    dressElement(element, keyworkDay);
    expect({ ...element.dataset }).toEqual({
      theme: keyworkDay.name,
      appearance: "light",
      chrome: keyworkDay.chromeWeight,
      instruments: keyworkDay.instruments,
    });
    expect(element.style.colorScheme).toBe("light");
    expect(element.style.getPropertyValue("--kw-panel")).toBe(keyworkDay.tokens.panel);
    expect(element.style.getPropertyValue("--kw-syntax-keyword")).toBe(keyworkDay.syntax.keyword);
    expect(element.style.getPropertyValue("--kw-gap")).toBe("");
  });

  it("undresses exactly what dressing set and leaves the element's own styles alone", () => {
    const element = document.createElement("section");
    element.dataset.state = "working";
    element.style.setProperty("--kw-pane-hue", "var(--kw-ramp-2)");
    dressElement(element, keyworkDay);
    undressElement(element);
    expect({ ...element.dataset }).toEqual({ state: "working" });
    expect(element.style.colorScheme).toBe("");
    expect(element.style.getPropertyValue("--kw-panel")).toBe("");
    expect(element.style.getPropertyValue("--kw-pane-hue")).toBe("var(--kw-ramp-2)");
  });
});
