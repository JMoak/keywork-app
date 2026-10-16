import type { TreeEntry, TreeReading } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { bareFolderLine, folderOpening, pathTitle, readmeIn } from "./folder.ts";
import { pathToOpen, rememberAgentFile } from "./recent.ts";

const file = (name: string): TreeEntry => ({ name, kind: "file", ignored: false, hidden: false });
const dir = (name: string): TreeEntry => ({ name, kind: "dir", ignored: false, hidden: false });

const listing = (reading: TreeReading) => async (): Promise<TreeReading> => reading;

describe("a folder's README", () => {
  it("prefers markdown, then a bare README, then plain text, matching case-insensitively", () => {
    expect(readmeIn([file("README.txt"), file("readme.md")])).toBe("readme.md");
    expect(readmeIn([file("README.txt"), file("README")])).toBe("README");
    expect(readmeIn([file("Readme.TXT")])).toBe("Readme.TXT");
  });

  it("is never a folder named README nor a file that only starts with it", () => {
    expect(readmeIn([dir("README.md"), file("README-old.md"), file("readmes.md")])).toBeUndefined();
  });

  it("resolves a folder to its README's path, a bare folder, or nothing to open", async () => {
    const root = { path: "", entries: [dir("src"), file("README.md")] };
    expect(await folderOpening({ tree: listing(root) }, "")).toEqual({
      kind: "readme",
      path: "README.md",
    });
    const docs = { path: "docs", entries: [file("README.md")] };
    expect(await folderOpening({ tree: listing(docs) }, "docs")).toEqual({
      kind: "readme",
      path: "docs/README.md",
    });
    const bare = { path: "src", entries: [file("index.ts")] };
    expect(await folderOpening({ tree: listing(bare) }, "src")).toEqual({ kind: "bare-folder" });
    expect(await folderOpening({ tree: listing("missing") }, "gone")).toEqual({
      kind: "not-a-folder",
    });
  });

  it("names the workspace root as the workspace in the title and the line", () => {
    expect(pathTitle("")).toBe("workspace");
    expect(pathTitle("src/a.ts")).toBe("src/a.ts");
    expect(bareFolderLine("", "leader f")).toBe(
      "the workspace has no README · leader f browses the files",
    );
    expect(bareFolderLine("src", "leader f")).toBe(
      "src has no README · leader f browses the files",
    );
  });
});

describe("the path /open reaches for", () => {
  it("is the workspace root until the agent touches a file, then that file", () => {
    expect(pathToOpen()).toBe("");
    rememberAgentFile("src/index.ts");
    expect(pathToOpen()).toBe("src/index.ts");
  });
});
