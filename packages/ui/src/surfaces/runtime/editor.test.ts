import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { mountMergeView } from "../../panes/diff/merge-view.ts";
import { mountTextView } from "../../panes/file/text-view.ts";
import { followWindow } from "./editor.ts";
import { type Realm, settleRealms } from "./realm.ts";
import { openChild } from "./testing.ts";

const children: Realm[] = [];

afterEach(() => {
  for (const child of children.splice(0)) child.close();
  document.body.replaceChildren();
});

describe("a code view in a pane that changes window", () => {
  it("takes the page it moved to as its root, and the console again on the way back", () => {
    const child = secondWindow();
    const host = hostIn(document);
    const view = new EditorView({ doc: "const outside = true;\n", parent: host });
    const stop = followWindow(view);
    expect(view.root).toBe(document);
    child.document.body.append(host);
    settleRealms();
    expect(view.root).toBe(child.document);
    document.body.append(host);
    settleRealms();
    expect(view.root).toBe(document);
    stop();
    child.document.body.append(host);
    settleRealms();
    expect(view.root).toBe(document);
    view.destroy();
  });

  it("carries the file pane's view and both sides of a split diff across", () => {
    const child = secondWindow();
    const fileHost = hostIn(document);
    const diffHost = hostIn(document);
    const file = mountTextView(fileHost, "one\ntwo\n", { label: (index) => String(index + 1) });
    const diff = mountMergeView(diffHost, { before: "one\n", after: "one\ntwo\n" }, "split");
    child.document.body.append(fileHost, diffHost);
    settleRealms();
    expect(rootsOf(fileHost, diffHost)).toEqual([child.document, child.document, child.document]);
    file.destroy();
    diff.destroy();
  });
});

function secondWindow(): Realm {
  const child = openChild();
  children.push(child);
  return child;
}

function hostIn(page: Document): HTMLElement {
  const host = document.createElement("div");
  page.body.append(host);
  return host;
}

function rootsOf(...hosts: readonly HTMLElement[]): Array<DocumentOrShadowRoot | undefined> {
  return hosts.flatMap((host) =>
    [...host.querySelectorAll<HTMLElement>(".cm-editor")].map(
      (editor) => EditorView.findFromDOM(editor)?.root,
    ),
  );
}
