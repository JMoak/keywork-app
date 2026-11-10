import { keyworkProfile, type ProductProfile } from "@keywork-app/product";
import { createResource, createSignal, For, onCleanup, Show } from "solid-js";
import { FirstRun } from "../chrome/first-run.tsx";
import { useProductProfile } from "../chrome/product.ts";
import { themeName } from "../chrome/root-attributes.ts";
import { createTileFillStep, stampGlyph } from "../chrome/stamp.ts";
import { relativeAge } from "../chrome/telemetry.ts";
import { describeFailure, type HostPort, type WorkspaceFailure } from "../host/port.ts";
import { keymapFromConfig } from "../keys/config.ts";
import { createLiveKeymap, followKeybindings } from "../keys/live.ts";
import { ModelSetup } from "../model-setup/index.tsx";
import { OpenFailure, type OpenFailureView } from "./open-failure.tsx";

export interface OpenScreenProps {
  host: HostPort;
  failure: OpenFailureView | undefined;
  opening: string | undefined;
  onOpen: (path: string) => void;
  onEnableRuntime?: (() => void) | undefined;
}

export function startingLine(path: string, profile: ProductProfile = keyworkProfile): string {
  return `starting ${profile.name} in ${path}`;
}

export function OpenScreen(props: OpenScreenProps) {
  const profile = useProductProfile();
  const [recents] = createResource(() => props.host.recentWorkspaces());
  const [about] = createResource(() => props.host.about());
  const live = createLiveKeymap(keymapFromConfig());
  onCleanup(followKeybindings(props.host, { projectTrusted: false }, live, () => undefined));
  const keys = { chord: (action: string) => live.keys.describe(action) ?? "an unbound key" };
  const neverOpened = () => recents.state === "ready" && (recents() ?? []).length === 0;
  const [setup, setSetup] = createSignal(false);
  const [setupWorkspace, setSetupWorkspace] = createSignal<string>();
  const [setupFailure, setSetupFailure] = createSignal<{ line: string; enable: boolean }>();
  const [pendingProject, setPendingProject] = createSignal<string>();
  const retainedProject = () => pendingProject() ?? props.failure?.path;
  let folderButton: HTMLButtonElement | undefined;
  let setupAttempt = 0;
  onCleanup(() => {
    setupAttempt++;
  });

  const startSetup = async (enable = false): Promise<void> => {
    const attempt = ++setupAttempt;
    setSetup(true);
    setSetupFailure(undefined);
    try {
      if (enable) await props.host.enableRuntime?.();
      if (attempt !== setupAttempt) return;
      const opened = await props.host.openHome?.();
      if (attempt !== setupAttempt || opened === undefined) return;
      if (opened.ok) setSetupWorkspace(opened.opened.workspace);
      else setSetupFailure(setupIssue(opened.failure));
    } catch {
      if (attempt === setupAttempt)
        setSetupFailure({ line: "Model setup could not start. Try again.", enable });
    }
  };
  const closeSetup = (): void => {
    setupAttempt++;
    setSetup(false);
    setSetupWorkspace(undefined);
    folderButton?.focus({ preventScroll: true });
  };
  const open = (path: string): void => {
    if (setup()) setPendingProject(path);
    else {
      setPendingProject(undefined);
      props.onOpen(path);
    }
  };
  const pick = async (): Promise<void> => {
    const chosen = await props.host.pickFolder();
    if (chosen !== undefined) open(chosen);
  };
  const continueSetup = (): void => {
    const path = retainedProject();
    closeSetup();
    if (path !== undefined) {
      setPendingProject(undefined);
      props.onOpen(path);
    }
  };
  return (
    <main class="kw-open" data-model-setup={setup() ? "" : undefined}>
      <div class="kw-open-sheet">
        <header class="kw-open-masthead">
          <h1 class="kw-open-name">{profile.name}</h1>
          <Show when={themeName()}>
            {(name) => (
              <p class="kw-open-theme">
                theme <span class="kw-open-theme-name">{name()}</span>
              </p>
            )}
          </Show>
        </header>
        <section class="kw-open-workspaces" aria-label="workspaces">
          <Show when={about()?.shell === "browser"}>
            <TypedWorkspace onOpen={open} />
          </Show>
          <button type="button" class="kw-open-pick" ref={folderButton} onClick={() => void pick()}>
            open a folder
          </button>
          <Show when={props.host.openHome !== undefined && !setup()}>
            <button
              type="button"
              class="kw-model-link kw-open-model-button"
              onClick={() => void startSetup()}
            >
              Set up a model
            </button>
          </Show>
          <Show when={(recents() ?? []).length > 0}>
            <ol class="kw-open-recents">
              <For each={recents()}>
                {(recent) => (
                  <li>
                    <button type="button" class="kw-open-recent" onClick={() => open(recent.path)}>
                      <span class="kw-open-recent-path">{recent.path}</span>
                      <span class="kw-open-recent-age">{relativeAge(recent.openedAt)}</span>
                    </button>
                  </li>
                )}
              </For>
            </ol>
          </Show>
        </section>
        <Show
          when={setup()}
          fallback={
            <Show when={neverOpened()}>
              <FirstRun keys={keys} />
            </Show>
          }
        >
          <Show when={retainedProject()}>
            {(path) => <p class="kw-model-notice">Folder to open after setup: {path()}</p>}
          </Show>
          <Show
            when={setupWorkspace()}
            keyed
            fallback={
              <div class="kw-model-actions">
                <p role="status">{setupFailure()?.line ?? "Opening model setup…"}</p>
                <Show when={setupFailure()}>
                  {(issue) => (
                    <Show
                      when={issue().enable && props.host.enableRuntime !== undefined}
                      fallback={
                        <button
                          type="button"
                          class="kw-model-link"
                          onClick={() => void startSetup()}
                        >
                          Try again
                        </button>
                      }
                    >
                      <button
                        type="button"
                        class="kw-model-link"
                        onClick={() => void startSetup(true)}
                      >
                        Enable background work
                      </button>
                    </Show>
                  )}
                </Show>
                <button type="button" class="kw-model-link" onClick={closeSetup}>
                  Explore first
                </button>
              </div>
            }
          >
            {(workspace) => (
              <ModelSetup
                host={props.host}
                workspace={workspace}
                heading="How would you like to connect a model?"
                continueLabel={
                  retainedProject() === undefined ? "Continue to workspaces" : "Open this folder"
                }
                onContinue={continueSetup}
                onExplore={closeSetup}
              />
            )}
          </Show>
        </Show>
        <Show when={props.opening}>{(path) => <OpeningNote path={path()} />}</Show>
        <Show when={props.failure}>
          {(failure) => <OpenFailure view={failure()} onEnableRuntime={props.onEnableRuntime} />}
        </Show>
      </div>
    </main>
  );
}

function setupIssue(failure: WorkspaceFailure): { line: string; enable: boolean } {
  return {
    line: describeFailure(failure),
    enable: failure.kind === "unresolved" && /enable background work/i.test(failure.nextAction),
  };
}

function TypedWorkspace(props: { onOpen: (path: string) => void }) {
  const [typed, setTyped] = createSignal("");
  return (
    <form
      class="kw-open-typed"
      onSubmit={(event) => {
        event.preventDefault();
        if (typed().trim() !== "") props.onOpen(typed().trim());
      }}
    >
      <input
        class="kw-open-input"
        aria-label="workspace"
        placeholder="workspace path · the browser build attaches with ?url=&token="
        value={typed()}
        onInput={(event) => setTyped(event.currentTarget.value)}
      />
    </form>
  );
}

function OpeningNote(props: { path: string }) {
  const profile = useProductProfile();
  const step = createTileFillStep(() => true);
  const waited = createWaitedSeconds();
  return (
    <p class="kw-open-note">
      <span class="kw-open-stamp" aria-hidden="true">
        {stampGlyph("working", step())}
      </span>
      {startingLine(props.path, profile)}
      <Show when={waited() >= patientAfterSeconds}>
        <span class="kw-open-waited">· {waited()}s</span>
      </Show>
    </p>
  );
}

const patientAfterSeconds = 3;

function createWaitedSeconds(): () => number {
  const started = Date.now();
  const [seconds, setSeconds] = createSignal(0);
  const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
  onCleanup(() => clearInterval(timer));
  return seconds;
}
