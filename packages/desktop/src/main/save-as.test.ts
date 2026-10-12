import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultPathFor, type SaveSeams, saveAs } from "./save-as.ts";

function seams(chosen: string | undefined, write?: () => Promise<void>) {
  const offered: string[] = [];
  const written: Array<[string, string]> = [];
  const seams: SaveSeams = {
    folder: join("work", "lights"),
    choosePath: async (defaultPath) => {
      offered.push(defaultPath);
      return chosen;
    },
    writeText: async (path, text) => {
      await write?.();
      written.push([path, text]);
    },
  };
  return { seams, offered, written };
}

describe("saving a page through the host", () => {
  it("offers the suggested name in the workspace folder and writes where the user chose", async () => {
    const save = seams(join("elsewhere", "lights.html"));
    const outcome = await saveAs({ suggestedName: "lights.html", text: "<html>" }, save.seams);
    expect(save.offered).toEqual([join("work", "lights", "lights.html")]);
    expect(save.written).toEqual([[join("elsewhere", "lights.html"), "<html>"]]);
    expect(outcome).toEqual({ saved: true, path: join("elsewhere", "lights.html") });
  });

  it("refuses as cancelled when the dialog is dismissed and writes nothing", async () => {
    const save = seams(undefined);
    expect(await saveAs({ suggestedName: "a.html", text: "x" }, save.seams)).toEqual({
      saved: false,
      refused: "cancelled",
    });
    expect(save.written).toEqual([]);
  });

  it("says why a write failed", async () => {
    const save = seams("locked.html", async () => {
      throw new Error("EACCES");
    });
    expect(await saveAs({ suggestedName: "a.html", text: "x" }, save.seams)).toEqual({
      saved: false,
      refused: "failed",
      detail: "could not write locked.html: EACCES",
    });
  });

  it("refuses a malformed request before any dialog opens", async () => {
    const save = seams("never.html");
    expect(await saveAs({ suggestedName: 3 }, save.seams)).toMatchObject({ refused: "invalid" });
    expect(save.offered).toEqual([]);
  });

  it("keeps only the file name of a suggestion, so a renderer cannot steer the folder", () => {
    expect(defaultPathFor("../../etc/passwd", "w")).toBe(join("w", "passwd"));
    expect(defaultPathFor("..\\..\\x.html", undefined)).toBe("x.html");
    expect(defaultPathFor("", undefined)).toBe("session.html");
  });
});
