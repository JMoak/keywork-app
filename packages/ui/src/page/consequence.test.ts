import type { PermissionRule } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import {
  argumentRows,
  commandParts,
  consequenceOf,
  coverageLines,
  fileChange,
  fileHead,
  mcpCallName,
  ruleWords,
} from "./consequence.ts";

const bashRule = (resource: string): PermissionRule => ({
  action: "bash",
  resource,
  effect: "allow",
});

describe("what an ask would do", () => {
  const preview = { path: "notes.txt", before: null, after: "one\ntwo\n" };

  it("shows a write or an edit through keywork's own preview when it sends one", () => {
    expect(consequenceOf({ tool: "write", arguments: {}, preview })).toEqual({
      kind: "file",
      tool: "write",
      preview,
    });
    expect(consequenceOf({ tool: "edit", arguments: { path: "a.ts" } })).toEqual({
      kind: "unpreviewed",
    });
  });

  it("typesets a bash command, tables an mcp call, and leaves any other tool its arguments", () => {
    expect(consequenceOf({ tool: "bash", arguments: { command: "ls" } })).toMatchObject({
      kind: "command",
      parts: [{ text: "ls", role: "program" }],
    });
    expect(
      consequenceOf({ tool: "github__create_issue", arguments: { repo: "JMoak/keywork" } }),
    ).toEqual({
      kind: "call",
      server: "github",
      tool: "create_issue",
      rows: [{ name: "repo", value: "JMoak/keywork", fold: undefined }],
    });
    expect(consequenceOf({ tool: "webfetch", arguments: { url: "https://x" } })).toEqual({
      kind: "arguments",
    });
    expect(consequenceOf({ tool: "bash", arguments: { timeoutMs: 5 } })).toEqual({
      kind: "arguments",
    });
    expect(consequenceOf({ tool: "github__list", arguments: ["not", "named"] })).toEqual({
      kind: "arguments",
    });
    expect(consequenceOf(undefined)).toEqual({ kind: "arguments" });
  });
});

describe("a file's head", () => {
  const before = ["one", "two", "three", "four", "five", ""].join("\n");

  it("counts the lines an edit adds and removes and where it starts", () => {
    const after = ["one", "two", "THREE", "3.5", "four", "five", ""].join("\n");
    expect(fileChange(before, after)).toEqual({ added: 2, removed: 1, firstLine: 3, hunks: 1 });
  });

  it("names the line when an edit touches one place and the places when it touches more", () => {
    const one = ["one", "two", "three", "four", "", ""].join("\n");
    const two = ["ONE", "two", "three", "four", "FIVE", ""].join("\n");
    expect(fileHead("edit", { path: "a.ts", before, after: one })).toBe(
      "edit a.ts · line 5 · +1 −1",
    );
    expect(fileHead("edit", { path: "a.ts", before, after: two })).toBe(
      "edit a.ts · 2 places · +2 −2",
    );
  });

  it("calls a write with nothing before it a new file and counts its lines", () => {
    const head = (after: string) => fileHead("write", { path: "notes.md", before: null, after });
    expect(head("# notes\n\nfirst\n")).toBe("write notes.md · new file · 3 lines");
    expect(head("one")).toBe("write notes.md · new file · 1 line");
    expect(head("")).toBe("write notes.md · new file · 0 lines");
  });

  it("says when the call would leave the file as it is", () => {
    expect(fileHead("write", { path: "a.ts", before, after: before })).toBe(
      "write a.ts · no change",
    );
  });
});

describe("a typeset command", () => {
  const roles = (command: string) =>
    commandParts(command)
      .filter((part) => part.role !== "space")
      .map((part) => [part.text, part.role]);

  it("marks every program in a compound command, its flags, operators and paths", () => {
    expect(roles("bun test src/a.test.ts --rerun-each 20 | tee out.log && git status")).toEqual([
      ["bun", "program"],
      ["test", "word"],
      ["src/a.test.ts", "path"],
      ["--rerun-each", "flag"],
      ["20", "word"],
      ["|", "operator"],
      ["tee", "program"],
      ["out.log", "path"],
      ["&&", "operator"],
      ["git", "program"],
      ["status", "word"],
    ]);
  });

  it("reads a redirect target as a path and a descriptor copy as an operator", () => {
    expect(roles("echo hi > out 2>&1")).toEqual([
      ["echo", "program"],
      ["hi", "word"],
      [">", "operator"],
      ["out", "path"],
      ["2>&1", "operator"],
    ]);
  });

  it("reads a leading variable assignment apart from the program it sets up", () => {
    expect(roles("CI=1 bun test")).toEqual([
      ["CI=1", "word"],
      ["bun", "program"],
      ["test", "word"],
    ]);
  });

  it("keeps quoted text whole", () => {
    expect(roles('git commit -m "a | b"').map(([text]) => text)).toEqual([
      "git",
      "commit",
      "-m",
      '"a | b"',
    ]);
  });

  it("loses no character of the command", () => {
    const command = "rg -n 'x y' src;ls 2>> err.log & echo \"unclosed";
    expect(
      commandParts(command)
        .map((part) => part.text)
        .join(""),
    ).toBe(command);
  });
});

describe("an mcp call", () => {
  it("splits its name into server and tool, and reads a keywork tool as no mcp call", () => {
    expect(mcpCallName("github__create_issue")).toEqual({
      server: "github",
      tool: "create_issue",
    });
    expect(mcpCallName("read")).toBeUndefined();
    expect(mcpCallName("__x")).toBeUndefined();
    expect(mcpCallName("x__")).toBeUndefined();
  });

  it("lists its arguments one per row, folding long values the way the transcript does", () => {
    const rows = argumentRows({
      repo: "JMoak/keywork",
      labels: ["server"],
      title: "x".repeat(100),
      body: "first line\nsecond\nthird\n",
      note: "one\ntwo",
    });
    expect(rows[0]).toEqual({ name: "repo", value: "JMoak/keywork", fold: undefined });
    expect(rows[1]).toEqual({ name: "labels", value: '["server"]', fold: undefined });
    expect(rows[2]?.value).toBe(`${"x".repeat(80)}…`);
    expect(rows[3]).toEqual({ name: "body", value: "first line", fold: "… 2 more lines" });
    expect(rows[4]?.fold).toBe("… 1 more line");
  });
});

describe("what a remembered answer would cover", () => {
  it("words each rule exactly as keywork reports it", () => {
    expect(ruleWords(bashRule("bun test *"))).toBe("any bun test command");
    expect(ruleWords(bashRule("rm -rf build"))).toBe("the exact command rm -rf build");
    expect(ruleWords(bashRule("git status*"))).toBe("any command matching git status*");
  });

  it("names the forms keywork holds back from a wildcard over their program", () => {
    expect(ruleWords(bashRule("git push *"))).toBe("any git push command but git push --force");
    expect(ruleWords(bashRule("git branch *"))).toBe("any git branch command but git branch -D");
  });

  it("says how far each remembering scope reaches", () => {
    const rules = [bashRule("bun test *"), bashRule("tee *")];
    expect(coverageLines(rules, ["session", "workspace"])).toEqual([
      "no ask for any bun test command or any tee command until this session ends",
      "the same in every session of this workspace, until revoked",
    ]);
    expect(coverageLines(rules, ["workspace"])).toEqual([
      "no ask for any bun test command or any tee command in every session of this workspace, until revoked",
    ]);
  });
});
