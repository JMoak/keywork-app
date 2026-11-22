import { describe, expect, it } from "vitest";
import { agentMarkLabel, setOutLine } from "./copy.ts";

const note = { kind: "note" } as const;

describe("who a setting says set it out", () => {
  it("names the creature for its own setting and the session's owner for one with no creature", () => {
    expect(setOutLine({ creature: "wren", what: note }, "Wren")).toBe("Wren showed a note");
    expect(setOutLine({ creature: null, what: note }, "this session")).toBe(
      "a note from this session",
    );
  });

  it("names the agent itself, never the creature it worked through", () => {
    const named = { creature: "wren", what: note, agent: { name: "claude-code" } };
    const unnamed = { creature: "wren", what: note, agent: {} };
    expect(setOutLine(named, "Wren")).toBe("claude-code showed a note");
    expect(setOutLine(unnamed, "Wren")).toBe("an agent showed a note");
    expect(agentMarkLabel(named.agent)).toBe("set out by claude-code, an agent");
    expect(agentMarkLabel(unnamed.agent)).toBe("set out by an agent");
  });
});
