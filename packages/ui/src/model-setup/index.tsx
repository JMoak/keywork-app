import { keyworkClientOver, ServerRefusal } from "@keywork-app/client";
import { isServedRefusal } from "@keywork-app/protocol";
import {
  createResource,
  createSignal,
  createUniqueId,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import type { HostPort } from "../host/port.ts";
import { hostFetch } from "../host/transport.ts";
import type { PtyEvent } from "../panes/terminal/session.ts";
import {
  type ModelGroup,
  type ModelInventory,
  type ModelSetupScope,
  modelDestination,
  modelGroups,
  type ProjectCheck,
  type SelectedModel,
  sameModel,
  selectedForSetup,
  setupInventory,
} from "./inventory.ts";
import { ModelSetupTerminal } from "./terminal.tsx";
import "./model-setup.css";

export interface ModelSetupProps {
  readonly host: HostPort;
  readonly workspace: string;
  readonly heading: string;
  readonly continueLabel: string;
  readonly scope?: ModelSetupScope;
  readonly current?: SelectedModel | undefined;
  onContinue(selected: SelectedModel): Promise<void> | void;
  onExplore(): void;
}

export function ModelSetup(props: ModelSetupProps) {
  const title = createUniqueId();
  const client = keyworkClientOver(hostFetch(props.host, props.workspace));
  const read = async (refresh = false) => {
    const report = await (refresh ? client.refreshModels() : client.models());
    if (isServedRefusal(report)) throw new ModelInventoryRefusal(report.refused);
    return setupInventory(report, props.scope);
  };
  const [inventory, { refetch }] = createResource(() => read().catch(() => undefined));
  const [updated, setUpdated] = createSignal<ModelInventory>();
  const [usingUpdatedDefault, setUsingUpdatedDefault] = createSignal(false);
  const [terminal, setTerminal] = createSignal<ModelGroup>();
  const [notice, setNotice] = createSignal<string>();
  const [retry, setRetry] = createSignal<ModelGroup>();
  const [terminalReceipt, setTerminalReceipt] = createSignal<string>();
  const [refreshing, setRefreshing] = createSignal(false);
  const [refreshFailed, setRefreshFailed] = createSignal(false);
  const [continuing, setContinuing] = createSignal(false);
  const [checkingProject, setCheckingProject] = createSignal(false);
  const routeButtons: Partial<Record<ModelGroup, HTMLButtonElement>> = {};
  let heading: HTMLHeadingElement | undefined;
  let closeTerminal: HTMLButtonElement | undefined;
  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });
  onMount(() => heading?.focus({ preventScroll: true }));

  const currentInventory = () => updated() ?? inventory();
  const explicit = () => (usingUpdatedDefault() ? undefined : props.current);
  const selected = () => selectedForSetup(currentInventory(), explicit());
  const unconfirmed = () => (selected() === undefined ? explicit() : undefined);
  const alternative = () => {
    const freshDefault = updated()?.selected;
    return explicit() !== undefined && !sameModel(explicit(), freshDefault)
      ? freshDefault
      : undefined;
  };
  const busy = () => refreshing() || continuing() || checkingProject();
  const selectionProblem = () =>
    selected() === undefined ? currentInventory()?.selectionProblem : undefined;

  const start = (group: ModelGroup): void => {
    setRetry(group);
    setNotice(undefined);
    setTerminalReceipt(undefined);
    setTerminal(group);
  };

  const back = (): void => {
    const group = terminal();
    setTerminal(undefined);
    queueMicrotask(() => {
      if (disposed) return;
      const button = group === undefined ? undefined : routeButtons[group];
      (button === undefined || button.disabled ? heading : button)?.focus({ preventScroll: true });
    });
  };

  const refresh = async (receipt = terminalReceipt()): Promise<void> => {
    if (busy()) return;
    setTerminalReceipt(receipt);
    const announce = (line?: string): void => {
      setNotice([receipt, line].filter(Boolean).join(" ") || undefined);
    };
    const previous = currentInventory()?.selected;
    setRefreshing(true);
    announce("Checking which model the runtime can use…");
    try {
      const report = await read(true);
      if (disposed) return;
      const unchanged = sameModel(previous, report.selected);
      if (!unchanged && previous !== undefined && report.selected !== undefined)
        setUsingUpdatedDefault(true);
      setUpdated(report);
      setRefreshFailed(false);
      if (unchanged) announce("Starting model unchanged.");
      else
        announce(
          report.selected === undefined && report.selectionProblem === undefined
            ? "No model is selected yet. Return to setup and choose one."
            : undefined,
        );
    } catch (cause) {
      if (disposed) return;
      setRefreshFailed(true);
      announce(refreshNotice(cause));
    } finally {
      if (!disposed) setRefreshing(false);
    }
  };

  const terminalEvent = (event: PtyEvent): void => {
    if (event.kind === "opened") return;
    back();
    if (event.kind === "failed") {
      setNotice("The setup terminal could not start. Try again.");
      return;
    }
    const completed = event.exit.exitCode === 0 && event.exit.signal == null;
    void refresh(
      completed ? undefined : "Model setup stopped. Settings saved before it stopped are kept.",
    );
  };

  const checkProject = async (target: ProjectCheck): Promise<void> => {
    if (busy()) return;
    setCheckingProject(true);
    setNotice("Checking tool calls on your local model…");
    try {
      const probe = await client.probeModels({
        endpoint: target.endpoint,
        model: target.model,
        behaviour: true,
        refresh: true,
      });
      if (disposed) return;
      if (isServedRefusal(probe) || probe.status !== "recognized") {
        setNotice(projectCheckFailed);
        return;
      }
      const report = await read(true);
      if (disposed) return;
      setUpdated(report);
      setRefreshFailed(false);
      setNotice(
        sameModel(report.projectModel, target)
          ? "This model now meets the starting requirements for project work."
          : projectCheckFailed,
      );
    } catch {
      if (!disposed) setNotice(projectCheckFailed);
    } finally {
      if (!disposed) setCheckingProject(false);
    }
  };

  const use = async (model: SelectedModel): Promise<void> => {
    setContinuing(true);
    setNotice(undefined);
    try {
      await props.onContinue(model);
    } catch {
      if (!disposed) setNotice("The model is selected, but we could not continue. Try again.");
    } finally {
      if (!disposed) setContinuing(false);
    }
  };

  return (
    <section class="kw-model-setup" aria-labelledby={title} data-native-activation>
      <div class="kw-model-heading">
        <span class="kw-model-kicker">Model setup</span>
        <h2 id={title} tabIndex={-1} ref={heading}>
          {props.heading}
        </h2>
      </div>
      <Show
        when={terminal()}
        keyed
        fallback={
          <>
            <Show when={unconfirmed()}>
              {(saved) => (
                <div class="kw-model-selection">
                  <div>
                    <strong>{saved().model}</strong>
                    <p>
                      Saved model · {saved().provider}. Its availability could not be confirmed.
                    </p>
                  </div>
                </div>
              )}
            </Show>
            <Show when={selected()}>
              {(model) => (
                <div class="kw-model-selection">
                  <div>
                    <strong>{model().model}</strong>
                    <p>
                      {refreshFailed() ? "Previously selected" : "Selected model"} ·{" "}
                      {modelDestination(model(), currentInventory())}
                    </p>
                    <Show when={model().mode === "chat"}>
                      <p>
                        Conversation only. Project work needs a model with tool support and enough
                        context.
                      </p>
                    </Show>
                    <p>Send a message to see how it replies.</p>
                  </div>
                  <button
                    type="button"
                    class="kw-model-primary"
                    disabled={busy() || refreshFailed()}
                    onClick={() => void use(model())}
                  >
                    {props.continueLabel}
                  </button>
                </div>
              )}
            </Show>
            <Show when={alternative()}>
              {(model) => (
                <div class="kw-model-selection">
                  <p>
                    Starting model · {model().model} ·{" "}
                    {modelDestination(model(), currentInventory())}
                  </p>
                  <button
                    type="button"
                    class="kw-model-link"
                    disabled={busy() || refreshFailed()}
                    onClick={() => void use(model())}
                  >
                    Use starting model instead
                  </button>
                </div>
              )}
            </Show>
            <Show when={currentInventory()?.projectCheck}>
              {(target) => (
                <div class="kw-model-selection">
                  <p>
                    Send one short request to {target().model} on this computer to check tool calls.
                    The check uses simulated tools.
                  </p>
                  <button
                    type="button"
                    class="kw-model-link"
                    disabled={busy()}
                    onClick={() => void checkProject(target())}
                  >
                    Check project capabilities
                  </button>
                </div>
              )}
            </Show>
            <div class="kw-model-routes">
              <For each={modelGroups}>
                {(group) => (
                  <button
                    type="button"
                    class="kw-model-route"
                    ref={(button) => {
                      routeButtons[group] = button;
                    }}
                    data-recommended={
                      group === "local" &&
                      selected() === undefined &&
                      unconfirmed() === undefined &&
                      (currentInventory()?.localCandidate !== undefined ||
                        (props.scope === "conversation" &&
                          currentInventory()?.localLoaded !== undefined))
                        ? ""
                        : undefined
                    }
                    disabled={busy()}
                    onClick={() => start(group)}
                  >
                    <strong>{routeWords[group].label}</strong>
                    <span>{routeWords[group].description}</span>
                    <Show when={group === "local"}>
                      <span class="kw-model-detail" aria-live="polite">
                        {localDetail(
                          currentInventory(),
                          selected() ?? unconfirmed(),
                          inventory.loading,
                        )}
                      </span>
                    </Show>
                  </button>
                )}
              </For>
            </div>
            <Show when={notice()}>
              {(line) => (
                <p class="kw-model-notice" role="status">
                  {line()}
                </p>
              )}
            </Show>
            <Show when={!busy() && !refreshFailed() && selectionProblem()}>
              {(detail) => (
                <p class="kw-model-notice" role="status">
                  {detail()} Choose a different model or explore first.
                </p>
              )}
            </Show>
            <div class="kw-model-actions">
              <button
                type="button"
                class="kw-model-link"
                disabled={busy()}
                onClick={() => props.onExplore()}
              >
                Explore first
              </button>
              <Show when={refreshFailed() || terminalReceipt() !== undefined}>
                <button
                  type="button"
                  class="kw-model-link"
                  disabled={busy()}
                  onClick={() => void refresh()}
                >
                  Check selection again
                </button>
              </Show>
              <Show when={retry() && notice() && !busy() && !refreshFailed()}>
                <button
                  type="button"
                  class="kw-model-link"
                  onClick={() => {
                    const group = retry();
                    if (group !== undefined) start(group);
                  }}
                >
                  Try setup again
                </button>
              </Show>
              <Show
                when={
                  inventory.state === "ready" &&
                  inventory() === undefined &&
                  updated() === undefined &&
                  !busy()
                }
              >
                <button type="button" class="kw-model-link" onClick={() => void refetch()}>
                  Check models again
                </button>
              </Show>
            </div>
          </>
        }
      >
        {(group) => (
          <>
            <p class="kw-model-notice">{routeWords[group].terminal}</p>
            <Show when={group === "local"}>
              <details class="kw-model-help" open={currentInventory()?.localService === undefined}>
                <summary>Start a local model</summary>
                <ol>
                  <li>Install and open LM Studio or Ollama if you do not have one.</li>
                  <li>
                    Download a model that fits your computer. In LM Studio, load it and start the
                    local server. With Ollama, start Ollama and have it run the model.
                  </li>
                  <li>
                    Choose the running service and model in this terminal. If discovery ran before
                    the service started, close the terminal and try Local again.
                  </li>
                </ol>
              </details>
            </Show>
            <ModelSetupTerminal
              port={props.host.pty}
              workspace={props.workspace}
              group={group}
              onEvent={terminalEvent}
              leaveFocus={() => closeTerminal?.focus()}
            />
            <div class="kw-model-actions">
              <button
                type="button"
                class="kw-model-link"
                ref={closeTerminal}
                onClick={() => {
                  back();
                  void refresh("Model setup closed. Settings saved before closing are kept.");
                }}
              >
                Close setup terminal
              </button>
              <span class="kw-model-notice">Press F6 to leave the terminal.</span>
            </div>
          </>
        )}
      </Show>
    </section>
  );
}

const projectCheckFailed =
  "The check did not confirm this model for project work. You can try the check again or choose another model.";

class ModelInventoryRefusal extends Error {
  readonly kind: string;

  constructor(kind: string) {
    super("Model inventory unavailable");
    this.kind = kind;
  }
}

function refreshNotice(cause: unknown): string {
  const unsupported =
    cause instanceof ModelInventoryRefusal
      ? ["missing", "unserved", "deferred"].includes(cause.kind)
      : cause instanceof ServerRefusal && [404, 501, 503].includes(cause.status);
  return unsupported
    ? "This runtime cannot apply model changes here. Keep your setup and check again after updating this app and its engine."
    : "Model setup ended, but the runtime could not load the selection. Try checking again.";
}

function localDetail(
  inventory: ModelInventory | undefined,
  current: SelectedModel | undefined,
  loading: boolean,
): string {
  if (inventory?.localCandidate !== undefined) {
    return current === undefined
      ? `${inventory.localCandidate} is loaded and available to try.`
      : `${inventory.localCandidate} is loaded locally.`;
  }
  if (inventory?.localLoaded !== undefined)
    return `${inventory.localLoaded} is loaded locally. Choose it in setup to check whether it can reply.`;
  if (inventory?.localService !== undefined)
    return `${inventory.localService} found. Finish local setup to choose a model.`;
  if (loading) return "Checking this computer…";
  return inventory === undefined
    ? "Local discovery is unavailable."
    : "No local service found yet.";
}

const routeWords = {
  local: {
    label: "On this computer",
    description: "Use a local model or get help setting one up.",
    terminal: "Choose a local service and model in the setup terminal.",
  },
  flagship: {
    label: "Flagship AI",
    description: "Connect directly to OpenAI or Anthropic. Provider charges may apply.",
    terminal:
      "Choose OpenAI or Anthropic in the setup terminal. Use your own provider credentials.",
  },
  openrouter: {
    label: "OpenRouter",
    description: "Choose models through your OpenRouter connection. Usage charges may apply.",
    terminal: "Connect to OpenRouter and choose a model in the setup terminal.",
  },
} as const;
