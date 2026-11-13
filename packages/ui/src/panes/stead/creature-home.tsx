import { type JSX, onMount, Show } from "solid-js";
import type { ShellSeams } from "../registry.ts";
import { shellForStead } from "./home-scope.ts";

export const homeOpeningLine = "Opening your creature’s home…";
export const retryHomeWord = "Retry home";

export function creatureHomeShell(shell: ShellSeams): ShellSeams | undefined {
  const scope = shell.steadHome;
  if (scope === undefined) return shell.prepareSteadHome === undefined ? shell : undefined;
  if (scope.shell.workspace === shell.workspace) return shell;
  return { ...shellForStead(shell, scope), rebind: shell.rebind };
}

export function InCreatureHome(props: {
  readonly shell: ShellSeams;
  readonly class: string;
  readonly children: (home: ShellSeams) => JSX.Element;
}) {
  onMount(() => props.shell.prepareSteadHome?.());
  return (
    <Show
      when={creatureHomeShell(props.shell)}
      keyed
      fallback={<HomeOpening shell={props.shell} class={props.class} />}
    >
      {(home) => props.children(home)}
    </Show>
  );
}

export function HomeOpening(props: { readonly shell: ShellSeams; readonly class: string }) {
  return (
    <section class={props.class} data-native-activation>
      <Show when={props.shell.steadHomeFailure} fallback={<p role="status">{homeOpeningLine}</p>}>
        {(failure) => (
          <>
            <p role="status">{failure()}</p>
            <button type="button" onClick={() => props.shell.prepareSteadHome?.(true)}>
              {retryHomeWord}
            </button>
          </>
        )}
      </Show>
    </section>
  );
}
