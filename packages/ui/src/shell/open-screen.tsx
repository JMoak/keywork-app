import { createResource, createSignal, For, onCleanup, Show } from "solid-js";
import { FirstRun } from "../chrome/first-run.tsx";
import { themeName } from "../chrome/root-attributes.ts";
import { createTileFillStep, stampGlyph } from "../chrome/stamp.ts";
import { relativeAge } from "../chrome/telemetry.ts";
import type { HostPort } from "../host/port.ts";
import { keymapFromConfig } from "../keys/config.ts";
import { createLiveKeymap, followKeybindings } from "../keys/live.ts";

export interface OpenScreenProps {
  host: HostPort;
  failure: string | undefined;
  opening: string | undefined;
  onOpen: (path: string) => void;
}

export function OpenScreen(props: OpenScreenProps) {
  const [recents] = createResource(() => props.host.recentWorkspaces());
  const [about] = createResource(() => props.host.about());
  const live = createLiveKeymap(keymapFromConfig());
  onCleanup(followKeybindings(props.host, { projectTrusted: false }, live, () => undefined));
  const keys = { chord: (action: string) => live.keys.describe(action) ?? "an unbound key" };
  const neverOpened = () => recents.state === "ready" && (recents() ?? []).length === 0;
  const pick = async (): Promise<void> => {
    const chosen = await props.host.pickFolder();
    if (chosen !== undefined) props.onOpen(chosen);
  };
  return (
    <main class="kw-open">
      <div class="kw-open-sheet">
        <header class="kw-open-masthead">
          <h1 class="kw-open-name">keywork</h1>
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
            <TypedWorkspace onOpen={props.onOpen} />
          </Show>
          <button type="button" class="kw-open-pick" onClick={() => void pick()}>
            open a folder
          </button>
          <Show when={(recents() ?? []).length > 0}>
            <ol class="kw-open-recents">
              <For each={recents()}>
                {(recent) => (
                  <li>
                    <button
                      type="button"
                      class="kw-open-recent"
                      onClick={() => props.onOpen(recent.path)}
                    >
                      <span class="kw-open-recent-path">{recent.path}</span>
                      <span class="kw-open-recent-age">{relativeAge(recent.openedAt)}</span>
                    </button>
                  </li>
                )}
              </For>
            </ol>
          </Show>
        </section>
        <Show when={neverOpened()}>
          <FirstRun keys={keys} />
        </Show>
        <Show when={props.opening}>{(path) => <OpeningNote path={path()} />}</Show>
        <Show when={props.failure}>{(text) => <p class="kw-open-failure">{text()}</p>}</Show>
      </div>
    </main>
  );
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
  const step = createTileFillStep(() => true);
  const waited = createWaitedSeconds();
  return (
    <p class="kw-open-note">
      <span class="kw-open-stamp" aria-hidden="true">
        {stampGlyph("working", step())}
      </span>
      starting keywork in {props.path}
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
