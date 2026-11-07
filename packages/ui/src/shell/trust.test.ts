import type { ConsoleClient, KeyworkClient, ServerFeed } from "@keywork-app/client";
import type { BusEnvelope, TrustOutcome, WorkspaceView } from "@keywork-app/protocol";
import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import type { ShellSeams } from "../panes/registry.ts";
import {
  anchorNotice,
  createTrustFlow,
  isUntrusted,
  type TrustFlow,
  type TrustState,
  trustPrompt,
  trustStateOf,
  untrustedNotice,
} from "./trust.ts";

export type WorkspaceClient = Pick<KeyworkClient, "workspace" | "tree" | "file" | "trustWorkspace">;

export const undecidedWorkspace: WorkspaceView = {
  anchor: { root: "C:/work", source: "git" },
  identity: "abc123",
  declared: false,
  contextDirs: [],
  missingContextDirs: [],
  focusDirs: [],
  trust: "undecided",
  readiness: "undecided",
};

export function inertWorkspaceClient(overrides: Partial<WorkspaceClient> = {}): WorkspaceClient {
  return {
    workspace: async () => undecidedWorkspace,
    tree: async () => ({ path: "", entries: [] }),
    file: async () => "missing",
    trustWorkspace: async () => ({
      trusted: true,
      root: "C:/work",
      vault: "C:/work/.keywork/memory",
      reopens: false,
    }),
    ...overrides,
  };
}

export function inertShellExtras(
  overrides: Partial<Pick<ShellSeams, "client" | "feed" | "trust" | "openPane">> = {},
): Pick<ShellSeams, "client" | "feed" | "trust" | "openPane"> {
  return {
    client: inertWorkspaceClient() as unknown as ConsoleClient,
    feed: inertFeed(),
    trust: inertTrust(),
    openPane: () => undefined,
    ...overrides,
  };
}

export function inertFeed(): ServerFeed {
  return {
    open: async () => undefined,
    subscribe: () => () => undefined,
    subscribeSession: () => () => undefined,
    onNotice: () => () => undefined,
    whenLost: () => () => undefined,
    close: () => undefined,
  };
}

export function inertTrust(state: TrustState = { kind: "trusted", root: "C:/work" }): TrustFlow {
  return {
    state: () => state,
    workspace: () => undefined,
    untrusted: () => isUntrusted(state),
    refresh: async () => undefined,
    accept: async () => undefined,
    dispose: () => undefined,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

interface Harness {
  answers: TrustOutcome[];
  views: WorkspaceView[];
  restarts: number;
  push: (envelope: BusEnvelope) => void;
  flow: ReturnType<typeof createTrustFlow>;
  dispose: () => void;
}

function harness(first: WorkspaceView, ...answers: TrustOutcome[]): Harness {
  const views = [first];
  const listeners: Array<(envelopes: readonly BusEnvelope[]) => void> = [];
  const state: Harness = {
    answers,
    views,
    restarts: 0,
    push: (envelope) => {
      for (const listener of listeners) listener([envelope]);
    },
    flow: undefined as unknown as Harness["flow"],
    dispose: () => undefined,
  };
  createRoot((dispose) => {
    state.dispose = dispose;
    state.flow = createTrustFlow({
      client: {
        workspace: async () => views.at(-1) as WorkspaceView,
        trustWorkspace: async () => {
          const answer = answers.shift();
          if (answer === undefined) throw new Error("no answer scripted");
          return answer;
        },
      },
      feed: {
        subscribe: (listener) => {
          listeners.push(listener);
          return () => undefined;
        },
      },
      restart: async () => {
        state.restarts += 1;
        views.push({ ...first, trust: "trusted", readiness: "undeclared" });
      },
    });
  });
  return state;
}

describe("the anchor line", () => {
  const flowSaying = (
    folder: string,
    view: WorkspaceView,
  ): { said: string[]; dispose: () => void } => {
    const said: string[] = [];
    let dispose = (): void => undefined;
    createRoot((stop) => {
      dispose = stop;
      createTrustFlow({
        client: {
          workspace: async () => view,
          trustWorkspace: async () => {
            throw new Error("not asked");
          },
        },
        feed: { subscribe: () => () => undefined },
        restart: async () => undefined,
        folder,
        say: (line) => said.push(line),
      });
    });
    return { said, dispose };
  };

  it("names the repository root a folder inside it opens, once", async () => {
    const h = flowSaying("C:/work/scratch/run-3", undecidedWorkspace);
    await settle();
    expect(h.said).toEqual([
      "C:/work/scratch/run-3 opens the workspace at C:/work (its git root) · its sessions and chores are that workspace's",
    ]);
    expect(anchorNotice("C:/work/scratch", { root: "C:/work", source: "declaration" })).toBe(
      "C:/work/scratch opens the workspace at C:/work (its declared workspace root) · its sessions and chores are that workspace's",
    );
    h.dispose();
  });

  it("says nothing when the folder is the root, however spelled, or the root is the launch folder", async () => {
    const atRoot = flowSaying("c:\\Work\\", undecidedWorkspace);
    const launched = flowSaying("C:/work/scratch", {
      ...undecidedWorkspace,
      anchor: { root: "C:/work", source: "launch" },
    });
    await settle();
    expect(atRoot.said).toEqual([]);
    expect(launched.said).toEqual([]);
    atRoot.dispose();
    launched.dispose();
  });
});

describe("the trust flow", () => {
  it("reads the workspace once and reports an undecided root as untrusted", async () => {
    const h = harness(undecidedWorkspace);
    expect(h.flow.state()).toEqual({ kind: "unknown" });
    await settle();
    expect(h.flow.state()).toEqual({ kind: "undecided", root: "C:/work" });
    expect(h.flow.untrusted()).toBe(true);
    expect(h.flow.workspace()?.identity).toBe("abc123");
    h.dispose();
  });

  it("accepts, restarts the sidecar when the server asks to reopen, and re-reads trust", async () => {
    const h = harness(undecidedWorkspace, {
      trusted: true,
      root: "C:/work",
      vault: "C:/work/.keywork/memory",
      reopens: true,
    });
    await settle();
    const accepted = h.flow.accept();
    await settle();
    expect(h.restarts).toBe(1);
    await accepted;
    expect(h.flow.state()).toEqual({ kind: "trusted", root: "C:/work" });
    expect(h.flow.untrusted()).toBe(false);
    h.dispose();
  });

  it("skips the restart when trust was already on record", async () => {
    const h = harness(
      { ...undecidedWorkspace, trust: "trusted" },
      { trusted: true, root: "C:/work", vault: "C:/work/.keywork/memory", reopens: false },
    );
    await settle();
    expect(h.flow.state().kind).toBe("trusted");
    await h.flow.accept();
    expect(h.restarts).toBe(0);
    h.dispose();
  });

  it("keeps the server's refusal verbatim for an untrusted root and a home directory", async () => {
    const refused = harness(undecidedWorkspace, {
      refused: "untrusted",
      message: "C:/work is marked untrusted, so keywork won't write a workspace there",
    });
    await settle();
    await refused.flow.accept();
    expect(refused.flow.state()).toEqual({
      kind: "refused",
      root: "C:/work",
      message: "C:/work is marked untrusted, so keywork won't write a workspace there",
    });
    expect(refused.restarts).toBe(0);
    refused.dispose();

    const home = harness(undecidedWorkspace, {
      refused: "home",
      message: "refusing to trust C:/Users/me: that is your home directory",
    });
    await settle();
    await home.flow.accept();
    expect(home.flow.state()).toMatchObject({ kind: "failed", message: /home directory/ });
    expect(isUntrusted(home.flow.state())).toBe(true);
    home.dispose();
  });

  it("re-reads the workspace when the bus says the workspace surface changed", async () => {
    const h = harness(undecidedWorkspace);
    await settle();
    h.views.push({ ...undecidedWorkspace, trust: "trusted" });
    h.push({
      id: 7,
      ts: "t",
      sessionId: "",
      type: "surface.changed",
      payload: { kind: "workspaces" },
    });
    await settle();
    expect(h.flow.state().kind).toBe("trusted");
    h.dispose();
  });

  it("speaks in the product's words: the server, never the engine's name", () => {
    expect(trustPrompt("C:/work")).toBe(
      "trust C:/work? the server keeps workspace files and memory in .keywork",
    );
    expect(untrustedNotice("C:/work", "ctrl+k u")).toContain("ctrl+k u trusts it");
    expect(trustStateOf({ ...undecidedWorkspace, trust: "untrusted" })).toMatchObject({
      kind: "refused",
    });
  });
});
