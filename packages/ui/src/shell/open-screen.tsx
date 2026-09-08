import { createResource, createSignal, For, Show } from "solid-js";
import { relativeAge } from "../chrome/telemetry.ts";
import type { HostPort } from "../host/port.ts";

export interface OpenScreenProps {
  host: HostPort;
  failure: string | undefined;
  opening: string | undefined;
  onOpen: (path: string) => void;
}

export function OpenScreen(props: OpenScreenProps) {
  const [recents] = createResource(() => props.host.recentWorkspaces());
  const [about] = createResource(() => props.host.about());
  const [typed, setTyped] = createSignal("");
  const pick = async (): Promise<void> => {
    const chosen = await props.host.pickFolder();
    if (chosen !== undefined) props.onOpen(chosen);
  };
  return (
    <main class="kw-open">
      <p class="kw-open-masthead">keywork</p>
      <Show when={about()?.shell === "browser"}>
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
      <Show when={props.opening}>
        {(path) => <p class="kw-open-note">starting keywork in {path()}</p>}
      </Show>
      <Show when={props.failure}>{(text) => <p class="kw-open-failure">{text()}</p>}</Show>
    </main>
  );
}
