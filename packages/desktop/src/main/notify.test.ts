import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { holdsForeground } from "./companion/foreground.ts";
import {
  appUserModelIdFor,
  consoleHoldsFocus,
  isNotice,
  memoryInboxThreshold,
  type NeedsYouTrigger,
  packagedAppUserModelId,
  shouldNotify,
  witnessForeground,
} from "./notify.ts";

const ask: NeedsYouTrigger = { kind: "ask", workspace: "C:/w", sessionId: "s1", callId: "c1" };

describe("shouldNotify", () => {
  it("never interrupts a focused window", () => {
    expect(shouldNotify(ask, true)).toBe(false);
    expect(
      shouldNotify(
        { kind: "memory-inbox", workspace: "C:/w", pending: memoryInboxThreshold },
        true,
      ),
    ).toBe(false);
  });

  it("fires for a pending ask while the window is unfocused", () => {
    expect(shouldNotify(ask, false)).toBe(true);
  });

  it("fires for a chore held on the keeper, the engine's interrupt tier, while the window is unfocused", () => {
    const chore: NeedsYouTrigger = {
      kind: "chore",
      workspace: "C:/w",
      creature: "wren",
      routineId: "triage",
    };
    expect(shouldNotify(chore, false)).toBe(true);
    expect(shouldNotify(chore, true)).toBe(false);
    expect(isNotice({ title: "wren · triage", body: "chore: accept", trigger: chore })).toBe(true);
    expect(
      isNotice({
        title: "x",
        body: "y",
        trigger: { kind: "chore", workspace: "C:/w", creature: 1 },
      }),
    ).toBe(false);
  });

  it("fires for the memory inbox only at the threshold", () => {
    const inbox = (pending: number): NeedsYouTrigger => ({
      kind: "memory-inbox",
      workspace: "C:/w",
      pending,
    });
    expect(shouldNotify(inbox(memoryInboxThreshold - 1), false)).toBe(false);
    expect(shouldNotify(inbox(memoryInboxThreshold), false)).toBe(true);
  });
});

describe("isNotice", () => {
  it("accepts only a titled, bodied notice with one of the two triggers", () => {
    expect(isNotice({ title: "ask", body: "bash", trigger: ask })).toBe(true);
    expect(
      isNotice({
        title: "inbox",
        body: "5 memories",
        trigger: { kind: "memory-inbox", workspace: "C:/w", pending: 5 },
      }),
    ).toBe(true);
    expect(isNotice({ title: "done", body: "turn finished" })).toBe(false);
    expect(
      isNotice({ title: "x", body: "y", trigger: { kind: "completion", workspace: "C:/w" } }),
    ).toBe(false);
    expect(isNotice({ title: "x", body: "y", trigger: { kind: "ask", workspace: "C:/w" } })).toBe(
      false,
    );
    expect(isNotice(null)).toBe(false);
  });
});

describe("the Windows toast identity", () => {
  const electron = "C:/src/keywork-app/node_modules/electron/dist/electron.exe";

  it("names an unpackaged Windows build by its executable, so its toasts show without a Start Menu shortcut", () => {
    expect(appUserModelIdFor({ platform: "win32", packaged: false, execPath: electron })).toBe(
      electron,
    );
  });

  it("names a packaged Windows build by the installer's appId, and leaves other platforms alone", () => {
    expect(appUserModelIdFor({ platform: "win32", packaged: true, execPath: electron })).toBe(
      packagedAppUserModelId,
    );
    const builder = readFileSync(join(import.meta.dirname, "../../electron-builder.yml"), "utf8");
    expect(builder).toMatch(new RegExp(`^appId: ${packagedAppUserModelId}$`, "m"));
    expect(appUserModelIdFor({ platform: "darwin", packaged: false, execPath: electron })).toBe(
      undefined,
    );
    expect(appUserModelIdFor({ platform: "linux", packaged: true, execPath: electron })).toBe(
      undefined,
    );
  });

  it("raises a chore toast while the console is unfocused and holds it while focused", () => {
    const chore: NeedsYouTrigger = {
      kind: "chore",
      workspace: "C:/w",
      creature: "vey",
      routineId: "stamp-note",
    };
    expect(shouldNotify(chore, false)).toBe(true);
    expect(shouldNotify(chore, true)).toBe(false);
    expect(isNotice({ title: "vey · stamp-note", body: "accept", trigger: chore })).toBe(true);
  });
});

describe("focus by the OS foreground window", () => {
  const chore: NeedsYouTrigger = {
    kind: "chore",
    workspace: "C:/w",
    creature: "hal",
    routineId: "stamp-note",
  };
  const console = { handle: "4242", visible: true, minimized: false };
  const browser = "777";
  let release: () => void = () => undefined;

  afterEach(() => release());

  it("raises the toast for a console Electron calls focused while another app holds the foreground", () => {
    release = witnessForeground(() => holdsForeground(browser, [console]));
    expect(consoleHoldsFocus(true)).toBe(false);
    expect(shouldNotify(chore, true)).toBe(true);
    expect(shouldNotify(ask, true)).toBe(true);
  });

  it("holds the toast only while the console window is the foreground window and visible", () => {
    release = witnessForeground(() => holdsForeground(console.handle, [console]));
    expect(shouldNotify(chore, true)).toBe(false);
    release();
    release = witnessForeground(() =>
      holdsForeground(console.handle, [{ ...console, minimized: true }]),
    );
    expect(shouldNotify(chore, true)).toBe(true);
    release();
    release = witnessForeground(() =>
      holdsForeground(console.handle, [{ ...console, visible: false }]),
    );
    expect(shouldNotify(chore, true)).toBe(true);
  });

  it("trusts Electron's blur at once and its focus only until the OS has answered", () => {
    release = witnessForeground(() => holdsForeground(console.handle, [console]));
    expect(shouldNotify(chore, false)).toBe(true);
    release();
    release = witnessForeground(() => holdsForeground(undefined, [console]));
    expect(shouldNotify(chore, true)).toBe(false);
    release();
    expect(shouldNotify(chore, true)).toBe(false);
  });
});
