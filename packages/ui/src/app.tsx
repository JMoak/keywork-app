import { createResource, Show } from "solid-js";
import type { HostPort } from "./host/port.ts";

export interface AppProps {
  host: HostPort;
}

export function App(props: AppProps) {
  const [about] = createResource(() => props.host.about());
  return (
    <main class="kw-ground">
      <p class="kw-masthead">keywork</p>
      <Show when={about()} fallback={<p class="kw-dim">starting</p>}>
        {(info) => (
          <p class="kw-dim">
            {info().shell} · {info().platform}
          </p>
        )}
      </Show>
    </main>
  );
}
