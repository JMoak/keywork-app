import { onCleanup, onMount } from "solid-js";
import type { PtyPort } from "../host/port.ts";
import { connectPty, type PtyEvent } from "../panes/terminal/session.ts";
import { xtermSurface } from "../panes/terminal/surface.ts";
import { monoFontOf, themeOfElement, watchFonts, watchTheme } from "../panes/terminal/theme.ts";
import type { ModelGroup } from "./inventory.ts";
import "@xterm/xterm/css/xterm.css";
import "../panes/terminal/terminal.css";

export function ModelSetupTerminal(props: {
  readonly port: PtyPort;
  readonly workspace: string;
  readonly group: ModelGroup;
  onEvent(event: PtyEvent): void;
  leaveFocus(): void;
}) {
  let holder!: HTMLDivElement;
  onMount(() => {
    try {
      const leave = (event: KeyboardEvent): void => {
        if (event.key !== "F6") return;
        event.preventDefault();
        event.stopPropagation();
        props.leaveFocus();
      };
      holder.addEventListener("keydown", leave, true);
      onCleanup(() => holder.removeEventListener("keydown", leave, true));
      const font = monoFontOf(holder);
      const surface = xtermSurface(holder, {
        theme: themeOfElement(holder),
        fontFamily: font.family,
        fontSize: font.size,
        windows: /win/i.test(navigator.platform),
      });
      onCleanup(() => surface.dispose());
      onCleanup(watchTheme(holder, () => surface.setTheme(themeOfElement(holder))));
      onCleanup(watchFonts(() => surface.remeasure()));
      const connection = connectPty(
        surface,
        props.port,
        {
          workspace: props.workspace,
          program: "keywork",
          args: ["connect", "--group", props.group, "--first-model"],
        },
        (event) => props.onEvent(event),
      );
      onCleanup(() => connection.dispose());
      surface.focus();
    } catch {
      props.onEvent({ kind: "failed" });
    }
  });
  return (
    <section
      class="kw-terminal kw-model-terminal"
      data-keys-owned
      aria-label="Model setup terminal"
    >
      <div class="kw-terminal-host" ref={holder} />
    </section>
  );
}
