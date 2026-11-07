import { cleanup } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountPane, settle } from "../overview/testing.tsx";
import { creaturePane } from "./index.tsx";
import { creatureHarness, flat, noon, wrenReport } from "./testing.ts";

const lineElements = "h3, p, dt, li, tr, canvas, legend, label";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: noon });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the profile as text", () => {
  it("reads top to bottom as the committed golden", async () => {
    const harness = creatureHarness({ report: wrenReport() });
    const { container } = mountPane(
      creaturePane.component,
      { kind: "creature", slug: "wren" },
      harness.shell,
    );
    await settle();
    await settle();
    await settle();
    await expect(profileText(container)).toMatchFileSnapshot("./golden/wren.txt");
    harness.dispose();
  });
});

export function profileText(container: HTMLElement): string {
  const lines: string[] = [];
  for (const element of container.querySelectorAll(lineElements)) {
    if (element.tagName === "CANVAS") {
      lines.push(
        `[portrait ${element.getAttribute("aria-label")} · skin ${element.getAttribute("data-skin")} · ${(element as HTMLCanvasElement).style.width} x ${(element as HTMLCanvasElement).style.height}]`,
      );
      continue;
    }
    if (element.tagName === "DT") {
      const value = element.nextElementSibling;
      lines.push(`${flat(element)}  ${value === null ? "" : flat(value)}`);
      continue;
    }
    if (element.tagName === "TR") {
      lines.push([...element.children].map(flat).join(" | "));
      continue;
    }
    if (element.tagName === "H3") {
      lines.push(`## ${flat(element)}`);
      continue;
    }
    lines.push(flat(element));
  }
  return `${lines.join("\n").replace(/\b\d\d:\d\d\b/g, "HH:MM")}\n`;
}
