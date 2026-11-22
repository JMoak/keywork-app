import type { Placement, YardSetting } from "@keywork-app/habitat";
import type { SettingSubject } from "@keywork-app/protocol";
import { createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { PaneFrame } from "../chrome/pane-frame.tsx";
import type { Rect } from "../layout/index.ts";
import type { PaneSpec, ShellSeams } from "../panes/index.ts";
import { watchInteractions } from "./attention.ts";
import { agentMarkLabel } from "./copy.ts";
import { linkOpened, panelShell } from "./openings.ts";
import { followFocusOut, type YardPanels } from "./panels.ts";
import { railEntryId, rectStyle } from "./rail.tsx";
import { panelTitleOf, satelliteOf, satellitePaneId } from "./satellites.ts";
import { SettingBody } from "./setting-body.tsx";

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
  const holdsFocus = (): boolean => props.panels.inside() === props.setting.id;
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
      onFocusOut={(event) =>
        followFocusOut(event.currentTarget, event, {
          refocus: () => props.panels.focus(props.setting.id),
          leave: () => props.panels.focusWithin(props.setting.id, false),
        })
      }
    >
      <PaneFrame
        name={panelTitleOf(props.setting)}
        state="idle"
        focused={props.cursor || holdsFocus()}
        spawnRank={0}
        ribbon={props.by}
        agent={props.setting.agent === undefined ? undefined : agentMarkLabel(props.setting.agent)}
        agentColor={props.setting.agent?.color}
        tag={props.setting.mark}
      >
        <SettingBody
          paneId={paneId()}
          setting={props.setting}
          shown={satellite().kind}
          pane={paneSpec()}
          focused={holdsFocus()}
          shell={shell()}
          onAction={(handler) => onCleanup(props.panels.handle(props.setting.id, handler))}
        />
      </PaneFrame>
    </div>
  );
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
