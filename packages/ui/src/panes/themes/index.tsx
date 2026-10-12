import { systemThemeName } from "@keywork-app/protocol";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { z } from "zod";
import type { PaneId } from "../../layout/index.ts";
import { frameTick } from "../../shell/frame-tick.ts";
import { type AttireTarget, sameTarget } from "../../theme/attire.ts";
import type { Theme } from "../../theme/schema.ts";
import type { Fitting, Wardrobe } from "../../theme/wardrobe.ts";
import { EmptyState } from "../empty-state.tsx";
import { keepKeyboardHome } from "../keyboard-home.ts";
import { createCursor, keepInView, NoticeLine } from "../overview/rows.tsx";
import { definePane, type PaneProps, type ShellSeams } from "../registry.ts";
import { type Dresser, dresserFor } from "./dresser.ts";
import {
  attireTargetSpec,
  nextTarget,
  reachableTargets,
  summonedTarget,
  summonNotices,
  windowTarget,
} from "./targets.ts";
import "../overview/overview.css";
import "./themes.css";

const themesSpec = z.object({
  kind: z.literal("themes"),
  target: attireTargetSpec.optional(),
  summonedFrom: z.string().optional(),
  notice: z.string().optional(),
});

export type ThemesSpec = z.output<typeof themesSpec>;

export const themesPane = definePane<ThemesSpec>({
  kind: "themes",
  spec: themesSpec,
  home: "right",
  attire: "house",
  title: () => "themes",
  emptyState: (keys) =>
    `no wardrobe in this window · ${keys.chord("palette.commands")} lists the theme commands`,
  component: ThemesList,
  summon: {
    action: "themes.summon",
    chords: "leader shift+f",
    help: "themes pane",
    command: { name: "theme", description: "open the themes pane and try one on" },
    variants: {
      pane: {
        chords: "leader w",
        help: "themes pane for the focused pane",
        command: { name: "theme-pane", description: "wear a theme on this pane" },
      },
      arc: {
        chords: "leader shift+w",
        help: "themes pane for the focused pane's arc",
        command: { name: "theme-arc", description: "wear a theme on this pane's arc" },
      },
      marked: {
        help: "themes pane for the marked panes",
        command: { name: "theme-marked", description: "wear a theme on the marked panes" },
      },
    },
    spec: (shell, variant) => themesSpecFor(shell, variant),
  },
  localActions: {
    "themes.down": {
      chords: ["j", "down"],
      help: "next theme, worn as a preview",
      command: { name: "theme-next", description: "preview the next theme" },
    },
    "themes.up": {
      chords: ["k", "up"],
      help: "previous theme, worn as a preview",
      command: { name: "theme-previous", description: "preview the previous theme" },
    },
    "themes.wear": {
      chords: "enter",
      help: "wear the previewed theme",
      command: { name: "theme-wear", description: "wear the theme under the cursor" },
    },
    "themes.restore": {
      chords: "escape",
      help: "put the worn theme back",
      command: { name: "theme-restore", description: "drop the preview, keep the worn theme" },
    },
    "themes.target": {
      chords: "t",
      help: "dress the window, this pane, its arc or the marked panes",
      command: {
        name: "theme-target",
        description: "cycle what the themes pane dresses: window, pane, arc, marked panes",
      },
    },
    "themes.undress": {
      chords: ["x", "backspace"],
      help: "drop this target's own theme so it inherits",
      command: {
        name: "theme-inherit",
        description: "drop the target's own theme so it inherits again",
      },
    },
    "themes.system": {
      chords: "s",
      help: "follow the OS between a theme and its pair",
      command: {
        name: "theme-follow",
        description: "toggle following the OS between the worn theme and its pair",
      },
    },
  },
});

export function tasteWords(theme: Theme): string {
  return [theme.appearance, theme.chromeWeight, theme.instruments].join(" · ");
}

export function swatchesOf(theme: Theme): readonly string[] {
  const { tokens, terminal } = theme;
  return [
    tokens.background,
    tokens.panel,
    tokens.textDim,
    tokens.textMid,
    tokens.text,
    tokens.accent,
    ...tokens.ramp,
    terminal.red,
    terminal.green,
    terminal.yellow,
    terminal.blue,
  ];
}

export {
  onlyWindowFollowsNotice,
  rememberedNotice,
  targetRememberedNotice,
  themeOnShow,
  windowAlwaysDressedNotice,
} from "./dresser.ts";
export { summonNotices };

export function themesSpecFor(shell: ShellSeams, variant?: string): ThemesSpec {
  const from = shell.focusedPane?.();
  const { target, notice } = summonedTarget(shell, from, variant);
  return specOf(target, from, notice);
}

export function pairLine(fitting: Fitting, wardrobe: Wardrobe): string | undefined {
  if (fitting.name === systemThemeName) {
    const wearing = wardrobe.worn() === systemThemeName ? wardrobe.wearing() : undefined;
    return wearing === undefined
      ? "follows the OS between a theme and its pair"
      : `follows the OS · wearing ${wearing.name}`;
  }
  if ("refusal" in fitting) return undefined;
  return fitting.theme.pair === undefined ? undefined : `pairs with ${fitting.theme.pair}`;
}

function ThemesList(props: PaneProps<ThemesSpec>) {
  return (
    <Show
      when={props.shell.wardrobe}
      fallback={<EmptyState line={themesPane.emptyState(props.shell.keys)} />}
    >
      {(wardrobe) => <WardrobeList {...props} wardrobe={wardrobe()} />}
    </Show>
  );
}

function WardrobeList(props: PaneProps<ThemesSpec> & { wardrobe: Wardrobe }) {
  let root: HTMLElement | undefined;
  keepKeyboardHome(
    () => root,
    () => props.focused,
  );
  const [target, setTarget] = createSignal<AttireTarget>(props.spec.target ?? windowTarget);
  const dresser = createMemo(() => dresserFor(target(), props.wardrobe, props.shell.attire));
  const fittings = createMemo(() =>
    props.wardrobe.fittings().filter((fitting) => dresser().lists(fitting)),
  );
  const cursor = createCursor(() => fittings().length);
  const [notice, setNotice] = createSignal<string | undefined>(props.spec.notice);
  const atCursor = (): Fitting | undefined => fittings()[cursor.index()];
  const previews = framePreview(setNotice);

  const landOnWorn = (): void => {
    const landing = dresser().landing();
    cursor.set(
      Math.max(
        0,
        fittings().findIndex((fitting) => fitting.name === landing),
      ),
    );
  };
  const dropPreview = (): void => {
    previews.cancel();
    dresser().preview(undefined);
  };
  const remember = (next: AttireTarget): void =>
    props.shell.rebind(props.id, specOf(next, props.spec.summonedFrom));

  const switchTo = (next: AttireTarget): void => {
    dropPreview();
    setTarget(next);
    landOnWorn();
  };
  const followSummons = (spec: ThemesSpec): void => {
    const summoned = spec.target ?? windowTarget;
    if (!sameTarget(summoned, target())) {
      switchTo(summoned);
      setNotice(undefined);
    }
    if (spec.notice === undefined) return;
    setNotice(spec.notice);
    remember(summoned);
  };

  landOnWorn();
  onMount(() => {
    if (props.spec.notice !== undefined) remember(target());
  });
  createEffect(on(() => props.spec, followSummons, { defer: true }));
  createEffect(
    on(
      () => props.focused,
      (focused) => {
        if (!focused) dropPreview();
      },
      { defer: true },
    ),
  );
  onCleanup(dropPreview);

  const move = (delta: number): void => {
    cursor.move(delta);
    const fitting = atCursor();
    if (fitting !== undefined) previews.schedule(dresser(), fitting.name);
  };
  const wear = (fitting: Fitting | undefined): void => {
    if (fitting === undefined) return;
    previews.cancel();
    setNotice(dresser().wear(fitting.name));
  };
  const retarget = (): void => {
    const reachable = reachableTargets(
      props.shell.attire,
      props.spec.summonedFrom,
      props.shell.marks?.all() ?? [],
    );
    const next = nextTarget(dresser().target, reachable);
    switchTo(next);
    remember(next);
    setNotice(reachable.length === 1 ? summonNotices.windowOnly : undefined);
  };
  const undress = (): void => {
    dropPreview();
    setNotice(dresser().undress());
    landOnWorn();
  };

  props.onAction((action) => {
    switch (action) {
      case "themes.down":
        return move(1);
      case "themes.up":
        return move(-1);
      case "themes.wear":
        return wear(atCursor());
      case "themes.restore":
        dropPreview();
        return setNotice(dresser().kept());
      case "themes.target":
        return retarget();
      case "themes.undress":
        return undress();
      case "themes.system":
        return setNotice(dresser().followSystem());
    }
  });

  return (
    <section class="kw-ov kw-themes" aria-label="themes" tabIndex={-1} ref={root}>
      <div class="kw-ov-head">
        <span class="kw-ov-head-lead">{dresser().head()}</span>
        <span class="kw-ov-head-detail">{dresser().hints()}</span>
      </div>
      <ol class="kw-ov-list kw-themes-list">
        <For each={fittings()}>
          {(fitting, index) => (
            <ThemeRow
              fitting={fitting}
              cursor={index() === cursor.index()}
              dressing={dressingOf(dresser(), fitting.name)}
              pair={pairLine(fitting, props.wardrobe)}
              onClick={() => {
                cursor.set(index());
                wear(fitting);
              }}
            />
          )}
        </For>
      </ol>
      <NoticeLine text={notice()} />
    </section>
  );
}

export const onlyTheWindowNotice =
  "only the window can be dressed now · focus a work pane or mark some, then summon again";

type Dressing = "own" | "inherited" | undefined;

const dressingMarks: Record<NonNullable<Dressing>, string> = { own: "█", inherited: "·" };

function dressingOf(dresser: Dresser, name: string): Dressing {
  if (dresser.own() === name) return "own";
  return dresser.echoes().includes(name) ? "inherited" : undefined;
}

interface ThemeRowProps {
  fitting: Fitting;
  cursor: boolean;
  dressing: Dressing;
  pair: string | undefined;
  onClick(): void;
}

function ThemeRow(props: ThemeRowProps) {
  const theme = (): Theme | undefined =>
    "theme" in props.fitting ? props.fitting.theme : undefined;
  const refusal = (): string | undefined =>
    "refusal" in props.fitting
      ? props.fitting.refusal.split("\n").slice(0, 2).join(" ")
      : undefined;
  return (
    <li
      ref={(row) => keepInView(row, () => props.cursor)}
      class="kw-themes-row"
      data-theme-name={props.fitting.name}
      data-cursor={props.cursor ? "" : undefined}
      data-worn={props.dressing === "own" ? "" : undefined}
      data-inherited={props.dressing === "inherited" ? "" : undefined}
      data-refused={refusal() === undefined ? undefined : ""}
    >
      <button type="button" class="kw-themes-button" onClick={() => props.onClick()}>
        <span class="kw-themes-mark" aria-hidden="true">
          {props.dressing === undefined ? " " : dressingMarks[props.dressing]}
        </span>
        <span class="kw-themes-name">{props.fitting.name}</span>
        <span class="kw-themes-source">{props.fitting.source}</span>
        <Show when={props.fitting.name !== systemThemeName ? theme() : undefined}>
          {(dressed) => (
            <>
              <span class="kw-themes-strip" aria-hidden="true">
                <For each={swatchesOf(dressed())}>
                  {(color) => <span class="kw-themes-swatch" style={{ background: color }} />}
                </For>
              </span>
              <span class="kw-themes-taste">{tasteWords(dressed())}</span>
            </>
          )}
        </Show>
        <Show when={props.pair}>{(line) => <span class="kw-themes-pair">{line()}</span>}</Show>
        <Show when={refusal()}>{(line) => <span class="kw-themes-refusal">{line()}</span>}</Show>
      </button>
    </li>
  );
}

function specOf(target: AttireTarget, from: PaneId | undefined, notice?: string): ThemesSpec {
  return {
    kind: "themes",
    ...(target.kind !== "window" && { target: wireTarget(target) }),
    ...(from !== undefined && { summonedFrom: from }),
    ...(notice !== undefined && { notice }),
  };
}

function wireTarget(target: AttireTarget): NonNullable<ThemesSpec["target"]> {
  return target.kind === "panes" ? { kind: "panes", ids: [...target.ids] } : { ...target };
}

interface FramePreview {
  schedule(dresser: Dresser, name: string): void;
  cancel(): void;
}

function framePreview(say: (text: string | undefined) => void): FramePreview {
  const tick = frameTick();
  let pending: { dresser: Dresser; name: string } | undefined;
  let scheduled = false;
  return {
    schedule: (dresser, name) => {
      pending = { dresser, name };
      if (scheduled) return;
      scheduled = true;
      tick(() => {
        scheduled = false;
        const next = pending;
        pending = undefined;
        if (next !== undefined) say(next.dresser.preview(next.name));
      });
    },
    cancel: () => {
      pending = undefined;
    },
  };
}
