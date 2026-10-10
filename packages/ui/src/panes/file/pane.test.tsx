import type { KeyworkClient } from "@keywork-app/client";
import type { FileRange, FileReading, FileSlice } from "@keywork-app/protocol";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import fileWhole from "../../../../client/src/fixtures/file.json?raw";
import fileRange from "../../../../client/src/fixtures/file-range.json?raw";
import { browserHost } from "../../host/browser.ts";
import { inertShellExtras, inertWorkspaceClient } from "../../shell/trust.test.ts";
import type { ShellSeams } from "../registry.ts";
import { describeRefusal, type FileSpec, filePane, spillFileSpec } from "./index.tsx";

interface FakeMount {
  text: string;
  scrolled: string[];
}

const mounts: FakeMount[] = [];

vi.mock("./text-view.ts", () => ({
  mountTextView: (host: HTMLElement, text: string) => {
    const mount: FakeMount = { text, scrolled: [] };
    host.textContent = text;
    mounts.push(mount);
    return {
      replace: (next: string) => {
        mount.text = next;
        host.textContent = next;
      },
      scrollTo: (edge: string) => void mount.scrolled.push(edge),
      scrollBy: (lines: number) => void mount.scrolled.push(`by ${lines}`),
      lineAtTop: () => 7,
      destroy: () => undefined,
    };
  },
}));

const fixture = (raw: string): FileSlice => JSON.parse(raw) as FileSlice;

const whole = fixture(fileWhole);
const range = fixture(fileRange);

interface Harness {
  shell: ShellSeams;
  requests: Array<[string, FileRange | undefined]>;
  external: string[];
}

function harness(answer: (path: string, range?: FileRange) => FileReading): Harness {
  const requests: Array<[string, FileRange | undefined]> = [];
  const external: string[] = [];
  const client = inertWorkspaceClient({
    file: async (path, range) => {
      requests.push([path, range]);
      return answer(path, range);
    },
  }) as unknown as KeyworkClient;
  const host = browserHost();
  host.openExternal = async (url) => void external.push(url);
  const shell: ShellSeams = {
    store: {} as ShellSeams["store"],
    keys: { chord: (action) => `ctrl+k ${action}`, leader: () => "ctrl+k" },
    sessions: { openSession: () => {}, newSession: async () => {}, startSession: async () => {} },
    host,
    workspace: "C:/work",
    currentSession: () => undefined,
    rebind: () => {},
    unseen: () => false,
    ...inertShellExtras({ client }),
  };
  return { shell, requests, external };
}

function mount(h: Harness, spec: FileSpec) {
  let handle: (action: string) => void = () => {};
  const view = render(() => (
    <filePane.component
      id="p1"
      spec={spec}
      focused={true}
      shell={h.shell}
      onAction={(handler) => {
        handle = handler;
      }}
    />
  ));
  return { view, act: (action: string) => handle(action) };
}

afterEach(() => {
  cleanup();
  mounts.splice(0);
});

describe("the file pane", () => {
  it("reads the whole file by default and shows its size, then opens it in the editor at the top line", async () => {
    const h = harness(() => whole);
    const { view, act } = mount(h, { kind: "file", path: "src/index.ts" });
    await waitFor(() => expect(mounts[0]?.text).toBe(whole.text));
    expect(h.requests).toEqual([["src/index.ts", {}]]);
    expect(view.container.querySelector(".kw-file-facts")?.textContent).toBe("68 B");
    expect(view.container.querySelector(".kw-file-more")).toBeNull();
    act("file.editor");
    expect(h.external).toEqual(["file:///C:/work/src/index.ts#L7"]);
    act("file.top");
    act("file.down");
    expect(mounts[0]?.scrolled).toEqual(["top", "by 1"]);
  });

  it("opens a spill at its range and says which bytes it holds", async () => {
    const h = harness(() => range);
    const spec = spillFileSpec({ id: "q1", bytes: 68, elidedFrom: 34, elidedTo: 60 });
    expect(spec).toEqual({ kind: "file", path: "q1", from: 34, to: 60 });
    const { view } = mount(h, { ...spec, path: "src/index.ts" });
    await waitFor(() => expect(mounts[0]?.text).toBe(range.text));
    expect(h.requests).toEqual([["src/index.ts", { from: 34, to: 60 }]]);
    expect(view.container.querySelector(".kw-file-facts")?.textContent).toBe(
      "bytes 34..60 of 68 B",
    );
    expect(view.container.querySelector(".kw-file-more")?.textContent).toContain("] loads more");
  });

  it("reads the tail for atEnd by probing the size first, and steps slices with ] and [", async () => {
    const big = 3 * 1024 * 1024;
    const h = harness((_path, range) => ({
      ...whole,
      bytes: big,
      from: range?.from ?? 0,
      to: range?.to ?? big,
      text: `slice ${range?.from ?? 0}`,
      eof: (range?.to ?? big) >= big,
    }));
    const { act } = mount(h, { kind: "file", path: "log.txt", atEnd: true });
    await waitFor(() => expect(mounts[0]?.text).toBe(`slice ${big - 1024 * 1024}`));
    expect(h.requests).toEqual([
      ["log.txt", { from: 0, to: 1 }],
      ["log.txt", { from: big - 1024 * 1024, to: big }],
    ]);
    act("file.previous");
    await waitFor(() => expect(mounts[0]?.text).toBe(`slice ${big - 2 * 1024 * 1024}`));
    act("file.next");
    await waitFor(() => expect(mounts[0]?.text).toBe(`slice ${big - 1024 * 1024}`));
    act("file.end");
    expect(mounts[0]?.scrolled).toEqual(["end"]);
  });

  it("states a binary, oversized, missing or confined file honestly", async () => {
    const h = harness((path) =>
      path === "photo.png"
        ? "binary"
        : path === "huge.bin"
          ? "too-large"
          : path === "gone"
            ? "missing"
            : "outside-scope",
    );
    for (const [path, expected] of [
      ["photo.png", "holds binary bytes"],
      ["huge.bin", "over 20 MiB"],
      ["gone", "no file at gone"],
      ["../etc", "outside the workspace"],
    ] as const) {
      const { view } = mount(h, { kind: "file", path });
      await waitFor(() =>
        expect(
          view.container.querySelector(".kw-file-note[data-level='error']")?.textContent,
        ).toContain(expected),
      );
      cleanup();
    }
    expect(describeRefusal("binary", "a")).toContain("binary");
    expect(mounts).toHaveLength(0);
  });

  it("shows the empty state for an empty file and titles itself with the path", async () => {
    const h = harness(() => ({ ...whole, bytes: 0, to: 0, text: "", eof: true }));
    const { view } = mount(h, { kind: "file", path: "empty.txt" });
    await waitFor(() => expect(view.container.textContent).toContain("an empty file"));
    expect(filePane.title({ kind: "file", path: "src/a.ts" }, h.shell)).toBe("src/a.ts");
  });
});
