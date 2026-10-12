import { systemThemeName } from "@keywork-app/protocol";
import { createEffect, createSignal, For, on, onCleanup, Show } from "solid-js";
import { z } from "zod";
import { frameTick } from "../../shell/frame-tick.ts";
import type { Theme } from "../../theme/schema.ts";
import type { Fitting, Wardrobe } from "../../theme/wardrobe.ts";
import { EmptyState } from "../empty-state.tsx";
import { keepKeyboardHome } from "../keyboard-home.ts";
import { createCursor, keepInView, NoticeLine } from "../overview/rows.tsx";
import { definePane, type PaneProps } from "../registry.ts";
import "../overview/overview.css";
import "./themes.css";

const themesSpec = z.object({ kind: z.literal("themes") });

export type ThemesSpec = z.output<typeof themesSpec>;

export const themesPane = definePane<ThemesSpec>({
  kind: "themes",
  spec: themesSpec,
  home: "right",
  title: () => "themes",
  emptyState: (keys) =>
    `no wardrobe in this window · ${keys.chord("palette.commands")} lists the theme commands`,
  component: ThemesList,
  summon: {
    action: "themes.summon",
    chords: "leader shift+f",
    help: "themes pane",
    command: { name: "theme", description: "open the themes pane and try one on" },
    spec: () => ({ kind: "themes" }),
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

export const rememberedNotice = "remembered for the next launch";

export function themeOnShow(wardrobe: Wardrobe): string {
  const worn = wardrobe.worn();
  return worn === systemThemeName ? (wardrobe.wearing()?.name ?? worn) : worn;
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
  const fittings = () => props.wardrobe.fittings();
  const cursor = createCursor(() => fittings().length);
  const [notice, setNotice] = createSignal<string>();
  const atCursor = (): Fitting | undefined => fittings()[cursor.index()];
  const previewOnNextFrame = framePreview(props.wardrobe, setNotice);

  cursor.set(
    Math.max(
      0,
      fittings().findIndex((fitting) => fitting.name === themeOnShow(props.wardrobe)),
    ),
  );

  createEffect(
    on(
      () => props.focused,
      (focused) => {
        if (!focused) props.wardrobe.preview(undefined);
      },
      { defer: true },
    ),
  );
  onCleanup(() => props.wardrobe.preview(undefined));

  const move = (delta: number): void => {
    cursor.move(delta);
    const fitting = atCursor();
    if (fitting !== undefined) previewOnNextFrame(fitting.name);
  };
  const wear = (fitting: Fitting | undefined): void => {
    if (fitting === undefined) return;
    const refusal = props.wardrobe.wear(fitting.name);
    setNotice(refusal ?? rememberedNotice);
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
        props.wardrobe.preview(undefined);
        return setNotice(`kept ${props.wardrobe.worn()}`);
      case "themes.system":
        return setNotice(props.wardrobe.toggleSystem() ?? rememberedNotice);
    }
  });

  return (
    <section class="kw-ov kw-themes" aria-label="themes" tabIndex={-1} ref={root}>
      <div class="kw-ov-head">
        <span>wearing {props.wardrobe.worn()}</span>
        <span class="kw-ov-head-detail">enter wears · esc keeps · s system</span>
      </div>
      <ol class="kw-ov-list kw-themes-list">
        <For each={fittings()}>
          {(fitting, index) => (
            <ThemeRow
              fitting={fitting}
              cursor={index() === cursor.index()}
              worn={fitting.name === props.wardrobe.worn()}
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

interface ThemeRowProps {
  fitting: Fitting;
  cursor: boolean;
  worn: boolean;
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
      data-worn={props.worn ? "" : undefined}
      data-refused={refusal() === undefined ? undefined : ""}
    >
      <button type="button" class="kw-themes-button" onClick={() => props.onClick()}>
        <span class="kw-themes-mark" aria-hidden="true">
          {props.worn ? "█" : " "}
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

function framePreview(
  wardrobe: Wardrobe,
  say: (text: string | undefined) => void,
): (name: string) => void {
  const tick = frameTick();
  let pending: string | undefined;
  return (name) => {
    const scheduled = pending !== undefined;
    pending = name;
    if (scheduled) return;
    tick(() => {
      const next = pending;
      pending = undefined;
      if (next !== undefined) say(wardrobe.preview(next));
    });
  };
}
