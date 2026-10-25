import { Match, Show, Switch } from "solid-js";
import {
  reopeningNotice,
  staleServeNotice,
  type TrustFlow,
  type TrustState,
  trustPrompt,
  trustStaysOff,
  waitingOnServeNotice,
} from "./trust.ts";
import "./trust.css";

export interface TrustCardProps {
  trust: TrustFlow;
  chord: string;
}

export function TrustCard(props: TrustCardProps) {
  const state = () => props.trust.state();
  return (
    <Show when={state().kind !== "unknown" && state().kind !== "trusted"}>
      <aside class="kw-trust" data-state={state().kind} aria-label="trust">
        <Switch>
          <Match when={state().kind === "undecided" || state().kind === "failed"}>
            <p class="kw-trust-ask">{trustPrompt(rootOf(state()))}</p>
            <p class="kw-trust-enables">{trustStaysOff}</p>
            <Show when={messageOf(state())}>
              {(message) => <p class="kw-trust-refusal">{message()}</p>}
            </Show>
            <p class="kw-trust-keys">
              <button
                type="button"
                class="kw-trust-accept"
                onClick={() => void props.trust.accept()}
              >
                trust this workspace
              </button>
              <kbd>{props.chord}</kbd>
            </p>
          </Match>
          <Match when={state().kind === "refused"}>
            <p class="kw-trust-refusal">{messageOf(state())}</p>
          </Match>
          <Match when={state().kind === "restarting"}>
            <p class="kw-trust-restarting">{restartingLine(state())}</p>
          </Match>
          <Match when={state().kind === "stale"}>
            <p class="kw-trust-restarting">{staleServeNotice(rootOf(state()))}</p>
            <p class="kw-trust-keys">
              <button
                type="button"
                class="kw-trust-accept"
                onClick={() => void props.trust.accept()}
              >
                check again
              </button>
              <kbd>{props.chord}</kbd>
            </p>
          </Match>
        </Switch>
      </aside>
    </Show>
  );
}

function restartingLine(state: TrustState): string {
  const root = rootOf(state);
  return state.kind === "restarting" && state.attached === true
    ? waitingOnServeNotice(root)
    : reopeningNotice(root);
}

function rootOf(state: TrustState): string {
  return "root" in state ? state.root : "";
}

function messageOf(state: TrustState): string | undefined {
  return "message" in state ? state.message : undefined;
}
