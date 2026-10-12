import { emptyProjection, projectAll, type SessionProjection } from "@keywork-app/client";
import { createSignal, For, type JSX, Match, onCleanup, onMount, Switch } from "solid-js";
import { render } from "solid-js/web";
import { type LifecycleState, PaneFrame } from "../src/chrome/pane-frame.tsx";
import type { ChromeWeight } from "../src/chrome/root-attributes.ts";
import { StatusLine } from "../src/chrome/status-line.tsx";
import { Composer } from "../src/composer/composer.tsx";
import { scenarios } from "../src/dev/scenarios.ts";
import { browserHost } from "../src/host/browser.ts";
import { assumedContextLevel } from "../src/instruments/context.ts";
import { usageLine } from "../src/instruments/cost.ts";
import { Layout, type Rect } from "../src/layout/index.ts";
import { ConversationPane } from "../src/page/pane.tsx";
import { OpenScreen } from "../src/shell/open-screen.tsx";
import type { Outfit } from "../src/theme/attire.ts";
import { applyTheme, gallery, keyworkNight, type Theme, themeNamed } from "../src/theme/index.ts";
import "../src/app.css";
import "../src/shell/shell.css";

type ChromeScene = "workspace" | "transcript" | "outfits" | "outfit-seams" | "open";

interface Dressing {
  readonly outfit?: Outfit | undefined;
  readonly marked?: boolean | undefined;
}

type StagedPane = () => JSX.Element;

function Gallery() {
  const query = new URLSearchParams(window.location.search);
  const scene = (query.get("scene") ?? "workspace") as ChromeScene;
  const theme = houseOf(scene, query.get("theme"));
  if (theme !== undefined) applyTheme(theme);
  document.body.dataset.themes = gallery.map((candidate) => candidate.name).join(" ");
  return (
    <Switch fallback={<WorkspaceScene panes={scenePanes(scene)} />}>
      <Match when={scene === "open"}>
        <OpenScene />
      </Match>
      <Match when={scene === "outfit-seams"}>
        <OutfitSeamsScene />
      </Match>
    </Switch>
  );
}

function houseOf(scene: ChromeScene, asked: string | null): Theme | undefined {
  if (scene === "outfits" || scene === "outfit-seams") return keyworkNight;
  return gallery.find((candidate) => candidate.name === asked) ?? gallery[0];
}

function scenePanes(scene: ChromeScene): readonly StagedPane[] {
  switch (scene) {
    case "transcript":
      return [() => transcriptPane({})];
    case "outfits":
      return [
        () => transcriptPane({ outfit: wearing("whiplash", "pane") }),
        () => askingPane({ outfit: wearing("rose-pine-dawn", "arc", "pricing"), marked: true }),
        () => unseenPane({ outfit: { theme: keyworkNight, source: "window" } }),
      ];
    default:
      return [() => transcriptPane({}), () => askingPane({}), () => unseenPane({})];
  }
}

function wearing(name: string, source: Outfit["source"], arc?: string): Outfit {
  return { theme: themeNamed(name) ?? keyworkNight, source, arc };
}

function WorkspaceScene(props: { panes: readonly StagedPane[] }) {
  const [rects, setRects] = createSignal<Rect[]>([]);
  let stage: HTMLDivElement | undefined;
  onMount(() => {
    if (stage === undefined) return;
    const measure = (): void => {
      if (stage !== undefined) setRects(paneRects(stage, props.panes.length));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    onCleanup(() => observer.disconnect());
  });
  return (
    <div class="kw-workspace">
      <div class="kw-stage" ref={stage}>
        <For each={rects()}>
          {(rect, index) => (
            <div class="kw-slot" style={rectStyle(rect)}>
              {props.panes[index()]?.()}
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

function transcriptPane(dressing: Dressing): JSX.Element {
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
      outfit={dressing.outfit}
      marked={dressing.marked}
    >
      <ConversationPane projection={projection} />
      <Composer queue={[]} onSteer={() => {}} onQueue={() => {}} onInterrupt={() => {}} />
    </PaneFrame>
  );
}

function askingPane(dressing: Dressing): JSX.Element {
  return (
    <PaneFrame
      name="rename the tiler verbs"
      state="needs-you"
      focused={false}
      spawnRank={1}
      outfit={dressing.outfit}
      marked={dressing.marked}
    >
      <ConversationPane projection={projected("tool")} onAnswerAsk={() => undefined} />
    </PaneFrame>
  );
}

function unseenPane(dressing: Dressing): JSX.Element {
  return (
    <PaneFrame
      name="why is the seam drag sticky"
      state="finished-unseen"
      focused={false}
      spawnRank={2}
      modeWord="plan"
      outfit={dressing.outfit}
      marked={dressing.marked}
    >
      <ConversationPane projection={projected("thinking")} />
    </PaneFrame>
  );
}

interface SeamHouse {
  readonly weight: ChromeWeight;
  readonly theme: string;
}

interface SeamGuest {
  readonly theme: string;
  readonly state: LifecycleState;
  readonly focused: boolean;
}

const seamHouses: readonly SeamHouse[] = [
  { weight: "regular", theme: "nord" },
  { weight: "seams", theme: "keywork-night" },
  { weight: "borderless", theme: "osaka-jade" },
];

const seamGuests: readonly SeamGuest[] = [
  { theme: "gruvbox-dark", state: "idle", focused: false },
  { theme: "rose-pine", state: "needs-you", focused: false },
  { theme: "whiplash", state: "finished-unseen", focused: true },
];

function OutfitSeamsScene() {
  return (
    <div style={{ display: "grid", gap: "1.5rem", padding: "1.5rem" }}>
      <For each={seamHouses}>{(house) => <SeamRow house={house} />}</For>
    </div>
  );
}

function SeamRow(props: { house: SeamHouse }) {
  const houseTheme = (): Theme => themeNamed(props.house.theme) ?? keyworkNight;
  let row: HTMLDivElement | undefined;
  onMount(() => {
    if (row === undefined) return;
    applyTheme(houseTheme(), row);
    for (const frame of row.querySelectorAll<HTMLElement>(".kw-frame")) {
      frame.dataset.house = props.house.weight;
      if (frame.dataset.attire === undefined) frame.dataset.chrome = props.house.weight;
    }
  });
  return (
    <section>
      <p
        style={{
          margin: "0 0 0.5rem",
          color: "var(--kw-text-dim)",
          "font-family": "var(--kw-font-mono)",
        }}
      >
        house {props.house.weight} · {props.house.theme}
      </p>
      <div
        ref={row}
        style={{
          display: "grid",
          "grid-template-columns": "repeat(4, minmax(0, 1fr))",
          height: "11rem",
          background: "var(--kw-background)",
        }}
      >
        <SeamFrame name={`house · ${props.house.theme}`} state="idle" focused={false} rank={0} />
        <For each={seamGuests}>
          {(guest, at) => (
            <SeamFrame
              name={`${themeNamed(guest.theme)?.chromeWeight ?? ""} pane`}
              state={guest.state}
              focused={guest.focused}
              rank={at() + 1}
              outfit={wearing(guest.theme, "pane")}
            />
          )}
        </For>
      </div>
    </section>
  );
}

interface SeamFrameProps {
  name: string;
  state: LifecycleState;
  focused: boolean;
  rank: number;
  outfit?: Outfit | undefined;
}

function SeamFrame(props: SeamFrameProps) {
  return (
    <PaneFrame
      name={props.name}
      state={props.state}
      focused={props.focused}
      spawnRank={props.rank}
      outfit={props.outfit}
    >
      <p style={{ margin: "0.5rem 0.75rem", color: "var(--kw-text-mid)" }}>
        {props.focused ? "focused" : props.state}
      </p>
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
