import type { KeyworkClient } from "@keywork-app/client";
import type { BusEnvelope, SessionSummary } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../app.tsx";
import type { PaneSpec } from "../panes/index.ts";
import { inertMemoryClient } from "../shell/memory-store.test.ts";
import { emptySurfacesClient } from "../shell/surfaces-store.test.ts";
import { createTiler, type Tiler } from "../shell/tiler.ts";
import { inertWorkspaceClient } from "../shell/trust.test.ts";
import { type ActivationSeams, followActivations, showWhatNeedsYou } from "./activation.ts";
import { browserHost } from "./browser.ts";
import type { HostPort, NeedsYouTrigger } from "./port.ts";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const screenSize = { width: 1600, height: 1000 };

describe("showWhatNeedsYou", () => {
  it("focuses the pane already showing the asking session", () => {
    withTiler((tiler, seams) => {
      tiler.open(conversation("s1"), screenSize);
      tiler.open(conversation("s2"), screenSize);
      showWhatNeedsYou(askFrom("s1"), seams);
      expect(tiler.focusedSpec()).toEqual(conversation("s1"));
      expect(seams.opened).toEqual([]);
    });
  });

  it("opens the asking session when no pane shows it, and summons memory for the inbox", () => {
    withTiler((tiler, seams) => {
      tiler.open(conversation("s1"), screenSize);
      showWhatNeedsYou(askFrom("s7"), seams);
      showWhatNeedsYou({ kind: "memory-inbox", workspace: "/work", pending: 3 }, seams);
      expect(seams.opened).toEqual(["s7"]);
      expect(seams.memorySummons).toBe(1);
    });
  });

  it("follows only activations for its own workspace", () => {
    withTiler((tiler, seams) => {
      let activate: (trigger: NeedsYouTrigger) => void = () => undefined;
      const stop = followActivations(
        {
          onNotificationActivated: (listener) => {
            activate = listener;
            return () => undefined;
          },
        },
        seams,
      );
      tiler.open(conversation("s1"), screenSize);
      activate({ ...askFrom("s9"), workspace: "/elsewhere" });
      activate(askFrom("s9"));
      expect(seams.opened).toEqual(["s9"]);
      stop();
    });
  });
});

describe("activation in the running app", () => {
  it("focuses the asking session's pane when its toast is clicked, opening one only when needed", async () => {
    const harness = await openApp();
    await screen.findByText("session 1", { selector: ".kw-frame-name" });
    expect(focusedName()).toBe("session 1");

    harness.activate(askFrom("s2"));
    await waitFor(() => expect(focusedName()).toBe("session 2"));
    const frames = frameCount();

    fireEvent.keyDown(document.body, { key: "2", altKey: true });
    expect(focusedName()).toBe("session 1");
    harness.activate(askFrom("s2"));
    await waitFor(() => expect(focusedName()).toBe("session 2"));
    expect(frameCount()).toBe(frames);
  });

  it("says so in the status line when there is no pane to close", async () => {
    await openApp();
    await screen.findByText("session 1", { selector: ".kw-frame-name" });
    while (frameCount() > 0) closeFocused();
    closeFocused();
    await screen.findByText("no pane is focused · nothing to close", {
      selector: ".kw-status-notice",
    });
  });
});

interface Harness {
  activate(trigger: NeedsYouTrigger): void;
}

async function openApp(): Promise<Harness> {
  const listeners = new Set<(trigger: NeedsYouTrigger) => void>();
  const host: HostPort = {
    ...browserHost({ server: { url: "http://127.0.0.1:4770", token: "t" } }),
    onNotificationActivated: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  render(() => <App host={host} connect={quietClient} />);
  const input = await screen.findByLabelText("workspace");
  fireEvent.input(input, { target: { value: "/work" } });
  fireEvent.submit(input.closest("form") as HTMLFormElement);
  return {
    activate: (trigger) => {
      for (const listener of listeners) listener(trigger);
    },
  };
}

function quietClient(): KeyworkClient {
  const summaries = [summary("s1", "session 1"), summary("s2", "session 2")];
  const known: Partial<KeyworkClient> = {
    url: "http://127.0.0.1:4770",
    sessions: async () => summaries,
    session: async () => undefined,
    asks: async () => [],
    events: async function* (): AsyncIterable<BusEnvelope> {
      await new Promise(() => undefined);
    },
    entries: async () => undefined,
    changes: async () => "missing",
    ...inertMemoryClient(),
    ...emptySurfacesClient(),
    ...inertWorkspaceClient(),
  };
  return new Proxy(known, {
    get: (target, name) => Reflect.get(target, name) ?? (async () => undefined),
  }) as KeyworkClient;
}

function summary(id: string, title: string): SessionSummary {
  return {
    id,
    title,
    createdAt: "2026-10-10T00:00:00.000Z",
    lastActivityAt: "2026-10-10T00:00:00.000Z",
    messageCount: 0,
  };
}

function withTiler(
  body: (
    tiler: Tiler,
    seams: ActivationSeams & { opened: string[]; memorySummons: number },
  ) => void,
): void {
  createRoot((dispose) => {
    const tiler = createTiler();
    const seams = {
      workspace: "/work",
      opened: [] as string[],
      memorySummons: 0,
      findPane: tiler.findPane,
      focusPane: (id: string) => void tiler.focus(id),
      openSession: (sessionId: string) => void seams.opened.push(sessionId),
      summonMemory: () => {
        seams.memorySummons += 1;
      },
    };
    body(tiler, seams);
    dispose();
  });
}

function askFrom(sessionId: string): NeedsYouTrigger {
  return { kind: "ask", workspace: "/work", sessionId, callId: `call-${sessionId}` };
}

function conversation(sessionId: string): PaneSpec {
  return { kind: "conversation", sessionId };
}

function closeFocused(): void {
  fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
  fireEvent.keyDown(document.body, { key: "x" });
}

const frameCount = () => document.querySelectorAll(".kw-frame").length;
const focusedName = () =>
  document.querySelector(".kw-frame[data-focused] .kw-frame-name")?.textContent ?? undefined;
