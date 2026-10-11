import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { KeyworkClient } from "@keywork-app/client";
import type { BusEnvelope, TreeListing } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import treeRoot from "../../../../client/src/fixtures/tree-root.json?raw";
import treeSrc from "../../../../client/src/fixtures/tree-src.json?raw";
import { browserHost } from "../../host/browser.ts";
import { inertShellExtras, inertWorkspaceClient } from "../../shell/trust.test.ts";
import { holdTypingFocus } from "../overview/rows.test.tsx";
import type { PaneSpecBase, ShellSeams } from "../registry.ts";
import { browserPane, describeTreeRefusal, filterMissLine, markOf } from "./index.tsx";

const fixture = (raw: string): TreeListing => JSON.parse(raw) as TreeListing;

const listings: Record<string, TreeListing> = {
  "": fixture(treeRoot),
  src: fixture(treeSrc),
};

interface Harness {
  shell: ShellSeams;
  opened: PaneSpecBase[];
  asked: string[];
  push: (envelope: BusEnvelope) => void;
}

function harness(): Harness {
  const opened: PaneSpecBase[] = [];
  const asked: string[] = [];
  const listeners: Array<(envelopes: readonly BusEnvelope[]) => void> = [];
  const client = inertWorkspaceClient({
    tree: async (path) => {
      asked.push(path);
      const listing = listings[path];
      return listing === undefined ? "missing" : listing;
    },
  }) as unknown as KeyworkClient;
  const extras = inertShellExtras({ client, openPane: (spec) => void opened.push(spec) });
  extras.feed.subscribe = (listener) => {
    listeners.push(listener);
    return () => undefined;
  };
  const shell: ShellSeams = {
    store: {} as ShellSeams["store"],
    keys: { chord: (action) => `ctrl+k ${action}`, leader: () => "ctrl+k" },
    sessions: { openSession: () => {}, newSession: async () => {}, startSession: async () => {} },
    host: browserHost(),
    workspace: "C:/work",
    currentSession: () => undefined,
    rebind: () => {},
    unseen: () => false,
    ...extras,
  };
  return {
    shell,
    opened,
    asked,
    push: (envelope) => {
      for (const listener of listeners) listener([envelope]);
    },
  };
}

function mount(h: Harness, focused = true) {
  let handle: (action: string) => void = () => {};
  const view = render(() => (
    <browserPane.component
      id="p1"
      spec={{ kind: "browser" }}
      focused={focused}
      shell={h.shell}
      onAction={(handler) => {
        handle = handler;
      }}
    />
  ));
  return { view, act: (action: string) => handle(action) };
}

const names = (root: HTMLElement): string[] =>
  [...root.querySelectorAll(".kw-browser-name")].map((node) => node.textContent ?? "");

afterEach(cleanup);

describe("the files pane", () => {
  it("loads the root lazily, folders first, ignored entries dimmed and dotfiles hidden until . is pressed", async () => {
    const h = harness();
    const { view, act } = mount(h);
    await waitFor(() => expect(names(view.container)).toEqual(["dist", "src", "README.md"]));
    expect(h.asked).toEqual([""]);
    expect(
      view.container.querySelector(".kw-browser-row[data-ignored] .kw-browser-name")?.textContent,
    ).toBe("dist");
    act("browser.hidden");
    expect(names(view.container)).toEqual([
      "dist",
      "src",
      ".editorconfig",
      ".gitignore",
      "README.md",
    ]);
  });

  it("walks with j, k, l, h and enter, loading a folder only when it unfolds, and opens a file pane", async () => {
    const h = harness();
    const { view, act } = mount(h);
    await waitFor(() => expect(names(view.container)).toHaveLength(3));
    act("browser.down");
    act("browser.down");
    expect(view.container.querySelector("[data-cursor] .kw-browser-name")?.textContent).toBe("src");
    act("browser.expand");
    await waitFor(() =>
      expect(names(view.container)).toEqual(["dist", "src", "util", "index.ts", "README.md"]),
    );
    expect(h.asked).toEqual(["", "src"]);
    act("browser.down");
    act("browser.down");
    act("browser.open");
    expect(h.opened).toEqual([{ kind: "file", path: "src/index.ts" }]);
    act("browser.collapse");
    expect(view.container.querySelector("[data-cursor] .kw-browser-name")?.textContent).toBe("src");
    act("browser.collapse");
    expect(names(view.container)).toEqual(["dist", "src", "README.md"]);
  });

  it("filters loaded entries by name from the / field and clears on escape", async () => {
    const h = harness();
    const { view, act } = mount(h);
    await waitFor(() => expect(names(view.container)).toHaveLength(3));
    act("browser.filter");
    const field = (await waitFor(() => {
      const input = view.container.querySelector(".kw-browser-filter");
      expect(input).not.toBeNull();
      return input;
    })) as HTMLInputElement;
    field.value = "read";
    fireEvent.input(field);
    expect(names(view.container)).toEqual(["README.md"]);
    fireEvent.keyDown(field, { key: "Escape" });
    expect(names(view.container)).toHaveLength(3);
  });

  it("says a filter matched nothing instead of calling the workspace empty", async () => {
    const h = harness();
    const { view, act } = mount(h);
    await waitFor(() => expect(names(view.container)).toHaveLength(3));
    act("browser.filter");
    const field = (await waitFor(() => {
      const input = view.container.querySelector(".kw-browser-filter");
      expect(input).not.toBeNull();
      return input;
    })) as HTMLInputElement;
    field.value = "zzz";
    fireEvent.input(field);
    fireEvent.keyDown(field, { key: "Enter" });
    expect(names(view.container)).toEqual([]);
    expect(view.container.textContent).toContain(filterMissLine("zzz"));
    expect(view.container.textContent).not.toContain("nothing here");
  });

  it("rereads every open folder on r", async () => {
    const h = harness();
    const { view, act } = mount(h);
    await waitFor(() => expect(names(view.container)).toHaveLength(3));
    act("browser.refresh");
    await waitFor(() => expect(h.asked).toEqual(["", ""]));
  });

  it("lifts the file the agent touches and unfolds its loaded ancestors", async () => {
    const h = harness();
    const { view, act } = mount(h);
    await waitFor(() => expect(names(view.container)).toHaveLength(3));
    act("browser.down");
    act("browser.down");
    act("browser.expand");
    await waitFor(() => expect(names(view.container)).toHaveLength(5));
    act("browser.collapse");
    expect(names(view.container)).toHaveLength(3);
    h.push({
      id: 3,
      ts: "t",
      sessionId: "s1",
      type: "tool.started",
      payload: {
        call: {
          type: "tool-call",
          callId: "c1",
          name: "read",
          arguments: { path: "src/index.ts" },
        },
      },
    });
    await waitFor(() =>
      expect(view.container.querySelector("[data-lit] .kw-browser-name")?.textContent).toBe(
        "index.ts",
      ),
    );
  });

  it("names a missing or confined root plainly and marks rows by kind", () => {
    expect(describeTreeRefusal("missing", "")).toBe("no directory at the root");
    expect(describeTreeRefusal("outside-scope", "../x")).toBe("../x is outside the workspace");
    expect(markOf({ kind: "dir", expanded: false, load: "loaded" })).toBe("▸");
    expect(markOf({ kind: "dir", expanded: true, load: "loaded" })).toBe("▾");
    expect(markOf({ kind: "dir", expanded: true, load: "loading" })).toBe("░");
    expect(markOf({ kind: "file", expanded: false, load: undefined })).toBe("·");
    expect(browserPane.emptyState({ chord: () => "ctrl+k f", leader: () => "ctrl+k" })).toContain(
      "ctrl+k f",
    );
  });
});

describe("the files pane's keyboard home", () => {
  it("takes DOM focus from a typing field when it is focused, so its single keys reach it", async () => {
    const typing = holdTypingFocus();
    const { view } = mount(harness());
    await waitFor(() =>
      expect(view.container.firstElementChild?.contains(document.activeElement)).toBe(true),
    );
    typing.remove();
  });
});

describe("the files pane following a write", () => {
  it("rereads the folder once a write lands a file it has not listed, then lifts the new row", async () => {
    const h = harness();
    const { view, act } = mount(h);
    await waitFor(() => expect(names(view.container)).toHaveLength(3));
    act("browser.down");
    act("browser.down");
    act("browser.expand");
    await waitFor(() => expect(names(view.container)).toHaveLength(5));
    const before = listings.src;
    try {
      h.push(toolStarted("w1", "write", "src/fresh.ts"));
      listings.src = {
        path: "src",
        entries: [
          ...(before?.entries ?? []),
          { name: "fresh.ts", kind: "file", ignored: false, hidden: false },
        ],
      };
      h.push({
        id: 5,
        ts: "t",
        sessionId: "s1",
        type: "tool.finished",
        payload: { callId: "w1", output: "", isError: false },
      });
      await waitFor(() =>
        expect(view.container.querySelector("[data-lit] .kw-browser-name")?.textContent).toBe(
          "fresh.ts",
        ),
      );
      expect(h.asked).toEqual(["", "src", "src"]);
    } finally {
      if (before !== undefined) listings.src = before;
    }
  });
});

function toolStarted(callId: string, name: string, path: string): BusEnvelope {
  return {
    id: 4,
    ts: "t",
    sessionId: "s1",
    type: "tool.started",
    payload: { call: { type: "tool-call", callId, name, arguments: { path } } },
  };
}

describe("the files pane's chrome", () => {
  it("keeps the root path at every width and draws no focus ring of its own", () => {
    expect(narrowRules(browserCss)).not.toContain(".kw-browser-root");
    expect(browserCss).toMatch(/\.kw-browser:focus \{\s*outline: none;/);
  });
});

function narrowRules(css: string): string {
  return css.slice(css.indexOf("@container"));
}

const browserCss = readFileSync(
  join(process.cwd(), "packages/ui/src/panes/browser/browser.css"),
  "utf8",
);
