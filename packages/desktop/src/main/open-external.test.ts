import { describe, expect, it } from "vitest";
import { externalVerdict } from "./open-external.ts";

const roots = ["C:/work/app", "D:/other"];

describe("openExternal's allowlist", () => {
  it("passes web links through untouched", () => {
    expect(externalVerdict("https://keywork.dev/docs", roots)).toEqual({
      ok: true,
      url: "https://keywork.dev/docs",
    });
    expect(externalVerdict("http://127.0.0.1:4770/doc", [])).toMatchObject({ ok: true });
  });

  it("opens a file: link only inside an open workspace root", () => {
    expect(externalVerdict("file:///C:/work/app/src/index.ts", roots)).toEqual({
      ok: true,
      url: "file:///C:/work/app/src/index.ts",
    });
    expect(externalVerdict("file:///C:/work/app", roots)).toMatchObject({ ok: true });
    expect(externalVerdict("file:///C:/work/app-evil/secret.txt", roots)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("outside the open workspaces"),
    });
    expect(externalVerdict("file:///C:/work/app/../passwords.txt", roots)).toMatchObject({
      ok: false,
    });
    expect(externalVerdict("file:///C:/work/app/a.ts", [])).toMatchObject({ ok: false });
  });

  it("refuses every other scheme and anything that is not a url", () => {
    expect(externalVerdict("mailto:someone@example.com", roots)).toEqual({
      ok: false,
      reason: "refusing to open mailto: links",
    });
    expect(externalVerdict("not a url", roots)).toMatchObject({ ok: false });
  });
});
