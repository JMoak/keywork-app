import { describe, expect, it } from "vitest";
import { introducingClient, introductionFrame, introductionWordLimit } from "./introduction.ts";

const names = ["Wren", "Tam", "Moss"];

describe("the first thread's frame", () => {
  it("asks for the voice guide's introduction: under 80 words, what it read, three proposals, one line of reach, no invented gates", () => {
    const frame = introductionFrame({
      name: "Wren",
      workspace: "C:/src/stead",
      named: true,
      names,
    });
    expect(frame).toMatchSnapshot();
    expect(frame).toContain(`under ${introductionWordLimit} words`);
    expect(frame).toContain("workspace at C:/src/stead");
    expect(frame).toContain("three concrete things");
    expect(frame).toContain("what you can and cannot reach right now");
    expect(frame).toContain("Propose nothing that needs a gate that does not exist.");
    expect(frame).not.toContain("Tam");
    expect(frame).not.toMatch(/!/);
  });

  it("opens with the three names as one question when naming was skipped", () => {
    const frame = introductionFrame({
      name: "Wren",
      workspace: "C:/src/stead",
      named: false,
      names,
    });
    expect(frame).toMatchSnapshot();
    expect(frame).toContain("one question and nothing else");
    expect(frame).toContain("Wren, Tam and Moss");
    expect(frame).toContain("Wren stands until one is chosen");
    expect(frame).toContain(`under ${introductionWordLimit} words`);
  });

  it("asks for an introduction from what the creature already knows, with nothing read and no tool run first", () => {
    for (const named of [true, false]) {
      const frame = introductionFrame({ name: "Wren", workspace: "C:/src/stead", named, names });
      expect(frame).toContain("from what you already know");
      expect(frame).toContain("your creature.json, your workshop and the keeper's name");
      expect(frame).toContain("read nothing and run no tool before you speak");
      expect(frame).not.toMatch(/what you have read|begin with|what you can read here/);
    }
  });

  it("names the console as the injecting client in the shape the inject route accepts", () => {
    expect(introducingClient).toMatch(/^[A-Za-z0-9._-]{1,64}$/);
  });
});
