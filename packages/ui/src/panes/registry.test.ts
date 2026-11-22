import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { actionScopes, appActions } from "../keys/actions.ts";
import { keymapFromConfig } from "../keys/config.ts";
import { Keymap } from "../keys/keymap.ts";
import { ratchetValue } from "../shell/frame-tick-ratchets.ts";
import { paneActions, paneRegistry, parsePaneSpec } from "./index.ts";
import { createCloseGate } from "./registry.ts";
import { checkPaneDefinition, emptyStateMinWidthPx, narrowPanePx } from "./testing.ts";

const keymap = keymapFromConfig();
const keys = {
  chord: (action: string) => keymap.describe(action) ?? "an unbound key",
  leader: () => keymap.leader,
};

describe("the pane inventory", () => {
  it("T7: fits every empty state into a 320 px pane without overflow", () => {
    const narrowest = Math.max(
      ...[...paneRegistry.values()].map((definition) =>
        emptyStateMinWidthPx(definition.emptyState(keys)),
      ),
    );
    expect(narrowest).toBeLessThanOrEqual(narrowPanePx);
    expect(narrowest).toBeLessThanOrEqual(ratchetValue("T7.emptyStateMinWidthPx"));
    expect(emptyStateCss).not.toMatch(/white-space:\s*(nowrap|pre)\b/);
  });

  it("parses each pane's own spec and refuses a foreign kind", () => {
    expect(parsePaneSpec({ kind: "conversation", sessionId: "s1" })).toEqual({
      kind: "conversation",
      sessionId: "s1",
    });
    expect(parsePaneSpec({ kind: "tree" })).toEqual({ kind: "tree" });
    expect(parsePaneSpec({ kind: "sessions" })).toEqual({ kind: "tree" });
    expect(parsePaneSpec({ kind: "diff", sessionId: "s1", path: "a.ts" })).toEqual({
      kind: "diff",
      sessionId: "s1",
      path: "a.ts",
    });
    expect(parsePaneSpec({ kind: "browser" })).toEqual({ kind: "browser" });
    expect(parsePaneSpec({ kind: "file", path: "src/a.ts", from: 3, to: 9 })).toEqual({
      kind: "file",
      path: "src/a.ts",
      from: 3,
      to: 9,
    });
    expect(parsePaneSpec({ kind: "file" })).toBeUndefined();
    expect(parsePaneSpec({ kind: "nope" })).toBeUndefined();
  });

  it("passes checkPaneDefinition for every registered pane, as each pane's own test does", () => {
    for (const definition of paneRegistry.values()) checkPaneDefinition(definition);
  });

  it("binds every pane-local action to its own kind and keeps the table collision-free", () => {
    for (const [name, action] of Object.entries(paneActions)) {
      if (action.scope === undefined) continue;
      expect(paneRegistry.get(action.scope)?.localActions?.[name]).toBeDefined();
    }
    expect(() => new Keymap({ bindings: keymapBindings(), scopes: actionScopes })).not.toThrow();
  });
});

const emptyStateCss = readFileSync(
  join(process.cwd(), "packages/ui/src/panes/empty-state.css"),
  "utf8",
);

function keymapBindings(): Record<string, string | readonly string[]> {
  return Object.fromEntries(
    Object.entries(appActions).map(([name, action]) => [name, action.chords]),
  );
}

describe("closing a pane that guards itself", () => {
  it("holds the first close back with the pane's reason and lets the same close through on a second ask", async () => {
    let now = 0;
    const gate = createCloseGate(() => now);
    gate.guard("terminal-1", async () => "ping is running");
    expect(await gate.holdBack("terminal-1", () => 5000)).toBe("ping is running");
    now = 4000;
    expect(await gate.holdBack("terminal-1", () => 5000)).toBeUndefined();
  });

  it("lets a second ask through at once, without waiting on the pane again", async () => {
    let now = 0;
    let asked = 0;
    const gate = createCloseGate(() => now);
    gate.guard("terminal-1", async () => {
      asked += 1;
      now += 1500;
      return "ping is running";
    });
    expect(await gate.holdBack("terminal-1", () => 2000)).toBe("ping is running");
    now = 3400;
    expect(await gate.holdBack("terminal-1", () => 2000)).toBeUndefined();
    expect(asked).toBe(1);
  });

  it("asks again once the warning has lapsed or another pane was asked about", async () => {
    let now = 0;
    const gate = createCloseGate(() => now);
    gate.guard("terminal-1", async () => "ping is running");
    gate.guard("terminal-2", async () => "vim is running");
    await gate.holdBack("terminal-1", () => 1000);
    now = 2000;
    expect(await gate.holdBack("terminal-1", () => 1000)).toBe("ping is running");
    expect(await gate.holdBack("terminal-2", () => 1000)).toBe("vim is running");
    expect(await gate.holdBack("terminal-1", () => 1000)).toBe("ping is running");
  });
});
