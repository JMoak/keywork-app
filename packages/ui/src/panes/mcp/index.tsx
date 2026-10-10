import { isSurfaceRefusal, type McpServerStatus } from "@keywork-app/protocol";
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { z } from "zod";
import { tileFill, tileFillStepMs } from "../../chrome/pane-frame.tsx";
import { EmptyState } from "../empty-state.tsx";
import {
  createCursor,
  NoticeLine,
  OverviewRow,
  type RowDensity,
  SubLine,
} from "../overview/rows.tsx";
import { definePane, type PaneProps } from "../registry.ts";

const mcpSpec = z.object({ kind: z.literal("mcp") });

export type McpSpec = z.output<typeof mcpSpec>;

export const mcpPane = definePane<McpSpec>({
  kind: "mcp",
  spec: mcpSpec,
  home: "right",
  title: () => "mcp",
  emptyState: (keys) =>
    `no mcp servers · name one in keywork's config · ${keys.chord("palette.commands")} /mcp reopens this pane`,
  component: McpList,
  summon: {
    action: "mcp.summon",
    chords: "none",
    help: "mcp servers pane",
    command: { name: "mcp", description: "open the mcp servers pane" },
    spec: () => ({ kind: "mcp" }),
  },
  localActions: {
    "mcp.down": {
      chords: ["j", "down"],
      help: "next server",
      command: { name: "mcp-next", description: "move to the next mcp server" },
    },
    "mcp.up": {
      chords: ["k", "up"],
      help: "previous server",
      command: { name: "mcp-previous", description: "move to the previous mcp server" },
    },
    "mcp.tools": {
      chords: "enter",
      help: "list the server's tools",
      command: { name: "mcp-tools", description: "list the tools this mcp server advertises" },
    },
    "mcp.restart": {
      chords: "r",
      help: "restart the server",
      command: { name: "mcp-restart", description: "drop and reconnect this mcp server" },
    },
    "mcp.toggle": {
      chords: "t",
      help: "enable or disable the server",
      command: { name: "mcp-toggle", description: "enable or disable this mcp server" },
    },
  },
});

export function serverMark(server: McpServerStatus, step: number): string {
  if (!server.enabled) return "·";
  switch (server.state) {
    case "connected":
      return tileFill[tileFill.length - 1] ?? "█";
    case "connecting":
      return tileFill[step % tileFill.length] ?? "▌";
    case "down":
      return " ";
  }
}

export function serverDensity(server: McpServerStatus): RowDensity {
  if (!server.enabled) return "light";
  return server.state === "connected" ? "full" : "heavy";
}

export function serverAside(server: McpServerStatus): string {
  if (!server.enabled) return "off";
  const count = `${server.toolCount} ${server.toolCount === 1 ? "tool" : "tools"}`;
  return server.transport === undefined ? count : `${server.transport} · ${count}`;
}

export function stateTally(servers: readonly McpServerStatus[]): string {
  const live = servers.filter((server) => server.enabled);
  const connected = live.filter((server) => server.state === "connected").length;
  const connecting = live.filter((server) => server.state === "connecting").length;
  const down = live.filter((server) => server.state === "down").length;
  return [
    `${servers.length} ${servers.length === 1 ? "server" : "servers"}`,
    connected > 0 && `${connected} connected`,
    connecting > 0 && `${connecting} connecting`,
    down > 0 && `${down} down`,
  ]
    .filter((item): item is string => typeof item === "string")
    .join(" · ");
}

type ToolsReading = { tools: readonly string[] } | { error: string } | "loading";

function McpList(props: PaneProps<McpSpec>) {
  const surfaces = () => props.shell.store.surfaces;
  const servers = () => surfaces().state.mcp;
  const cursor = createCursor(() => servers().length);
  const [step, setStep] = createSignal(0);
  const [opened, setOpened] = createSignal<Record<string, ToolsReading>>({});
  const [notice, setNotice] = createSignal<string>();
  const [busy, setBusy] = createSignal<string>();
  const atCursor = (): McpServerStatus | undefined => servers()[cursor.index()];

  createEffect(() => {
    if (!servers().some((server) => server.state === "connecting") || prefersReducedMotion()) {
      return;
    }
    const timer = setInterval(() => setStep((at) => at + 1), tileFillStepMs);
    onCleanup(() => clearInterval(timer));
  });

  const say = (text: string): void => {
    setNotice(text);
  };

  const listTools = async (server: McpServerStatus): Promise<void> => {
    if (opened()[server.name] !== undefined) {
      setOpened((current) => withoutKey(current, server.name));
      return;
    }
    setOpened((current) => ({ ...current, [server.name]: "loading" }));
    const reading = await surfaces().verbs.mcpServerTools(server.name);
    setOpened((current) => ({
      ...current,
      [server.name]: isSurfaceRefusal(reading) ? { error: reading.detail } : { tools: reading },
    }));
  };

  const restart = async (server: McpServerStatus): Promise<void> => {
    setBusy(server.name);
    const status = await surfaces().verbs.restartMcpServer(server.name);
    setBusy(undefined);
    say(isSurfaceRefusal(status) ? status.detail : `${server.name} restarted · ${status.state}`);
    await surfaces().refetch("mcp");
  };

  const toggle = async (server: McpServerStatus): Promise<void> => {
    setBusy(server.name);
    const status = await surfaces().verbs.setMcpServerEnabled(server.name, !server.enabled);
    setBusy(undefined);
    say(
      isSurfaceRefusal(status)
        ? status.detail
        : `${server.name} ${status.enabled ? "enabled" : "disabled"}`,
    );
    await surfaces().refetch("mcp");
  };

  props.onAction((action) => {
    const server = atCursor();
    switch (action) {
      case "mcp.down":
        return cursor.move(1);
      case "mcp.up":
        return cursor.move(-1);
      case "mcp.tools":
        if (server !== undefined) void listTools(server);
        return;
      case "mcp.restart":
        if (server !== undefined) void restart(server);
        return;
      case "mcp.toggle":
        if (server !== undefined) void toggle(server);
        return;
    }
  });

  return (
    <section class="kw-ov kw-mcp" aria-label="mcp servers">
      <Show
        when={servers().length > 0}
        fallback={<EmptyState line={mcpPane.emptyState(props.shell.keys)} />}
      >
        <div class="kw-ov-head">
          <span>{stateTally(servers())}</span>
          <span class="kw-ov-head-detail">enter tools · r restart · t toggle</span>
        </div>
        <ol class="kw-ov-list">
          <For each={servers()}>
            {(server, index) => (
              <>
                <OverviewRow
                  cursor={index() === cursor.index()}
                  muted={!server.enabled}
                  mark={
                    busy() === server.name
                      ? tileFill[step() % tileFill.length]
                      : serverMark(server, step())
                  }
                  density={serverDensity(server)}
                  aside={serverAside(server)}
                  onClick={() => {
                    cursor.set(index());
                    void listTools(server);
                  }}
                >
                  {server.name}
                </OverviewRow>
                <Show when={server.lastError}>
                  {(error) => <SubLine text={error()} tone="error" />}
                </Show>
                <Show when={opened()[server.name]}>
                  {(reading) => <SubLine text={toolsLine(reading())} />}
                </Show>
              </>
            )}
          </For>
        </ol>
      </Show>
      <NoticeLine text={surfaces().state.notices.mcp} tone="error" />
      <NoticeLine text={notice()} />
    </section>
  );
}

function toolsLine(reading: ToolsReading): string {
  if (reading === "loading") return "listing tools…";
  if ("error" in reading) return reading.error;
  return reading.tools.length === 0 ? "no tools advertised" : reading.tools.join("  ");
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _dropped, ...rest } = record;
  return rest;
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
