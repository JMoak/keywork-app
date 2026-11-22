import { Match, Switch } from "solid-js";
import { Dynamic } from "solid-js/web";
import type { PaneId } from "../layout/index.ts";
import { Markdown } from "../page/markdown.tsx";
import { definitionOf, type PaneSpec, type ShellSeams } from "../panes/index.ts";
import type { PaneActionHandler } from "../panes/registry.ts";
import type { Satellite } from "./satellites.ts";

export interface SettingBodyProps {
  paneId: PaneId;
  setting: { readonly what: { readonly ref: string } };
  shown: Satellite["kind"];
  pane: PaneSpec | undefined;
  focused: boolean;
  shell: ShellSeams;
  onAction(handler: PaneActionHandler): void;
}

export function SettingBody(props: SettingBodyProps) {
  return (
    <Switch>
      <Match when={props.pane}>
        {(spec) => (
          <Dynamic
            component={definitionOf(spec().kind).component}
            id={props.paneId}
            spec={spec()}
            focused={props.focused}
            shell={props.shell}
            onAction={(handler) => props.onAction(handler)}
          />
        )}
      </Match>
      <Match when={props.shown === "note"}>
        <div class="kw-yard-note" data-markdown="" tabIndex={-1}>
          <Markdown source={props.setting.what.ref} />
        </div>
      </Match>
      <Match when={props.shown === "link"}>
        <p class="kw-yard-note" tabIndex={-1}>
          <a
            href={props.setting.what.ref}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => {
              event.preventDefault();
              void props.shell.host.openExternal(props.setting.what.ref);
            }}
          >
            {props.setting.what.ref}
          </a>
        </p>
      </Match>
    </Switch>
  );
}
