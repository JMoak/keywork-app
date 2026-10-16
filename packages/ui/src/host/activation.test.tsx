import type { KeyworkClient } from "@keywork-app/client";
import type { BusEnvelope, SessionSummary } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../app.tsx";
import { inertMemoryClient } from "../shell/memory-store.test.ts";
import { emptySurfacesClient } from "../shell/surfaces-store.test.ts";
import { inertWorkspaceClient } from "../shell/trust.test.ts";
import { followActivations } from "./activation.ts";
import { browserHost } from "./browser.ts";
import type { HostPort, NeedsYouTrigger } from "./port.ts";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("followActivations", () => {
  it("shows only the activations for its own workspace", () => {
    const shown: NeedsYouTrigger[] = [];
    let activate: (trigger: NeedsYouTrigger) => void = () => undefined;
    const stop = followActivations(
      {
        onNotificationActivated: (listener) => {
          activate = listener;
          return () => undefined;
        },
      },
      { workspace: "/work", show: (trigger) => void shown.push(trigger) },
    );
    activate({ ...askFrom("s9"), workspace: "/elsewhere" });
    activate(askFrom("s9"));
    activate({ kind: "memory-inbox", workspace: "/work", pending: 3 });
    expect(shown).toEqual([
      askFrom("s9"),
      { kind: "memory-inbox", workspace: "/work", pending: 3 },
    ]);
    stop();
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

  it("treats a toast click as a needs-you jump that leader shift+n walks back", async () => {
    const harness = await openApp();
    await screen.findByText("session 1", { selector: ".kw-frame-name" });
    harness.activate(askFrom("s2"));
    await waitFor(() => expect(focusedName()).toBe("session 2"));
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "N", shiftKey: true });
    await waitFor(() => expect(focusedName()).toBe("session 1"));
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

function askFrom(sessionId: string): NeedsYouTrigger {
  return { kind: "ask", workspace: "/work", sessionId, callId: `call-${sessionId}` };
}

function closeFocused(): void {
  fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
  fireEvent.keyDown(document.body, { key: "x" });
}

const frameCount = () => document.querySelectorAll(".kw-frame").length;
const focusedName = () =>
  document.querySelector(".kw-frame[data-focused] .kw-frame-name")?.textContent ?? undefined;
