import type { MotionPrefs } from "@keywork-app/habitat";
import { createEffect, createSignal, type JSX, Show } from "solid-js";
import { hueStop } from "../../chrome/pane-frame.tsx";
import type { LifecycleState } from "../../chrome/stamp.ts";
import { OrdinalBadge } from "../../layout/pane-badges.tsx";
import { motionStyle } from "./choreography.ts";
import "./surface-chrome.css";

export interface SurfaceChromeProps {
  title: string;
  hueRank: number;
  focused: boolean;
  shown: boolean;
  motion: MotionPrefs;
  landing?: number | undefined;
  state?: LifecycleState | undefined;
  ordinal?: string | undefined;
  hint?: string | undefined;
  insideHint?: string | undefined;
  onBringInside: () => void;
  children: JSX.Element;
}

export const bringInsideWords = "bring inside";

export function SurfaceChrome(props: SurfaceChromeProps) {
  const [arrived, setArrived] = createSignal(false);
  let body: HTMLDivElement | undefined;
  createEffect(() => {
    if (props.shown && body !== undefined) settleStyles(body);
    setArrived(props.shown);
  });
  return (
    <section
      class="kw-surface"
      aria-label={`${props.title} pane, outside the window`}
      data-focused={props.focused ? "" : undefined}
      data-state={props.state ?? "idle"}
      data-motion={motionStyle(props.motion)}
      data-arrival={arrived() ? "arrived" : "waiting"}
      data-landing={landingOf(props) === undefined ? undefined : ""}
      style={{
        "--kw-pane-hue": `var(--kw-ramp-${hueStop(props.hueRank)})`,
        "--kw-surface-landing": landingOf(props),
      }}
    >
      <Show when={props.hint}>
        {(letters) => (
          <span class="kw-surface-hint" aria-hidden="true">
            {letters()}
          </span>
        )}
      </Show>
      <OrdinalBadge chord={props.ordinal} />
      <button
        type="button"
        class="kw-surface-inside"
        title={insideTitle(props.insideHint)}
        // Solid delegates onClick to the document its bundle loaded in; this frame lives in another.
        on:click={() => props.onBringInside()}
      >
        {bringInsideWords}
      </button>
      <div class="kw-surface-body" ref={body}>
        {props.children}
      </div>
    </section>
  );
}

function landingOf(props: Pick<SurfaceChromeProps, "motion" | "landing">): number | undefined {
  const landing = motionStyle(props.motion) === "glide" ? (props.landing ?? 1) : 1;
  return landing === 1 ? undefined : landing;
}

function insideTitle(hint: string | undefined): string {
  return hint === undefined || hint === "" ? bringInsideWords : `${bringInsideWords} · ${hint}`;
}

function settleStyles(element: HTMLElement): void {
  // A transition starts from the last computed style; reading one computes the waiting state now.
  element.ownerDocument.defaultView?.getComputedStyle(element).getPropertyValue("opacity");
}
