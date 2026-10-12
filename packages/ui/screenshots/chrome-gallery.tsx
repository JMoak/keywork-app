import { emptyProjection, projectAll, type SessionProjection } from "@keywork-app/client";
import { createSignal, For, type JSX, onCleanup, onMount, Show } from "solid-js";
import { render } from "solid-js/web";
import { PaneFrame } from "../src/chrome/pane-frame.tsx";
import { StatusLine } from "../src/chrome/status-line.tsx";
import { Composer } from "../src/composer/composer.tsx";
import { scenarios } from "../src/dev/scenarios.ts";
import { browserHost } from "../src/host/browser.ts";
import { assumedContextLevel } from "../src/instruments/context.ts";
import { usageLine } from "../src/instruments/cost.ts";
import { Layout, type Rect } from "../src/layout/index.ts";
import { ConversationPane } from "../src/page/pane.tsx";
import { OpenScreen } from "../src/shell/open-screen.tsx";
import { applyTheme, gallery } from "../src/theme/index.ts";
import "../src/app.css";
import "../src/shell/shell.css";

type ChromeScene = "workspace" | "transcript" | "open";

function Gallery() {
  const query = new URLSearchParams(window.location.search);
  const themes = gallery;
  const theme = themes.find((candidate) => candidate.name === query.get("theme")) ?? themes[0];
  if (theme !== undefined) applyTheme(theme);
  document.body.dataset.themes = themes.map((candidate) => candidate.name).join(" ");
  const scene = (query.get("scene") ?? "workspace") as ChromeScene;
  return (
    <Show when={scene === "open"} fallback={<WorkspaceScene single={scene === "transcript"} />}>
      <OpenScene />
    </Show>
  );
}

function WorkspaceScene(props: { single: boolean }) {
  const [rects, setRects] = createSignal<Rect[]>([]);
  let stage: HTMLDivElement | undefined;
  onMount(() => {
    if (stage === undefined) return;
    const measure = (): void => {
      if (stage !== undefined) setRects(paneRects(stage, props.single ? 1 : 3));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    onCleanup(() => observer.disconnect());
  });
  const panes = props.single ? [transcriptPane] : [transcriptPane, askingPane, unseenPane];
  return (
    <div class="kw-workspace">
      <div class="kw-stage" ref={stage}>
        <For each={rects()}>
          {(rect, index) => (
            <div class="kw-slot" style={rectStyle(rect)}>
              {panes[index()]?.()}
            </div>
          )}
        </For>
      </div>
      <StatusLine
        serverLabel="127.0.0.1:4770"
        projection={projected("prose")}
        usage={usageLine(projected("prose").usage)}
        preset="careful"
        trust={undefined}
        leader={undefined}
        notice={undefined}
        gap={undefined}
        lost={undefined}
      />
    </div>
  );
}

function transcriptPane(): JSX.Element {
  const projection = projected("prose");
  return (
    <PaneFrame
      name="explain the page grammar"
      state="working"
      focused
      spawnRank={0}
      bot="◆ editor"
      inference="opus · high"
      telemetry={usageLine(projection.usage)}
      context={assumedContextLevel(90_000)}
    >
      <ConversationPane projection={projection} />
      <Composer queue={[]} onSteer={() => {}} onQueue={() => {}} onInterrupt={() => {}} />
    </PaneFrame>
  );
}

function askingPane(): JSX.Element {
  return (
    <PaneFrame name="rename the tiler verbs" state="needs-you" focused={false} spawnRank={1}>
      <ConversationPane projection={projected("tool")} onAnswerAsk={() => undefined} />
    </PaneFrame>
  );
}

function unseenPane(): JSX.Element {
  return (
    <PaneFrame
      name="why is the seam drag sticky"
      state="finished-unseen"
      focused={false}
      spawnRank={2}
      modeWord="plan"
    >
      <ConversationPane projection={projected("thinking")} />
    </PaneFrame>
  );
}

function OpenScene() {
  const host = {
    ...browserHost(),
    about: async () => ({ shell: "electron" as const, platform: "win32", version: "dev" }),
    recentWorkspaces: async () => [
      { path: "C:\\src\\keywork", openedAt: hoursAgo(2) },
      { path: "C:\\src\\keywork-app", openedAt: hoursAgo(26) },
    ],
  };
  return <OpenScreen host={host} failure={undefined} opening={undefined} onOpen={() => {}} />;
}

function projected(name: string): SessionProjection {
  const scenario = scenarios.find((candidate) => candidate.name === name);
  return scenario === undefined ? emptyProjection : projectAll(emptyProjection, scenario.envelopes);
}

function paneRects(stage: HTMLElement, count: number): Rect[] {
  const screen = { width: stage.clientWidth, height: stage.clientHeight };
  const layout = new Layout();
  const ids = ["a", "b", "c"].slice(0, count);
  for (const id of ids) layout.open(id, screen);
  const rects = layout.scene(screen).rects;
  return ids.flatMap((id) => rects.get(id) ?? []);
}

function rectStyle(rect: Rect) {
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

const root = document.getElementById("root");
if (root !== null) render(() => <Gallery />, root);
