import { maxFileSliceBytes } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import {
  fileUrlOf,
  isWholeFile,
  lineLabel,
  openingRange,
  rangeAfter,
  rangeBefore,
  sizeText,
  sliceFacts,
  tailRange,
} from "./range.ts";

describe("file range math", () => {
  it("opens whole by default, at a spill's range when given, and at the tail on atEnd", () => {
    expect(openingRange({})).toEqual({});
    expect(openingRange({ from: 34, to: 60 })).toEqual({ from: 34, to: 60 });
    expect(openingRange({ from: 34 })).toEqual({ from: 34 });
    expect(openingRange({ atEnd: true })).toBe("tail");
  });

  it("reads the last slice for a tail, never before byte zero", () => {
    expect(tailRange(100)).toEqual({ from: 0, to: 100 });
    expect(tailRange(3 * maxFileSliceBytes)).toEqual({
      from: 2 * maxFileSliceBytes,
      to: 3 * maxFileSliceBytes,
    });
  });

  it("steps a slice forward and back by at most one request's worth", () => {
    const big = 5 * maxFileSliceBytes + 10;
    expect(rangeAfter({ to: maxFileSliceBytes, bytes: big })).toEqual({
      from: maxFileSliceBytes,
      to: 2 * maxFileSliceBytes,
    });
    expect(rangeAfter({ to: big, bytes: big })).toBeUndefined();
    expect(rangeBefore({ from: 0 })).toBeUndefined();
    expect(rangeBefore({ from: 100 })).toEqual({ from: 0, to: 100 });
    expect(rangeBefore({ from: 3 * maxFileSliceBytes })).toEqual({
      from: 2 * maxFileSliceBytes,
      to: 3 * maxFileSliceBytes,
    });
  });

  it("states the slice's facts honestly", () => {
    expect(isWholeFile({ from: 0, to: 68, bytes: 68 })).toBe(true);
    expect(sliceFacts({ from: 0, to: 68, bytes: 68, truncated: false })).toBe("68 B");
    expect(sliceFacts({ from: 34, to: 60, bytes: 68, truncated: false })).toBe(
      "bytes 34..60 of 68 B",
    );
    expect(
      sliceFacts({ from: 0, to: maxFileSliceBytes, bytes: 3 * maxFileSliceBytes, truncated: true }),
    ).toBe("bytes 0..1048576 of 3.0 MiB · cut to fit");
    expect(sizeText(2048)).toBe("2.0 KiB");
  });

  it("numbers lines from one at the start and relatively inside a slice", () => {
    expect(lineLabel({ from: 0 }, 0)).toBe("1");
    expect(lineLabel({ from: 34 }, 0)).toBe("+1");
  });

  it("builds a file url inside the workspace root with an optional line", () => {
    expect(fileUrlOf("C:\\work\\app", "src/index.ts", 12)).toBe(
      "file:///C:/work/app/src/index.ts#L12",
    );
    expect(fileUrlOf("/home/me/app/", "notes a.md")).toBe("file:///home/me/app/notes%20a.md");
  });
});
