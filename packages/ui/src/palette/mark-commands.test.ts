import { describe, expect, it } from "vitest";
import { CommandRegistry } from "./commands.ts";
import { commandSlug, markCommands, markDescriptions } from "./mark-commands.ts";

describe("mark commands", () => {
  const panes = [
    { id: "w1", title: "run echo served" },
    { id: "w2", title: "Run: echo, served!" },
    { id: "w3", title: "…" },
    { id: "w4", title: "run echo served-2" },
  ];

  it("slugs every pane title into a name the registry can hold, never twice", () => {
    const toggled: string[] = [];
    const commands = markCommands(panes, {
      marked: (id) => id === "w2",
      toggle: (id) => void toggled.push(id),
    });
    expect(commands.map((command) => command.name)).toEqual([
      "mark-run-echo-served",
      "mark-run-echo-served-2",
      "mark-w3",
      "mark-run-echo-served-2-2",
    ]);
    expect(new Set(commands.map((command) => command.name)).size).toBe(commands.length);
    expect(commands.map((command) => command.label)).toEqual([
      "mark run echo served",
      "mark Run: echo, served!",
      "mark …",
      "mark run echo served-2",
    ]);
    expect(commands.map((command) => command.description)).toEqual([
      markDescriptions.mark,
      markDescriptions.unmark,
      markDescriptions.mark,
      markDescriptions.mark,
    ]);
    const registry = new CommandRegistry();
    registry.addSource(() => commands);
    expect(registry.run("mark-run-echo-served-2")).toBe(true);
    expect(toggled).toEqual(["w2"]);
  });

  it("falls back to the pane id when the title has nothing to slug", () => {
    expect(commandSlug("  ", "w9")).toBe("w9");
    expect(commandSlug("Theme: Rosé pine", "w9")).toBe("theme-ros-pine");
  });
});
