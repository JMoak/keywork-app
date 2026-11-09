import { createRoot } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { createYardPanels, panelIdAt, type YardPanels } from "./panels.ts";
import { aYardSetting } from "./testing.ts";

afterEach(() => {
  document.body.replaceChildren();
});

describe("the yard's panels", () => {
  it("knows which panel holds the keyboard, and forgets it when focus leaves or the panel folds", () => {
    withPanels((panels) => {
      const diff = panel("diff");
      const fold = panels.mount("diff", {
        element: diff.root,
        kind: () => "diff",
        setting: () => aYardSetting({ id: "diff" }),
      });
      panels.focusWithin("diff", true, diff.body);
      expect(panels.inside()).toBe("diff");
      panels.focusWithin("diff", false);
      expect(panels.inside()).toBeUndefined();
      panels.focusWithin("diff", true, diff.body);
      fold();
      expect(panels.inside()).toBeUndefined();
    });
  });

  it("scopes keys typed inside a panel to that panel's own pane kind", () => {
    withPanels((panels) => {
      const file = panel("file");
      panels.mount("file", {
        element: file.root,
        kind: () => "file",
        setting: () => aYardSetting({ id: "file" }),
      });
      expect(panels.kindAt(file.body)).toBe("file");
      expect(panels.kindAt(document.body)).toBeUndefined();
      expect(panelIdAt(file.body)).toBe("file");
      expect(panels.settingOf("file")?.id).toBe("file");
      expect(panels.settingOf(undefined)).toBeUndefined();
    });
  });

  it("delivers a pane action to the panel holding the keyboard, and to nobody otherwise", () => {
    withPanels((panels) => {
      const heard: string[] = [];
      const file = panel("file");
      panels.mount("file", {
        element: file.root,
        kind: () => "file",
        setting: () => aYardSetting({ id: "file" }),
      });
      panels.handle("file", (action, argument) => heard.push(`${action} ${argument ?? ""}`));
      expect(panels.deliver("file.down")).toBe(false);
      panels.focusWithin("file", true, file.body);
      expect(panels.deliver("file.down", "2")).toBe(true);
      expect(heard).toEqual(["file.down 2"]);
    });
  });

  it("focuses a panel where the keeper last was inside it, else its pane's own root", () => {
    withPanels((panels) => {
      const file = panel("file");
      panels.mount("file", {
        element: file.root,
        kind: () => "file",
        setting: () => aYardSetting({ id: "file" }),
      });
      expect(panels.focus("file")).toBe(true);
      expect(document.activeElement).toBe(file.body);
      const input = document.createElement("input");
      file.body.append(input);
      panels.focusWithin("file", true, input);
      panels.focusWithin("file", false);
      expect(panels.focus("file")).toBe(true);
      expect(document.activeElement).toBe(input);
      expect(panels.focus("unknown")).toBe(false);
    });
  });
});

function withPanels(check: (panels: YardPanels) => void): void {
  createRoot((dispose) => {
    check(createYardPanels());
    dispose();
  });
}

function panel(id: string) {
  const root = document.createElement("div");
  root.className = "kw-yard-satellite";
  root.dataset.setting = id;
  const frame = document.createElement("div");
  frame.className = "kw-frame-body";
  const body = document.createElement("section");
  body.tabIndex = -1;
  frame.append(body);
  root.append(frame);
  document.body.append(root);
  return { root, body };
}
