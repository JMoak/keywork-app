import { keyworkProfile, type ProductProfile } from "@keywork-app/product";
import { Show } from "solid-js";
import { describeFailure, type WorkspaceFailure } from "../host/port.ts";
import "./open-failure.css";

export interface OpenFailureView {
  readonly path: string;
  readonly line: string;
  readonly fix?: string | undefined;
  readonly connectsAModel: boolean;
  readonly enablesBackgroundWork: boolean;
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

export const setUpModelWord = "Set up a model";

export function setUpThenOpensLine(path: string): string {
  return `set up a model here and ${folderName(path)} opens right after`;
}

export function openFailureView(
  path: string,
  failure: WorkspaceFailure,
  profile: ProductProfile = keyworkProfile,
): OpenFailureView {
  const enablesBackgroundWork = backgroundWorkFixes(failure);
  if (failure.kind === "unresolved" && connectingFixes(failure.nextAction)) {
    const line = engineReasonsInPlainWords.get(failure.message) ?? failure.message;
    return { path, line, fix: connectFix, connectsAModel: true, enablesBackgroundWork };
  }
  if (profile.id === "stead") return { path, ...nextStepOf(failure), enablesBackgroundWork };
  return { path, line: describeFailure(failure), connectsAModel: false, enablesBackgroundWork };
}

export function plainOpenFailure(path: string, line: string): OpenFailureView {
  return { path, line, connectsAModel: false, enablesBackgroundWork: false };
}

export function notOpenedLine(path: string): string {
  return `${folderName(path)} did not open`;
}

export function OpenFailure(props: {
  view: OpenFailureView;
  onEnableRuntime?: (() => void) | undefined;
  onSetUpModel?: (() => void) | undefined;
}) {
  const setUp = () => (props.view.connectsAModel ? props.onSetUpModel : undefined);
  const enable = () => (props.view.enablesBackgroundWork ? props.onEnableRuntime : undefined);
  return (
    <>
      <p class="kw-open-failure" role="status">
        {props.view.line}
      </p>
      <Show
        when={setUp()}
        fallback={<Show when={props.view.fix}>{(fix) => <p class="kw-open-fix">{fix()}</p>}</Show>}
      >
        {(begin) => (
          <>
            <p class="kw-open-fix">{setUpThenOpensLine(props.view.path)}</p>
            <button class="kw-open-pick" type="button" onClick={() => begin()()}>
              {setUpModelWord}
            </button>
          </>
        )}
      </Show>
      <Show when={enable()}>
        {(start) => (
          <button class="kw-open-pick" type="button" onClick={() => start()()}>
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

const engineReasonsInPlainWords: ReadonlyMap<string, string> = new Map([
  ["no inference provider is configured", "no model is connected"],
]);

function nextStepOf(
  failure: WorkspaceFailure,
): Pick<OpenFailureView, "line" | "fix" | "connectsAModel"> {
  if (failure.kind !== "unresolved") {
    return { line: describeFailure(failure), connectsAModel: false };
  }
  const fix = failure.nextAction === "" ? undefined : `${failure.nextAction}, then open it again`;
  return { line: failure.message, fix, connectsAModel: false };
}

function connectingFixes(nextAction: string): boolean {
  return /\bkeywork connect\b/.test(nextAction);
}

function backgroundWorkFixes(failure: WorkspaceFailure): boolean {
  return failure.kind === "unresolved" && /\benable background work\b/i.test(failure.nextAction);
}

function folderName(path: string): string {
  return path.split(/[\\/]/).findLast((segment) => segment !== "") ?? path;
}
