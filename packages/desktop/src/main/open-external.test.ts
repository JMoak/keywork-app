import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { externalVerdict } from "./open-external.ts";

const onWindows = process.platform === "win32";
const app = onWindows ? "C:/work/app" : "/work/app";
const roots = [app, onWindows ? "D:/other" : "/other"];

function fileLink(path: string): string {
  return pathToFileURL(path).href;
}

describe("openExternal's allowlist", () => {
  it("passes web links through untouched", () => {
    expect(externalVerdict("https://keywork.dev/docs", roots)).toEqual({
      ok: true,
      url: "https://keywork.dev/docs",
    });
    expect(externalVerdict("http://127.0.0.1:4770/doc", [])).toMatchObject({ ok: true });
  });

  it("opens a file: link only inside an open workspace root", () => {
    expect(externalVerdict(`${fileLink(`${app}/src/index.ts`)}#L12`, roots)).toEqual({
      ok: true,
      url: `${fileLink(`${app}/src/index.ts`)}#L12`,
      path: expect.stringMatching(/index\.ts$/),
      line: 12,
    });
    expect(externalVerdict(fileLink(app), roots)).toMatchObject({ ok: true });
    expect(externalVerdict(fileLink(`${app}-evil/secret.txt`), roots)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("outside the open workspaces"),
    });
    expect(externalVerdict(`${fileLink(app)}/../passwords.txt`, roots)).toMatchObject({
      ok: false,
    });
    expect(externalVerdict(fileLink(`${app}/a.ts`), [])).toMatchObject({ ok: false });
  });

  it("refuses every other scheme and anything that is not a url", () => {
    expect(externalVerdict("mailto:someone@example.com", roots)).toEqual({
      ok: false,
      reason: "refusing to open mailto: links",
    });
    expect(externalVerdict("not a url", roots)).toMatchObject({ ok: false });
  });
});
