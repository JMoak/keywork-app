import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { emptyProjection, projectAll, type SessionProjection } from "@keywork-app/client";
import { describe, expect, it } from "vitest";
import { parseJsonl } from "../../dev/replay.ts";
import { flavorVariables, keyworkDay, keyworkNight } from "../../flavor/index.ts";
import { nextMode } from "./index.tsx";
import { terminalKeeps } from "./keys.ts";
import { bashCommand, mirrorDelta, mirrorText } from "./mirror.ts";
import { chooseRenderer, probeWebgl2 } from "./renderer.ts";
import { bridgeArgs } from "./session.ts";
import { terminalTheme, themeVariables } from "./theme.ts";

const fixtures = join(import.meta.dirname, "..", "..", "..", "..", "client", "src", "fixtures");

async function toolTurn(): Promise<SessionProjection> {
  const envelopes = parseJsonl(await readFile(join(fixtures, "tool.jsonl"), "utf8"));
  return projectAll(emptyProjection, envelopes);
}

function plain(text: string): string {
  return text.replace(new RegExp(`${ansiEscape}\\[[0-9;]*m`, "g"), "");
}
const ansiEscape = String.fromCharCode(27);

describe("mirror mode", () => {
  it("renders the recorded bash turn as a stamped command, its output and the outcome", async () => {
    const text = mirrorText(await toolTurn());
    expect(text.endsWith("\r\n")).toBe(true);
    expect(plain(text).split("\r\n").slice(0, -1)).toEqual([
      "░ $ echo served",
      "served",
      "░ done · 1250 ms · 6 chars",
    ]);
    expect(text).toContain("\x1b[1m$ echo served\x1b[22m");
  });

  it("echoes the live tail while the command runs and the reason when it fails", async () => {
    const envelopes = parseJsonl(await readFile(join(fixtures, "tool.jsonl"), "utf8"));
    const running = projectAll(emptyProjection, envelopes.slice(0, 6));
    expect(plain(mirrorText(running)).split("\r\n").slice(0, -1)).toEqual([
      "░ $ echo served",
      "served",
    ]);
    const failed = projectAll(emptyProjection, [
      ...envelopes.slice(0, 5),
      {
        id: 6,
        ts: "2026-09-07T12:00:02.250Z",
        sessionId: "s1",
        type: "tool.finished",
        payload: { callId: "c1", output: "boom: no such file", isError: true },
      },
    ]);
    expect(plain(mirrorText(failed))).toContain("░ failed: boom: no such file");
    expect(mirrorText(failed)).toContain("\x1b[31m");
  });

  it("says so when the session has no bash calls and ignores other tools", () => {
    expect(plain(mirrorText(emptyProjection))).toContain("no bash calls in this session yet");
  });

  it("reads the full command from the arguments rather than the trimmed subject", () => {
    const run = {
      ...(emptyProjection.entries[0] ?? {}),
      callId: "c",
      name: "bash",
      subject: "a very long command that the subject line…",
      args: JSON.stringify({ command: "a very long command that the subject line truncates" }),
      replay: false,
      phase: "done" as const,
      startedAt: undefined,
      live: undefined,
      reason: undefined,
      durationMs: undefined,
      outputChars: undefined,
      detail: undefined,
      spill: undefined,
      decision: undefined,
      ask: undefined,
    };
    expect(bashCommand(run)).toBe("a very long command that the subject line truncates");
    expect(bashCommand({ ...run, args: "not json" })).toBe(run.subject);
  });

  it("writes only the new tail when the text grows and resets when it changes underneath", () => {
    expect(mirrorDelta("ab", "abcd")).toEqual({ reset: false, write: "cd" });
    expect(mirrorDelta("ab", "ab")).toEqual({ reset: false, write: "" });
    expect(mirrorDelta("ab", "xb")).toEqual({ reset: true, write: "xb" });
  });
});

describe("the xterm theme", () => {
  it("maps every ANSI slot to a flavor token and omits what the flavor lacks", () => {
    const variables = flavorVariables(keyworkNight);
    const theme = terminalTheme((name) => variables[name] ?? "");
    expect(theme.background).toBe(keyworkNight.tokens.panel);
    expect(theme.foreground).toBe(keyworkNight.tokens.text);
    expect(theme.red).toBe(keyworkNight.tokens.error);
    expect(theme.green).toBe(keyworkNight.tokens.success);
    expect(theme.brightBlack).toBe(keyworkNight.tokens.textDim);
    expect(theme.brightWhite).toBe(keyworkNight.tokens.text);
    expect(theme.blue).toBe(keyworkNight.tokens.ramp[1]);
    expect(theme.extendedAnsi).toBeUndefined();
    for (const slot of ["black", "white", "yellow", "magenta", "cyan", "cursor"] as const) {
      expect(theme[slot], slot).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(terminalTheme(() => "")).toEqual({});
  });

  it("survives a flavor swap and a monochrome flavor without inventing colors", () => {
    const day = flavorVariables(keyworkDay);
    const theme = terminalTheme((name) => day[name] ?? "");
    expect(theme.background).toBe(keyworkDay.tokens.panel);
    const grey = terminalTheme(() => " #777777 ");
    expect(new Set(Object.values(grey))).toEqual(new Set(["#777777"]));
    for (const variable of Object.values(themeVariables)) {
      expect(variable === "" || variable.startsWith("--kw-")).toBe(true);
    }
  });
});

describe("the renderer choice", () => {
  it("takes WebGL only when a context exists and has not been lost", () => {
    expect(chooseRenderer({ webgl2: true })).toBe("webgl");
    expect(chooseRenderer({ webgl2: false })).toBe("dom");
    expect(chooseRenderer({ webgl2: true, contextLost: true })).toBe("dom");
  });

  it("treats a throwing or null context as no WebGL", () => {
    expect(probeWebgl2(() => ({ getContext: () => null }) as unknown as HTMLCanvasElement)).toBe(
      false,
    );
    expect(
      probeWebgl2(() => {
        throw new Error("no canvas");
      }),
    ).toBe(false);
    expect(probeWebgl2(() => ({ getContext: () => ({}) }) as unknown as HTMLCanvasElement)).toBe(
      true,
    );
  });
});

describe("keys inside a terminal", () => {
  const key = (overrides: Partial<KeyboardEvent>) => ({
    type: "keydown",
    key: "a",
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    isComposing: false,
    ...overrides,
  });

  it("gives every key to the pty except the leader", () => {
    expect(terminalKeeps(key({ key: "c", ctrlKey: true }), "ctrl+k")).toBe(true);
    expect(terminalKeeps(key({ key: "p", ctrlKey: true }), "ctrl+k")).toBe(true);
    expect(terminalKeeps(key({ key: "Escape" }), "ctrl+k")).toBe(true);
    expect(terminalKeeps(key({ key: "k", ctrlKey: true }), "ctrl+k")).toBe(false);
    expect(terminalKeeps(key({ key: "k", ctrlKey: true }), "ctrl+space")).toBe(true);
    expect(terminalKeeps(key({ key: "Control" }), "ctrl+k")).toBe(true);
    expect(terminalKeeps(key({ key: "л", ctrlKey: true, code: "KeyK" }), "ctrl+k")).toBe(false);
  });
});

describe("modes and the bridge", () => {
  it("cycles shell → mirror → bridge → shell", () => {
    expect(nextMode("shell")).toBe("mirror");
    expect(nextMode("mirror")).toBe("bridge");
    expect(nextMode("bridge")).toBe("shell");
  });

  it("attaches to the current session, or runs connect for onboarding, never carrying a token", () => {
    expect(bridgeArgs({})).toEqual(["attach"]);
    expect(bridgeArgs({ sessionId: "s1" })).toEqual(["attach", "--session", "s1"]);
    expect(bridgeArgs({ sessionId: "s1", verb: "connect" })).toEqual(["connect"]);
  });
});
