import { cleanup, fireEvent } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { mountPane, overviewShell, rowTexts, settle } from "../overview/rows.test.tsx";
import { noWorkingSession } from "../overview/working-session.ts";
import { botAside, botLabel, botsPane } from "./index.tsx";

afterEach(cleanup);

describe("the bots pane", () => {
  it("spells identity typographically as sigil and name with scope and cost beside", async () => {
    const harness = overviewShell();
    await harness.surfaces.load();
    const { container } = mountPane(botsPane.component, { kind: "bots" }, harness.shell);
    expect(rowTexts(container)).toEqual([
      "▓ ◆ reviewer project · 3 sessions · $0.412",
      "░ ✎ scribe user · 0 sessions",
    ]);
    expect(container.querySelector(".kw-ov-chip")).toBeNull();
    expect(botLabel({ sigil: "◆", name: "reviewer" })).toBe("◆ reviewer");
    expect(botAside({ name: "x", sigil: "x", source: "user", sessions: 1 })).toBe(
      "user · 1 session",
    );
    harness.dispose();
  });

  it("switches the focused session, shows a mid-turn refusal as the server says, and releases", async () => {
    const calls: string[] = [];
    let busy = true;
    const harness = overviewShell({
      currentSession: "s1",
      client: {
        bindSessionBot: async (id, name) => {
          calls.push(`${id}:${name}`);
          return busy
            ? { refused: "busy", detail: "a turn is running" }
            : name === null
              ? {}
              : { bot: name };
        },
      },
    });
    await harness.surfaces.load();
    const { container, act } = mountPane(botsPane.component, { kind: "bots" }, harness.shell);
    act("bots.switch");
    await settle();
    expect(container.textContent).toContain("a turn is running");
    busy = false;
    act("bots.down");
    act("bots.switch");
    await settle();
    expect(container.textContent).toContain("session runs as scribe");
    act("bots.release");
    await settle();
    expect(calls).toEqual(["s1:reviewer", "s1:scribe", "s1:null"]);
    harness.dispose();
  });

  it("defines a bot from an inline slug and a scope keystroke", async () => {
    const drafts: string[] = [];
    const harness = overviewShell({
      empty: true,
      client: {
        createBot: async (draft) => {
          drafts.push(`${draft.slug}:${draft.scope}`);
          return { name: draft.slug, sigil: "◇", source: draft.scope };
        },
      },
    });
    await harness.surfaces.load();
    const { container, act } = mountPane(botsPane.component, { kind: "bots" }, harness.shell);
    expect(container.querySelector(".kw-empty")?.textContent).toContain("bots.new defines one");
    act("bots.new");
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "scout" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    fireEvent.keyDown(container.querySelector("[data-tone='ask']") as HTMLElement, { key: "p" });
    await settle();
    expect(drafts).toEqual(["scout:project"]);
    expect(container.textContent).toContain("◇ scout defined");
    harness.dispose();
  });
});

describe("the bots pane's working session", () => {
  it("switches the conversation that last held focus, and says so when there has been none", async () => {
    const calls: string[] = [];
    const harness = overviewShell({
      client: {
        bindSessionBot: async (id, name) => {
          calls.push(`${id}:${name}`);
          return name === null ? {} : { bot: name };
        },
      },
    });
    await harness.surfaces.load();
    const [focused, setFocused] = createSignal<string | undefined>();
    const shell = { ...harness.shell, currentSession: focused };
    const { container, act } = mountPane(botsPane.component, { kind: "bots" }, shell);
    act("bots.switch");
    await settle();
    expect(calls).toEqual([]);
    expect(container.textContent).toContain(noWorkingSession);
    setFocused("s2");
    setFocused(undefined);
    act("bots.switch");
    await settle();
    expect(calls).toEqual(["s2:reviewer"]);
    harness.dispose();
  });
});
