import { fireEvent, render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { ratchetValue } from "../shell/frame-tick-ratchets.ts";
import { Composer } from "./composer.tsx";
import { graphemeCorpus } from "./grapheme-corpus.ts";
import { clusterAfter, clusterBefore, graphemesOf } from "./graphemes.ts";
import { humanBytes, lineCount, utf8Bytes } from "./paste-vault.ts";

describe("T1: the grapheme corpus through the composer", () => {
  it("covers at least the ratcheted number of hard grapheme families", () => {
    expect(graphemeCorpus.length).toBeGreaterThanOrEqual(ratchetValue("T1.graphemeCorpusSamples"));
  });

  describe.each(graphemeCorpus)("$name", ({ text }) => {
    const clusters = graphemesOf(text);

    it("walks the caret cluster by cluster in both directions", () => {
      const forward = [0];
      while (forward.at(-1) !== text.length) forward.push(clusterAfter(text, lastOf(forward)).end);
      const backward = [text.length];
      while (backward.at(-1) !== 0) backward.push(clusterBefore(text, lastOf(backward)).start);
      expect(forward).toEqual(boundariesOf(clusters));
      expect(backward.reverse()).toEqual(boundariesOf(clusters));
    });

    it("erases one whole cluster per backspace from the end", () => {
      const composer = mount();
      composer.type(text);
      for (let left = clusters.length - 1; left >= 0; left -= 1) {
        composer.press("Backspace");
        expect(composer.input.value).toBe(clusters.slice(0, left).join(""));
      }
    });

    it("erases one whole cluster per delete from the start", () => {
      const composer = mount();
      composer.type(text);
      for (let erased = 1; erased <= clusters.length; erased += 1) {
        composer.caretAt(0);
        composer.press("Delete");
        expect(composer.input.value).toBe(clusters.slice(erased).join(""));
      }
    });

    it("never splits a cluster when the caret sits inside one", () => {
      const composer = mount();
      for (const inside of insideOffsets(clusters)) {
        composer.type(text);
        composer.caretAt(inside);
        composer.press("Backspace");
        expect(graphemesOf(composer.input.value)).toEqual(withoutClusterAt(clusters, inside));
      }
    });

    it("submits the typed text byte-identical on the wire", () => {
      const composer = mount();
      for (let typed = 1; typed <= clusters.length; typed += 1) {
        composer.type(clusters.slice(0, typed).join(""));
      }
      composer.press("Enter");
      expect(composer.queued).toEqual([text]);
      expect(utf8(composer.queued[0] ?? "")).toEqual(utf8(text));
    });
  });
});

describe("T2: a paste flood", () => {
  const floodBytes = ratchetValue("T2.floodBytes");
  const floodLines = ratchetValue("T2.floodLines");
  const draftBudget = ratchetValue("T2.floodDraftChars");

  it.each([
    ["multi-megabyte", megabyteFlood(floodBytes)],
    ["ten-thousand-line", lineFlood(floodLines)],
  ])("lands a %s paste as one honest placeholder that never submits", (_, flood) => {
    const composer = mount();
    composer.type("look at this: ");
    composer.paste(flood);
    const placeholder = `[pasted #1, ${lineCount(flood)} lines, ${humanBytes(utf8Bytes(flood))}]`;
    expect(composer.input.value).toBe(`look at this: ${placeholder}`);
    expect(placeholder.length).toBeLessThanOrEqual(draftBudget);
    expect(composer.queued).toEqual([]);
    expect(composer.sent).toEqual([]);
    composer.press("Enter", { altKey: true });
    expect(composer.sent).toEqual([`look at this: ${flood}`]);
    expect(composer.input.value).toBe("");
  });

  it("measures the size in utf-8 bytes, not code units", () => {
    const flood = megabyteFlood(floodBytes);
    expect(utf8Bytes(flood)).toBeGreaterThanOrEqual(floodBytes);
    expect(utf8Bytes(flood)).toBeGreaterThan(flood.length);
    expect(humanBytes(utf8Bytes(flood))).toMatch(/^\d+\.\d MB$/);
  });

  it("erases a held paste with one backspace, never leaving a torn placeholder", () => {
    const composer = mount();
    composer.paste(lineFlood(floodLines));
    composer.press("Backspace");
    expect(composer.input.value).toBe("");
    composer.press("Enter");
    expect(composer.queued).toEqual([]);
  });

  it("numbers two floods in one draft and expands both in place", () => {
    const composer = mount();
    const first = lineFlood(7);
    const second = lineFlood(8);
    composer.paste(first);
    composer.typeAtCaret(" then ");
    composer.paste(second);
    expect(composer.input.value).toBe(
      `[pasted #1, 7 lines, ${humanBytes(utf8Bytes(first))}] then [pasted #2, 8 lines, ${humanBytes(utf8Bytes(second))}]`,
    );
    composer.press("Enter");
    expect(composer.queued).toEqual([`${first} then ${second}`]);
  });

  it("keeps a small paste inline and normalizes its line endings", () => {
    const composer = mount();
    composer.paste("a\r\nb\rc");
    expect(composer.input.value).toBe("a\nb\nc");
  });

  it("leaves a placeholder it never held as literal text", () => {
    const composer = mount();
    composer.type("[pasted #9, 40 lines, 1.0 KB]");
    composer.press("Enter");
    expect(composer.queued).toEqual(["[pasted #9, 40 lines, 1.0 KB]"]);
  });
});

function mount() {
  const sent: string[] = [];
  const queued: string[] = [];
  const { container } = render(() => (
    <Composer
      queue={[]}
      onSteer={(text) => sent.push(text)}
      onQueue={(text) => queued.push(text)}
      onInterrupt={() => undefined}
    />
  ));
  const input = container.querySelector("textarea") as HTMLTextAreaElement;
  const caretAt = (offset: number): void => input.setSelectionRange(offset, offset);
  const type = (text: string): void => {
    input.value = text;
    caretAt(text.length);
    fireEvent.input(input);
  };
  const typeAtCaret = (text: string): void => {
    input.setRangeText(text, input.selectionStart, input.selectionEnd, "end");
    fireEvent.input(input);
  };
  const press = (key: string, modifiers: Partial<KeyboardEventInit> = {}): void => {
    fireEvent.keyDown(input, { key, ...modifiers });
  };
  const paste = (text: string): void => {
    fireEvent.paste(input, { clipboardData: { getData: () => text } });
  };
  return { input, sent, queued, caretAt, type, typeAtCaret, press, paste };
}

function boundariesOf(clusters: readonly string[]): number[] {
  const boundaries = [0];
  for (const cluster of clusters) boundaries.push(lastOf(boundaries) + cluster.length);
  return boundaries;
}

function insideOffsets(clusters: readonly string[]): number[] {
  return boundariesOf(clusters).flatMap((start, index) => {
    const length = clusters[index]?.length ?? 0;
    return Array.from({ length: Math.max(0, length - 1) }, (_, step) => start + step + 1);
  });
}

function withoutClusterAt(clusters: readonly string[], offset: number): string[] {
  const boundaries = boundariesOf(clusters);
  const holder = boundaries.findIndex(
    (start, index) => start < offset && offset < (boundaries[index + 1] ?? 0),
  );
  return clusters.filter((_, index) => index !== holder);
}

function lastOf(values: readonly number[]): number {
  return values.at(-1) ?? 0;
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function megabyteFlood(bytes: number): string {
  const line = `${"lorem ipsum ".repeat(40)}é 👍🏾 漢字`;
  return Array.from({ length: Math.ceil(bytes / utf8Bytes(line)) }, () => line).join("\n");
}

function lineFlood(lines: number): string {
  return Array.from({ length: lines }, (_, index) => `line ${index + 1}`).join("\n");
}
