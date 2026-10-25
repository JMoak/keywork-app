import { describe, expect, it } from "vitest";
import { CommandRegistry } from "./commands.ts";
import { commandSlug, markChoices, markCommand, markDescriptions } from "./mark-commands.ts";

describe("mark commands", () => {
  const panes = [
    { id: "w1", title: "run echo served" },
    { id: "w2", title: "Run: echo, served!" },
    { id: "w3", title: "…" },
    { id: "w4", title: "run echo served-2" },
  ];

  it("offers every pane as one value of /mark, slugged and never twice", () => {
    const toggled: string[] = [];
    const seams = {
      panes: () => panes,
      marked: (id: string) => id === "w2",
      toggle: (id: string) => void toggled.push(id),
      toggleFocused: () => void toggled.push("focused"),
      shortcut: () => "ctrl+k b",
      say: () => {},
    };
    expect(markChoices(seams)).toEqual([
      { value: "run-echo-served", description: markDescriptions.mark },
      { value: "run-echo-served-2", description: markDescriptions.unmark },
      { value: "w3", description: markDescriptions.mark },
      { value: "run-echo-served-2-2", description: markDescriptions.mark },
    ]);
    const registry = new CommandRegistry();
    registry.register(markCommand(seams));
    expect(registry.run("mark run-echo-served-2")).toBe(true);
    expect(registry.run("mark")).toBe(true);
    expect(toggled).toEqual(["w2", "focused"]);
  });

  it("falls back to the pane id when the title has nothing to slug", () => {
    expect(commandSlug("  ", "w9")).toBe("w9");
    expect(commandSlug("Theme: Rosé pine", "w9")).toBe("theme-ros-pine");
  });
});
