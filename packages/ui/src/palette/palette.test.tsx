import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { Keymap } from "../keys/keymap.ts";
import { CommandRegistry, fuzzyScore } from "./commands.ts";
import { helpRows, Palette, paletteEntries, paletteModeOf } from "./palette.tsx";

afterEach(cleanup);

function registry(ran: string[]): CommandRegistry {
  const commands = new CommandRegistry();
  commands.register({
    name: "zoom",
    description: "zoom the pane",
    shortcut: "ctrl+k z",
    run: () => ran.push("zoom"),
  });
  commands.register({
    name: "split",
    description: "new pane",
    aliases: ["new"],
    run: () => ran.push("split"),
  });
  commands.register({
    name: "dock-cycle",
    description: "cycle home",
    run: () => ran.push("dock-cycle"),
  });
  commands.addSource(() => [
    {
      name: "go-alpha",
      label: "alpha",
      description: "jump",
      jump: true,
      run: () => ran.push("go-alpha"),
    },
  ]);
  return commands;
}

describe("CommandRegistry", () => {
  it("refuses a second claim on a name or alias", () => {
    const commands = registry([]);
    expect(commands.register({ name: "new", description: "", run: () => undefined })).toEqual({
      kind: "collision",
      name: "new",
      claimedBy: "split",
    });
  });

  it("ranks exact, prefix, and fuzzy matches in that order", () => {
    const commands = registry([]);
    expect(commands.search("zoom").map((c) => c.name)[0]).toBe("zoom");
    expect(commands.search("dc").map((c) => c.name)).toEqual(["dock-cycle"]);
    expect(fuzzyScore("zm", "zoom")).toBeGreaterThan(0);
    expect(fuzzyScore("zz", "zoom")).toBeUndefined();
  });

  it("runs by name or alias", () => {
    const ran: string[] = [];
    const commands = registry(ran);
    expect(commands.run("new")).toBe(true);
    expect(commands.run("nope")).toBe(false);
    expect(ran).toEqual(["split"]);
  });
});

describe("palette entries", () => {
  it("shows jump targets by default and commands behind a slash", () => {
    const commands = registry([]);
    expect(paletteModeOf("/zo")).toBe("commands");
    expect(paletteEntries(commands, "").map((c) => c.name)).toEqual(["go-alpha"]);
    expect(paletteEntries(commands, "/").map((c) => c.name)).toEqual([
      "zoom",
      "split",
      "dock-cycle",
    ]);
    expect(paletteEntries(commands, "/spl").map((c) => c.name)).toEqual(["split"]);
  });
});

describe("Palette", () => {
  it("filters as you type, shows bindings beside rows, and runs the selection on enter", async () => {
    const ran: string[] = [];
    let dismissed = 0;
    render(() => (
      <Palette registry={registry(ran)} initialQuery="/" onDismiss={() => (dismissed += 1)} />
    ));
    expect(screen.getByText("ctrl+k z")).toBeTruthy();
    const input = screen.getByLabelText("palette") as HTMLInputElement;
    input.value = "/sp";
    fireEvent.input(input);
    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(ran).toEqual(["split"]);
    expect(dismissed).toBe(1);
  });

  it("moves the selection with the arrows and dismisses on escape", () => {
    const ran: string[] = [];
    let dismissed = 0;
    render(() => (
      <Palette registry={registry(ran)} initialQuery="/" onDismiss={() => (dismissed += 1)} />
    ));
    const input = screen.getByLabelText("palette");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(ran).toEqual(["split"]);
    render(() => <Palette registry={registry(ran)} onDismiss={() => (dismissed += 1)} />);
    fireEvent.keyDown(screen.getAllByLabelText("palette").at(-1) as Element, { key: "Escape" });
    expect(dismissed).toBe(2);
  });
});

describe("helpRows", () => {
  it("lists every bound action with all of its chords, then the composer keys", () => {
    const keymap = new Keymap({ bindings: { "pane.zoom": ["leader z", "alt+z"] } });
    const rows = helpRows(keymap, { "pane.zoom": "zoom pane" });
    expect(rows[0]).toEqual({ keys: "ctrl+k z · alt+z", help: "zoom pane" });
    expect(rows.at(-1)?.keys).toBe("esc");
  });
});
