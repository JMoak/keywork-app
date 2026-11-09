import { keyworkProfile, type ProductProfile } from "@keywork-app/product";
import { Show } from "solid-js";
import { describeFailure, type WorkspaceFailure } from "../host/port.ts";
import "./open-failure.css";

export interface OpenFailureView {
  readonly path: string;
  readonly line: string;
  readonly fix?: string | undefined;
  readonly connectsAModel: boolean;
}

export interface OpenFailureNotice {
  readonly view: OpenFailureView;
  readonly enableRuntime?: (() => void) | undefined;
  retry(): void;
  dismiss(): void;
}

export const connectingPane = { kind: "terminal", mode: "bridge", verb: "connect" } as const;

export const connectFix =
  "connect a model with `keywork connect` in a terminal pane, then open it again";

export function openFailureView(
  path: string,
  failure: WorkspaceFailure,
  profile: ProductProfile = keyworkProfile,
): OpenFailureView {
  if (profile.id !== "stead") return plainOpenFailure(path, describeFailure(failure));
  return { path, ...inSteadWords(failure) };
}

export function plainOpenFailure(path: string, line: string): OpenFailureView {
  return { path, line, connectsAModel: false };
}

export function notOpenedLine(path: string): string {
  return `${folderName(path)} did not open`;
}

export function OpenFailure(props: {
  view: OpenFailureView;
  onEnableRuntime?: (() => void) | undefined;
}) {
  return (
    <>
      <p class="kw-open-failure" role="status">
        {props.view.line}
      </p>
      <Show when={props.view.fix}>{(fix) => <p class="kw-open-fix">{fix()}</p>}</Show>
      <Show when={props.onEnableRuntime}>
        {(enable) => (
          <button class="kw-open-pick" type="button" onClick={() => enable()()}>
            Enable background work
          </button>
        )}
      </Show>
    </>
  );
}

export function OpenFailureCard(props: {
  notice: OpenFailureNotice | undefined;
  onConnect: () => void;
}) {
  return (
    <Show when={props.notice}>
      {(notice) => (
        <aside
          class="kw-open-failure-card"
          aria-label={notOpenedLine(notice().view.path)}
          data-native-activation
        >
          <p class="kw-open-failure-of">{notOpenedLine(notice().view.path)}</p>
          <OpenFailure view={notice().view} onEnableRuntime={notice().enableRuntime} />
          <p class="kw-open-failure-keys">
            <Show when={notice().view.connectsAModel}>
              <button type="button" class="kw-open-failure-act" onClick={() => props.onConnect()}>
                connect a model
              </button>
            </Show>
            <button type="button" class="kw-open-failure-act" onClick={() => notice().retry()}>
              open it again
            </button>
            <button type="button" class="kw-open-failure-act" onClick={() => notice().dismiss()}>
              dismiss
            </button>
          </p>
        </aside>
      )}
    </Show>
  );
}

const engineReasonsInSteadWords: ReadonlyMap<string, string> = new Map([
  ["no inference provider is configured", "no model is connected"],
]);

function inSteadWords(failure: WorkspaceFailure): Omit<OpenFailureView, "path"> {
  if (failure.kind !== "unresolved") {
    return { line: describeFailure(failure), connectsAModel: false };
  }
  if (connectingFixes(failure.nextAction)) {
    const line = engineReasonsInSteadWords.get(failure.message) ?? failure.message;
    return { line, fix: connectFix, connectsAModel: true };
  }
  const fix = failure.nextAction === "" ? undefined : `${failure.nextAction}, then open it again`;
  return { line: failure.message, fix, connectsAModel: false };
}

function connectingFixes(nextAction: string): boolean {
  return /\bkeywork connect\b/.test(nextAction);
}

function folderName(path: string): string {
  return path.split(/[\\/]/).findLast((segment) => segment !== "") ?? path;
}
