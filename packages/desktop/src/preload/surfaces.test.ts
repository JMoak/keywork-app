import { describe, expect, it } from "vitest";
import * as contract from "../../../ui/src/surfaces/port.ts";
import * as mirror from "../main/surfaces/channels.ts";
import { surfaceChannels } from "../main/surfaces/channels.ts";
import { type SurfacesIpc, surfacesPort } from "./surfaces.ts";

function fakeIpc() {
  const invoked: Array<[string, unknown[]]> = [];
  const sent: Array<[string, unknown[]]> = [];
  const listeners = new Map<string, Set<(event: unknown, payload: unknown) => void>>();
  const ipc = {
    invoke: async (channel: string, ...payload: unknown[]) => {
      invoked.push([channel, payload]);
    },
    send: (channel: string, ...payload: unknown[]) => void sent.push([channel, payload]),
    on: (channel: string, listener: (event: unknown, payload: unknown) => void) => {
      listeners.set(channel, (listeners.get(channel) ?? new Set()).add(listener));
    },
    removeListener: (channel: string, listener: (event: unknown, payload: unknown) => void) => {
      listeners.get(channel)?.delete(listener);
    },
  };
  const push = (channel: string, payload: unknown): void => {
    for (const listener of listeners.get(channel) ?? []) listener({}, payload);
  };
  const listening = (channel: string): number => listeners.get(channel)?.size ?? 0;
  return { ipc: ipc as unknown as SurfacesIpc, invoked, sent, push, listening };
}

const show: mirror.SurfaceShow = {
  id: "kw-surface:1",
  bounds: { x: 10, y: 20, width: 480, height: 360 },
  origin: "creature",
  focus: false,
  follows: true,
  backdrop: "backdrop-token",
  title: "notes",
};

describe("surfacesPort", () => {
  it("asks main for each command on its own channel, with the request whole", async () => {
    const { ipc, invoked } = fakeIpc();
    const port = surfacesPort(ipc);
    const glide = { moves: [{ id: "kw-surface:1", bounds: show.bounds }], durationMs: 220 };
    await port.desk();
    await port.show(show);
    await port.glide(glide);
    await port.hide("kw-surface:1");
    await port.focus("kw-surface:1");
    await port.focusConsole();
    await port.close("kw-surface:1");
    expect(invoked).toEqual([
      [surfaceChannels.desk, []],
      [surfaceChannels.show, [show]],
      [surfaceChannels.glide, [glide]],
      [surfaceChannels.hide, ["kw-surface:1"]],
      [surfaceChannels.focus, ["kw-surface:1"]],
      [surfaceChannels.focusConsole, []],
      [surfaceChannels.close, ["kw-surface:1"]],
    ]);
  });

  it("asks main to restack panes on a channel of its own, with the order whole", async () => {
    const { ipc, invoked } = fakeIpc();
    await surfacesPort(ipc).stack?.(["kw-surface:2", "kw-surface:1"]);
    expect(invoked).toEqual([[surfaceChannels.stack, [["kw-surface:2", "kw-surface:1"]]]]);
  });

  it("asks main to move the console on a channel of its own, and hears when the app is leaving", async () => {
    const { ipc, invoked, push } = fakeIpc();
    const port = surfacesPort(ipc);
    const move = { bounds: show.bounds, maximized: false, durationMs: 180 };
    let leaving = 0;
    const stop = port.onLeaving?.(() => {
      leaving += 1;
    });
    await port.moveConsole?.(move);
    push(surfaceChannels.leaving, null);
    stop?.();
    push(surfaceChannels.leaving, null);
    expect(invoked).toEqual([[surfaceChannels.moveConsole, [move]]]);
    expect(leaving).toBe(1);
  });

  it("relays pane events until unsubscribed", () => {
    const { ipc, push, listening } = fakeIpc();
    const seen: unknown[] = [];
    const port = surfacesPort(ipc);
    const quiet = listening(surfaceChannels.event);
    const stop = port.onEvent((event) => seen.push(event));
    push(surfaceChannels.event, { kind: "ready", id: "kw-surface:1" });
    stop();
    push(surfaceChannels.event, { kind: "focused", id: "kw-surface:1" });
    expect(seen).toEqual([{ kind: "ready", id: "kw-surface:1" }]);
    expect(listening(surfaceChannels.event)).toBe(quiet);
  });

  it("tells main a closed pane is home in the turn the page's listeners hear of it, and for no other event", () => {
    const { ipc, sent, push } = fakeIpc();
    const order: string[] = [];
    const port = surfacesPort(ipc);
    port.onEvent((event) => order.push(`first heard ${event.kind}`));
    port.onEvent((event) => order.push(`second heard ${event.kind}`));
    push(surfaceChannels.event, { kind: "moved", id: "kw-surface:1" });
    expect(sent).toEqual([]);
    push(surfaceChannels.event, { kind: "closed", id: "kw-surface:1" });
    expect(order.slice(-2)).toEqual(["first heard closed", "second heard closed"]);
    expect(sent).toEqual([[surfaceChannels.broughtHome, ["kw-surface:1"]]]);
  });

  it("still tells main when a listener of the page's throws", () => {
    const { ipc, sent, push } = fakeIpc();
    surfacesPort(ipc).onEvent(() => {
      throw new Error("the pane could not come home");
    });
    expect(() => push(surfaceChannels.event, { kind: "closed", id: "kw-surface:1" })).toThrow();
    expect(sent).toEqual([[surfaceChannels.broughtHome, ["kw-surface:1"]]]);
  });

  it("tells main to watch the desk when a page subscribes to it", () => {
    const { ipc, sent, push, listening } = fakeIpc();
    const seen: unknown[] = [];
    const stop = surfacesPort(ipc).onDeskChanged((desk) => seen.push(desk));
    expect(sent).toEqual([[surfaceChannels.watchDesk, []]]);
    push(surfaceChannels.deskChanged, { consoleMaximized: false });
    stop();
    expect(seen).toEqual([{ consoleMaximized: false }]);
    expect(listening(surfaceChannels.deskChanged)).toBe(0);
  });
});

describe("main's copy of the contract", () => {
  it("names the window and its blank page as the console's page does", () => {
    expect(mirror.surfaceFramePrefix).toBe(contract.surfaceFramePrefix);
    expect(mirror.surfacePageUrl).toBe(contract.surfacePageUrl);
    for (const frameName of ["kw-surface:1", "kw-surface:", "surface:1", ""]) {
      expect(mirror.isSurfaceFrame(frameName)).toBe(contract.isSurfaceFrame(frameName));
    }
  });

  it("is the port the console's page was written against, in both directions", () => {
    const built: contract.SurfacesPort = surfacesPort(fakeIpc().ipc);
    const expected: mirror.SurfacesPort = built;
    const request: contract.SurfaceShow = show;
    const event: mirror.SurfaceEvent = {} as contract.SurfaceEvent;
    const back: contract.SurfaceEvent = {} as mirror.SurfaceEvent;
    const desk: mirror.Desk = {} as contract.Desk;
    const deskBack: contract.Desk = {} as mirror.Desk;
    const glide: mirror.Glide = {} as contract.Glide;
    const glideBack: contract.Glide = {} as mirror.Glide;
    expect([expected, request, event, back, desk, deskBack, glide, glideBack]).toHaveLength(8);
  });

  it("has every member the page may leave out, a frame colour and a stacking order among them", () => {
    const show: Exactly<mirror.SurfaceShow, contract.SurfaceShow> = true;
    const port: Exactly<mirror.SurfacesPort, contract.SurfacesPort> = true;
    expect([show, port]).toEqual([true, true]);
    expect(surfacesPort(fakeIpc().ipc).stack).toBeTypeOf("function");
  });
});

type Exactly<Mirror, Contract> =
  (<Probe>() => Probe extends Mirror ? 1 : 2) extends <Probe>() => Probe extends Contract ? 1 : 2
    ? true
    : false;
