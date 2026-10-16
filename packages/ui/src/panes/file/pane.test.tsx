import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { KeyworkClient } from "@keywork-app/client";
import type { FileRange, FileReading, FileSlice, TreeEntry } from "@keywork-app/protocol";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import fileWhole from "../../../../client/src/fixtures/file.json?raw";
import fileRange from "../../../../client/src/fixtures/file-range.json?raw";
import { browserHost } from "../../host/browser.ts";
import { inertShellExtras, inertWorkspaceClient } from "../../shell/trust.test.ts";
import { holdTypingFocus } from "../overview/rows.test.tsx";
import type { PaneSpecBase, ShellSeams } from "../registry.ts";
import { describeRefusal, type FileSpec, filePane } from "./index.tsx";

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

type Folders = Readonly<Record<string, readonly TreeEntry[]>>;

function harness(
  answer: (path: string, range?: FileRange) => FileReading,
  folders: Folders = {},
): Harness {
  const requests: Array<[string, FileRange | undefined]> = [];
  const external: string[] = [];
  const client = inertWorkspaceClient({
    file: async (path, range) => {
      requests.push([path, range]);
      return answer(path, range);
    },
    tree: async (path) => {
      const entries = folders[path];
      return entries === undefined ? "missing" : { path, entries };
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
    focusedPane: () => undefined,
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

  it("opens a byte range and offers more while the slice stops short of the end", async () => {
    const h = harness(() => range);
    const { view } = mount(h, { kind: "file", path: "src/index.ts", from: 34, to: 60 });
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
    }));
    const { act } = mount(h, { kind: "file", path: "log.txt", atEnd: true });
    await waitFor(() => expect(mounts[0]?.text).toBe(`slice ${big - 1024 * 1024}`));
    expect(mounts[0]?.scrolled).toEqual(["end"]);
    expect(h.requests).toEqual([
      ["log.txt", { from: 0, to: 1 }],
      ["log.txt", { from: big - 1024 * 1024, to: big }],
    ]);
    act("file.previous");
    await waitFor(() => expect(mounts[0]?.text).toBe(`slice ${big - 2 * 1024 * 1024}`));
    expect(mounts[0]?.scrolled).toEqual(["end", "end"]);
    act("file.next");
    await waitFor(() => expect(mounts[0]?.text).toBe(`slice ${big - 1024 * 1024}`));
    act("file.end");
    expect(mounts[0]?.scrolled).toEqual(["end", "end", "end"]);
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
    const h = harness(() => ({ ...whole, bytes: 0, to: 0, text: "" }));
    const { view } = mount(h, { kind: "file", path: "empty.txt" });
    await waitFor(() => expect(view.container.textContent).toContain("an empty file"));
    expect(filePane.title({ kind: "file", path: "src/a.ts" }, h.shell)).toBe("src/a.ts");
  });
});

describe("the file pane given a folder", () => {
  const file = (name: string): TreeEntry => ({ name, kind: "file", ignored: false, hidden: false });
  const dir = (name: string): TreeEntry => ({ name, kind: "dir", ignored: false, hidden: false });
  const readmeOnly = (path: string): FileReading =>
    path.endsWith("README.md") ? whole : "missing";

  function mountFollowingRebinds(h: Harness, spec: FileSpec) {
    const [current, setCurrent] = createSignal(spec);
    h.shell.rebind = (_id, next: PaneSpecBase) => setCurrent(next as FileSpec);
    render(() => (
      <filePane.component
        id="p1"
        spec={current()}
        focused={true}
        shell={h.shell}
        onAction={() => {}}
      />
    ));
    return current;
  }

  it("opens the workspace README when /open has no file the agent touched", async () => {
    const h = harness(readmeOnly, { "": [dir("src"), file("README.md")] });
    const opened = await filePane.summon?.spec(h.shell);
    expect(opened).toEqual({ kind: "file", path: "" });
    const spec = mountFollowingRebinds(h, opened as FileSpec);
    await waitFor(() => expect(spec()).toEqual({ kind: "file", path: "README.md" }));
    await waitFor(() => expect(mounts[0]?.text).toBe(whole.text));
    expect(h.requests.map(([path]) => path)).toEqual(["", "README.md"]);
    expect(filePane.title({ kind: "file", path: "" }, h.shell)).toBe("workspace");
  });

  it("opens a folder's own README, preferring markdown, whatever its case", async () => {
    const h = harness(readmeOnly, { docs: [file("readme.txt"), file("Readme.md")] });
    const spec = mountFollowingRebinds(h, { kind: "file", path: "docs" });
    await waitFor(() => expect(spec().path).toBe("docs/Readme.md"));
  });

  it("says a folder has no README and teaches the files pane instead of claiming a missing file", async () => {
    const h = harness(readmeOnly, { "": [dir("src")], src: [file("index.ts")] });
    mountFollowingRebinds(h, { kind: "file", path: "" });
    await waitFor(() =>
      expect(document.body.textContent).toContain(
        "the workspace has no README · ctrl+k browser.summon browses the files",
      ),
    );
    cleanup();
    mountFollowingRebinds(h, { kind: "file", path: "src" });
    await waitFor(() =>
      expect(document.body.textContent).toContain(
        "src has no README · ctrl+k browser.summon browses the files",
      ),
    );
    expect(document.querySelector(".kw-file-note[data-level='error']")).toBeNull();
  });
});

describe("the file pane's keyboard home", () => {
  it("takes DOM focus from a typing field when it is focused", async () => {
    const typing = holdTypingFocus();
    const h = harness(() => whole);
    const { view } = mount(h, { kind: "file", path: "src/index.ts" });
    await waitFor(() =>
      expect(view.container.firstElementChild?.contains(document.activeElement)).toBe(true),
    );
    typing.remove();
  });
});

describe("the file pane's chrome", () => {
  it("keeps the slice facts at every width, shedding only the hint, and draws no focus ring of its own", () => {
    const narrow = fileCss.slice(fileCss.indexOf("@container"));
    expect(narrow).not.toContain(".kw-file-facts");
    expect(narrow).toContain(".kw-file-more");
    expect(fileCss).toMatch(/\.kw-file:focus \{\s*outline: none;/);
  });
});

const fileCss = readFileSync(join(process.cwd(), "packages/ui/src/panes/file/file.css"), "utf8");

describe("the file pane's editor link", () => {
  it("says so in the pane when the host refuses to open the file, in the host's own words", async () => {
    const h = harness(() => whole);
    h.shell.host.openExternal = async () => {
      throw new Error(
        "Error invoking remote method 'host:open-external': Error: Failed to open: The system cannot find the file specified. (0x2)",
      );
    };
    const { view, act } = mount(h, { kind: "file", path: "src/index.ts" });
    await waitFor(() => expect(mounts[0]?.text).toBe(whole.text));
    act("file.editor");
    await waitFor(() =>
      expect(view.container.querySelector(".kw-file-note[data-level='error']")?.textContent).toBe(
        "couldn't open in your editor · Failed to open: The system cannot find the file specified. (0x2)",
      ),
    );
  });
});
