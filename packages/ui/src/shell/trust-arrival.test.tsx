import type { KeyworkClient } from "@keywork-app/client";
import type { BusEnvelope, PermissionRule, WorkspaceView } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../app.tsx";
import { browserHost } from "../host/browser.ts";
import { postureStorageKey } from "../posture/record.ts";
import { idleControlsClient } from "./controls-store.test.ts";
import { inertMemoryClient } from "./memory-store.test.ts";
import { emptySurfacesClient } from "./surfaces-store.test.ts";
import { inertWorkspaceClient, undecidedWorkspace } from "./trust.test.ts";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

interface Served {
  readonly client: KeyworkClient;
  readonly answers: string[];
  readonly writes: string[];
}

function servedWorkspace(options: { trusted: boolean; mcp: string[] }): Served {
  let trusted = options.trusted;
  const answers: string[] = [];
  const writes: string[] = [];
  const view = (): WorkspaceView => ({
    ...undecidedWorkspace,
    trust: trusted ? "trusted" : "undecided",
    readiness: trusted ? "undeclared" : "undecided",
  });
  const bundle: PermissionRule[] = [{ action: "bash", resource: "git status*", effect: "allow" }];
  const packageJson = JSON.stringify({ scripts: { test: "vitest run" } });
  const client: KeyworkClient = {
    url: "http://127.0.0.1:4770",
    document: async () => ({ version: "0.2.0", operationIds: [] }),
    sessions: async () => [],
    session: async () => undefined,
    createSession: async () => {
      throw new Error("no sessions here");
    },
    prompt: async () => "missing",
    abort: async () => "idle",
    events: async function* (): AsyncIterable<BusEnvelope> {
      await new Promise(() => undefined);
    },
    inject: async () => "started",
    entries: async () => undefined,
    fork: async () => "missing",
    labelEntry: async () => "missing",
    moveLeaf: async () => "missing",
    changes: async () => "missing",
    ...inertMemoryClient(),
    ...idleControlsClient(),
    ...emptySurfacesClient(),
    ...inertWorkspaceClient(),
    workspace: async () => view(),
    trustWorkspace: async () => {
      trusted = true;
      writes.push("trust");
      return { trusted: true, root: "C:/work", vault: "C:/work/.keywork/memory", reopens: false };
    },
    tree: async (path) => ({
      path,
      entries: ["bun.lock", "package.json"].map((name) => ({
        name,
        kind: "file" as const,
        ignored: false,
        hidden: false,
      })),
    }),
    file: async (path) => ({
      path,
      bytes: packageJson.length,
      from: 0,
      to: packageJson.length,
      text: packageJson,
      truncated: false,
      encoding: "utf-8",
    }),
    mcpServers: async () =>
      options.mcp.map((name) => ({ name, state: "connected", enabled: true, toolCount: 3 })),
    changedFile: async () => "missing",
    removeSession: async () => "missing",
    listTrash: async () => [],
    restoreSession: async () => "missing",
    discardTrashedSession: async () => "missing",
    purgeTrash: async () => ({ purged: 0 }),
    asks: async () => [],
    answerAsk: async (callId, verdict, scope) => {
      answers.push([callId, verdict, scope].join(":"));
      return "settled" as const;
    },
    permissions: async () => ({
      trusted,
      bundle: trusted ? bundle : [],
      workspace: [],
      session: {},
    }),
    grantWorkspaceRule: async (rule) => {
      writes.push("grant");
      return { granted: rule };
    },
    grantSessionRule: async (_sessionId, rule) => {
      writes.push("grant");
      return { granted: rule };
    },
    revokeWorkspaceGrant: async (rule) => {
      writes.push("revoke");
      return { revoked: rule };
    },
    revokeSessionGrant: async (_sessionId, rule) => {
      writes.push("revoke");
      return { revoked: rule };
    },
    restoreTurn: async () => "missing",
  };
  return { client, answers, writes };
}

function press(key: string, modifiers: Partial<KeyboardEventInit> = {}): void {
  fireEvent.keyDown(document.body, { key, bubbles: true, ...modifiers });
}

function pressLeader(key: string, modifiers: Partial<KeyboardEventInit> = {}): void {
  press("k", { ctrlKey: true });
  press(key, modifiers);
}

async function open(served: Served): Promise<void> {
  render(() => (
    <App
      host={browserHost({ server: { url: "http://127.0.0.1:4770", token: "t" } })}
      connect={() => served.client}
    />
  ));
  const input = await screen.findByLabelText("workspace");
  fireEvent.input(input, { target: { value: "C:/work" } });
  fireEvent.submit(input.closest("form") as HTMLFormElement);
  await screen.findByText("sessions", { selector: ".kw-frame-name" });
}

const focusedName = () =>
  document.querySelector(".kw-frame[data-focused] .kw-frame-name")?.textContent ?? undefined;

const statusNotice = () => document.querySelector(".kw-status-notice")?.textContent ?? undefined;

const proposedRules = () =>
  [...document.querySelectorAll(".kw-setup-offers .kw-ov-name")].map((name) => name.textContent);

function settleBefore(mcp: string[]): void {
  localStorage.setItem(
    postureStorageKey("C:/work"),
    JSON.stringify({
      version: 1,
      settled: { version: "0.2.0", manifests: ["bun.lock", "package.json"], mcp, bots: [] },
      accepted: [],
    }),
  );
}

describe("trust setup arriving with trust", () => {
  it("opens the guided setup the moment the workspace is trusted, and records only what is accepted", async () => {
    const served = servedWorkspace({ trusted: false, mcp: [] });
    await open(served);
    pressLeader("u");
    await waitFor(() => expect(focusedName()).toBe("trust setup"));
    await waitFor(() => expect(proposedRules()).toEqual(["bun install *", "bun run *"]));
    expect(served.writes).toEqual(["trust"]);
    press("a");
    await waitFor(() =>
      expect(document.querySelector(".kw-setup .kw-ov-line")?.textContent).toBe(
        "settled · 2 accepted · 0 declined · keywork holds every accepted rule",
      ),
    );
    expect(served.answers).toEqual([]);
    expect(served.writes).toEqual(["trust", "grant", "grant"]);
  });

  it("says once what changed since the last setup on a later launch, then stays quiet", async () => {
    settleBefore([]);
    const served = servedWorkspace({ trusted: true, mcp: ["playwright"] });
    await open(served);
    await waitFor(() =>
      expect(statusNotice()).toBe("new mcp server: playwright · trust-setup proposes 1 rule"),
    );
    expect(focusedName()).not.toBe("trust setup");
    cleanup();
    await open(servedWorkspace({ trusted: true, mcp: ["playwright"] }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(statusNotice()).toBeUndefined();
  });

  it("opens on its chord scoped to the difference alone", async () => {
    settleBefore([]);
    await open(servedWorkspace({ trusted: true, mcp: ["playwright"] }));
    pressLeader("U", { shiftKey: true });
    await waitFor(() => expect(focusedName()).toBe("trust setup"));
    await waitFor(() => expect(proposedRules()).toEqual(["mcp playwright__*"]));
  });

  it("shows nothing at all on a launch whose facts match the settled posture", async () => {
    settleBefore(["playwright"]);
    await open(servedWorkspace({ trusted: true, mcp: ["playwright"] }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(statusNotice()).toBeUndefined();
    expect(document.querySelector(".kw-setup")).toBeNull();
  });
});
