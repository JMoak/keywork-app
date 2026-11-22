import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodePngHeader, encodePng, trayMarkPng, trayModel } from "./tray.ts";
import { windowRegistry } from "./windows.ts";

describe("trayModel", () => {
  it("names the needs-you count in the tooltip and badge, and lists every open workspace", () => {
    const model = trayModel([
      { workspace: "C:/work/app", windows: 1, needsYou: 2 },
      { workspace: "/home/me/tool", windows: 2, needsYou: 0 },
    ]);
    expect(model.tooltip).toBe("keywork · 2 need you");
    expect(model.badge).toBe("2 need you");
    expect(model.menu).toEqual([
      { kind: "action", label: "Open Folder…", action: "open-folder" },
      { kind: "separator" },
      {
        kind: "action",
        label: "app  (C:/work/app) · 2 need you",
        action: "open-recent",
        payload: "C:/work/app",
      },
      {
        kind: "action",
        label: "tool  (/home/me/tool)",
        action: "open-recent",
        payload: "/home/me/tool",
      },
      { kind: "separator" },
      { kind: "action", label: "Quit", action: "quit" },
    ]);
  });

  it("follows the queue length a window reports as items arrive and are answered", () => {
    const registry = windowRegistry();
    registry.add(7, "C:/work/app");
    const badges: Array<string | undefined> = [];
    registry.onChange(() => badges.push(trayModel(registry.list()).badge));
    registry.setNeedsYou(7, 1);
    registry.setNeedsYou(7, 3);
    registry.setNeedsYou(7, 0);
    expect(badges).toEqual(["1 needs you", "3 need you", undefined]);
  });
});

describe("trayMarkPng", () => {
  it("encodes a valid PNG of the requested size", () => {
    const png = trayMarkPng({ size: 16, filled: false, ink: "white" });
    expect(decodePngHeader(png)).toEqual({ width: 16, height: 16 });
    expect(decodePngHeader(trayMarkPng({ size: 32, filled: true, ink: "black" }))).toEqual({
      width: 32,
      height: 32,
    });
    expect(decodePngHeader(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });

  it("round-trips arbitrary pixels through the encoder", () => {
    const rgba = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);
    const read = pixelsOf(encodePng(2, 1, rgba), 2);
    expect(read(0, 0)).toEqual([10, 20, 30, 40]);
    expect(read(1, 0)).toEqual([50, 60, 70, 80]);
  });
});

function pixelsOf(png: Uint8Array, width: number): (x: number, y: number) => number[] {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let offset = 8;
  let idat: Uint8Array = new Uint8Array(0);
  while (offset < png.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    if (type === "IDAT") idat = png.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
  }
  const raw = new Uint8Array(inflateSync(idat));
  const stride = width * 4 + 1;
  return (x, y) => [...raw.subarray(y * stride + 1 + x * 4, y * stride + 5 + x * 4)];
}
