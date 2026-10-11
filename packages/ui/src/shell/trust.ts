import type { KeyworkClient, ServerFeed } from "@keywork-app/client";
import type { BusEnvelope, WorkspaceView } from "@keywork-app/protocol";
import { createSignal } from "solid-js";

export type TrustState =
  | { kind: "unknown" }
  | { kind: "trusted"; root: string }
  | { kind: "undecided"; root: string }
  | { kind: "refused"; root: string; message: string }
  | { kind: "restarting"; root: string }
  | { kind: "failed"; root: string; message: string };

export interface TrustFlow {
  state(): TrustState;
  workspace(): WorkspaceView | undefined;
  untrusted(): boolean;
  refresh(): Promise<void>;
  accept(): Promise<void>;
  dispose(): void;
}

export interface TrustSeams {
  client: Pick<KeyworkClient, "workspace" | "trustWorkspace">;
  feed: Pick<ServerFeed, "subscribe">;
  restart(): Promise<void>;
}

export const trustEnables = "memory, changes, the terminal, LSP and project config";

export function trustPrompt(root: string): string {
  return `trust ${root}? keywork keeps workspace files and memory in .keywork`;
}

export const trustStaysOff = `${trustEnables} stay off until you trust it`;

export function untrustedNotice(root: string, chord: string): string {
  return `${root} isn't trusted yet · ${trustEnables} stay off until it is · ${chord} trusts it`;
}

export function reopeningNotice(root: string): string {
  return `workspace ready at ${root} · reopening with memory and arcs live`;
}

export function readyNotice(root: string): string {
  return `workspace ready at ${root} · memory and arcs are live`;
}

export function trustStateOf(view: WorkspaceView): TrustState {
  const root = view.anchor.root;
  switch (view.trust) {
    case "trusted":
      return { kind: "trusted", root };
    case "undecided":
      return { kind: "undecided", root };
    case "untrusted":
      return { kind: "refused", root, message: `${root} is marked untrusted` };
  }
}

export function createTrustFlow(seams: TrustSeams): TrustFlow {
  const [state, setState] = createSignal<TrustState>({ kind: "unknown" });
  const [view, setView] = createSignal<WorkspaceView>();

  const refresh = async (): Promise<void> => {
    const fetched = await seams.client.workspace().catch(() => undefined);
    if (fetched === undefined) return;
    setView(fetched);
    setState(trustStateOf(fetched));
  };

  const accept = async (): Promise<void> => {
    const current = state();
    if (current.kind !== "undecided" && current.kind !== "failed") return;
    const root = current.root;
    const outcome = await seams.client.trustWorkspace();
    if ("refused" in outcome) {
      setState(
        outcome.refused === "untrusted"
          ? { kind: "refused", root, message: outcome.message }
          : { kind: "failed", root, message: outcome.message },
      );
      return;
    }
    if (!outcome.reopens) {
      await refresh();
      return;
    }
    setState({ kind: "restarting", root: outcome.root });
    await seams.restart();
    await refresh();
  };

  const stop = seams.feed.subscribe((envelopes) => {
    if (envelopes.some(changesWorkspace)) void refresh();
  });
  void refresh();

  return {
    state,
    workspace: view,
    untrusted: () => isUntrusted(state()),
    refresh,
    accept,
    dispose: stop,
  };
}

export function isUntrusted(state: TrustState): boolean {
  return state.kind === "undecided" || state.kind === "refused" || state.kind === "failed";
}

function changesWorkspace(envelope: BusEnvelope): boolean {
  return envelope.type === "surface.changed" && envelope.payload.kind === "workspace";
}
