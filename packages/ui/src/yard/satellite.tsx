import type { Placement, YardSetting } from "@keywork-app/habitat";
import type { SettingSubject } from "@keywork-app/protocol";
import { createMemo, createSignal, Match, onCleanup, onMount, Switch } from "solid-js";
import { Dynamic } from "solid-js/web";
import { PaneFrame } from "../chrome/pane-frame.tsx";
import type { Rect } from "../layout/index.ts";
import { definitionOf, type PaneSpec, type ShellSeams } from "../panes/index.ts";
import { watchInteractions } from "./attention.ts";
import { linkOpened, panelShell } from "./openings.ts";
import type { YardPanels } from "./panels.ts";
import { railEntryId, rectStyle } from "./rail.tsx";
import { satelliteOf, satellitePaneId, titleOfSetting } from "./satellites.ts";

export interface SatelliteSlotProps {
  placement: Placement;
  setting: YardSetting;
  rect: Rect | undefined;
  shell: ShellSeams;
  by: string;
  withdrawn: boolean;
  folding: boolean;
  cursor: boolean;
  panels: YardPanels;
  onOpen(what: SettingSubject): void;
  onInteract(): void;
}

export function SatelliteSlot(props: SatelliteSlotProps) {
  let element: HTMLDivElement | undefined;
  const [navigated, setNavigated] = createSignal<PaneSpec>();
  const satellite = createMemo(() => satelliteOf(props.setting), undefined, { equals: sameValue });
  const paneId = createMemo(() => satellitePaneId(props.setting));
  const paneSpec = createMemo(
    (): PaneSpec | undefined => {
      const shown = satellite();
      return shown.kind === "pane" ? (navigated() ?? shown.spec) : undefined;
    },
    undefined,
    { equals: sameValue },
  );
  const shell = createMemo(() =>
    panelShell(props.shell, {
      paneId: paneId(),
      open: (what) => props.onOpen(what),
      rebind: setNavigated,
    }),
  );
  const openLink = (event: MouseEvent): void => {
    const what = linkOpened(event);
    if (what === undefined) return;
    event.preventDefault();
    props.onOpen(what);
  };
  onMount(() => {
    if (element === undefined) return;
    onCleanup(
      props.panels.mount(props.setting.id, {
        element,
        kind: () => paneSpec()?.kind,
        setting: () => props.setting,
      }),
    );
    onCleanup(watchInteractions(element, () => props.onInteract()));
  });

  return (
    <div
      ref={element}
      id={railEntryId(props.setting.id)}
      class="kw-yard-satellite"
      data-pane-id={paneId()}
      data-setting={props.setting.id}
      data-rung={props.placement.rung}
      data-size={props.placement.size}
      data-layer={props.placement.layer}
      data-cursor={props.cursor ? "" : undefined}
      data-withdrawn={props.withdrawn ? "" : undefined}
      data-folding={props.folding ? "" : undefined}
      inert={props.folding ? true : undefined}
      aria-hidden={props.folding ? "true" : undefined}
      style={rectStyle(props.rect)}
      onClick={openLink}
      onFocusIn={(event) => props.panels.focusWithin(props.setting.id, true, event.target)}
      onFocusOut={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node && event.currentTarget.contains(next))) {
          props.panels.focusWithin(props.setting.id, false);
        }
      }}
    >
      <PaneFrame
        name={titleOfSetting(props.setting)}
        state="idle"
        focused={props.cursor}
        spawnRank={0}
        ribbon={props.by}
      >
        <Switch>
          <Match when={paneSpec()}>
            {(spec) => (
              <Dynamic
                component={definitionOf(spec().kind).component}
                id={paneId()}
                spec={spec()}
                focused={false}
                shell={shell()}
                onAction={(handler) => onCleanup(props.panels.handle(props.setting.id, handler))}
              />
            )}
          </Match>
          <Match when={satellite().kind === "note"}>
            <p class="kw-yard-note" tabIndex={-1}>
              {props.setting.what.ref}
            </p>
          </Match>
          <Match when={satellite().kind === "link"}>
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
      </PaneFrame>
    </div>
  );
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
