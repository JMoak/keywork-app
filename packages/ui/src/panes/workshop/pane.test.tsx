import type { BusEnvelope, SessionRow } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { type CompanionController, createCompanionController } from "../../companion/floating.ts";
import { browserHost } from "../../host/browser.ts";
import type { HostPort, ServerRequestInit, ServerResponseHead } from "../../host/port.ts";
import { inertFeed, inertShellExtras } from "../../shell/trust-testing.ts";
import type { PaneSpecBase, ShellSeams } from "../registry.ts";
import { houseOffsetMinutes } from "../stead/habitat.ts";
import { raisedWord } from "./copy.ts";
import { type WorkshopSpec, workshopPane } from "./index.tsx";
import type { WorkshopRecord } from "./port.ts";
import {
  atMinutesBeforeNoon,
  bareDetail,
  bareTerminalRule,
  bareWorkshop,
  healthOf,
  sealedDetail,
  sealedWorkshop,
  threadRow,
} from "./testing.ts";

afterEach(cleanup);

interface Answer {
  readonly status: number;
  readonly body?: unknown;
  readonly stream?: SseStream;
}

type Route = Answer | ((body: unknown) => Answer);

interface FakeServer {
  readonly serverFetch: HostPort["serverFetch"];
  readonly calls: string[];
  set(key: string, route: Route): void;
}

interface SseStream {
  readonly head: ServerResponseHead;
  push(text: string): void;
  end(): void;
  cancelled(): boolean;
}

function fakeServer(routes: Record<string, Route>): FakeServer {
  const table = new Map(Object.entries(routes));
  const calls: string[] = [];
  const serverFetch = async (
    _workspace: string,
    path: string,
    init: ServerRequestInit,
  ): Promise<ServerResponseHead> => {
    const key = `${init.method ?? "GET"} ${path}`;
    calls.push(key);
    const route = table.get(key);
    const answer =
      route === undefined
        ? { status: 404, body: { refused: "missing", error: `no route ${key}` } }
        : typeof route === "function"
          ? route(init.body === undefined ? undefined : JSON.parse(init.body))
          : route;
    return answer.stream?.head ?? jsonHead(answer);
  };
  return { serverFetch, calls, set: (key, route) => void table.set(key, route) };
}

function jsonHead(answer: Answer): ServerResponseHead {
  const chunks = [new TextEncoder().encode(JSON.stringify(answer.body ?? null))];
  return {
    status: answer.status,
    statusText: "",
    headers: [["content-type", "application/json"]],
    read: async () => chunks.shift(),
    cancel: () => undefined,
  };
}

function sseStream(status = 200): SseStream {
  const waiting: Array<(chunk: Uint8Array | undefined) => void> = [];
  const queued: Array<Uint8Array | undefined> = [];
  let cancelled = false;
  const hand = (chunk: Uint8Array | undefined): void => {
    const waiter = waiting.shift();
    if (waiter === undefined) queued.push(chunk);
    else waiter(chunk);
  };
  return {
    head: {
      status,
      statusText: "",
      headers: [["content-type", "text/event-stream; charset=utf-8"]],
      read: () =>
        new Promise((resolve) => {
          if (queued.length > 0) resolve(queued.shift());
          else waiting.push(resolve);
        }),
      cancel: () => {
        cancelled = true;
        hand(undefined);
      },
    },
    push: (text) => hand(new TextEncoder().encode(text)),
    end: () => hand(undefined),
    cancelled: () => cancelled,
  };
}

function fakeFeed() {
  const listeners = new Set<(envelopes: readonly BusEnvelope[]) => void>();
  return {
    feed: {
      ...inertFeed(),
      subscribe: (listener: (envelopes: readonly BusEnvelope[]) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    emit: (envelopes: readonly BusEnvelope[]): void => {
      for (const listener of [...listeners]) listener(envelopes);
    },
  };
}

const chordWords: Readonly<Record<string, string>> = {
  "workshop.start": "s",
  "workshop.stop": "shift+s",
  "workshop.display": "d",
  "workshop.files": "f",
  "workshop.terminal": "t",
  "workshop.raise": "r",
  "workshop.remove": "x",
  "workshop.next": "]",
  "workshop.previous": "[",
};

interface Harness {
  readonly shell: ShellSeams;
  readonly companion: CompanionController;
  readonly server: FakeServer;
  readonly opened: PaneSpecBase[];
  readonly rebound: PaneSpecBase[];
  readonly external: string[];
  emit(envelopes: readonly BusEnvelope[]): void;
}

function harness(server: FakeServer, summaries: readonly SessionRow[] = []): Harness {
  const feed = fakeFeed();
  const opened: PaneSpecBase[] = [];
  const rebound: PaneSpecBase[] = [];
  const external: string[] = [];
  const host = browserHost({ server: { url: "http://127.0.0.1:4770", token: "t" } });
  host.serverFetch = server.serverFetch;
  host.openExternal = async (url) => void external.push(url);
  const companion = createCompanionController();
  const shell: ShellSeams = {
    companion,
    store: {
      state: { summaries, projections: {}, loading: {}, gap: undefined, lost: undefined },
      summary: (id: string | undefined) => summaries.find((summary) => summary.id === id),
    } as unknown as ShellSeams["store"],
    keys: { chord: (action) => chordWords[action] ?? `ctrl+k ${action}`, leader: () => "ctrl+k" },
    sessions: { openSession: () => {}, newSession: async () => {}, startSession: async () => {} },
    host,
    workspace: "C:/work",
    currentSession: () => undefined,
    focusedPane: () => undefined,
    rebind: (_paneId, spec) => void rebound.push(spec),
    unseen: () => false,
    ...inertShellExtras({ feed: feed.feed, openPane: (spec) => void opened.push(spec) }),
  };
  return { shell, companion, server, opened, rebound, external, emit: feed.emit };
}

function mount(spec: WorkshopSpec, h: Harness) {
  let act: (action: string) => void = () => {};
  const view = render(() => (
    <workshopPane.component
      id="p1"
      spec={spec}
      focused={true}
      shell={h.shell}
      onAction={(handler) => {
        act = handler;
      }}
    />
  ));
  return { ...view, act: (action: string) => act(action) };
}

function servingWorkshops(records: readonly WorkshopRecord[]): FakeServer {
  const routes: Record<string, Route> = {
    "GET /workshops": { status: 200, body: { workshops: records } },
    "GET /doc": { status: 200, body: { paths: {} } },
  };
  for (const record of records) {
    routes[`GET /workshops/${record.id}/health`] = { status: 200, body: healthOf(record, "up") };
  }
  return fakeServer(routes);
}

function changed(change: string, workshop: WorkshopRecord): BusEnvelope {
  return {
    id: 1,
    ts: "t",
    sessionId: "",
    type: "workshop.changed",
    payload: { change, workshop },
  } as unknown as BusEnvelope;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const detailDoc = {
  paths: {
    "/workshops/{id}": { get: { operationId: "readWorkshop" } },
    "/workshops/{id}/exec": { post: { operationId: "execInWorkshop" } },
  },
};

const headText = (container: HTMLElement) =>
  container.querySelector(".kw-workshop-lead")?.textContent ?? "";
const noticeText = (container: HTMLElement) =>
  container.querySelector(".kw-ov-line")?.textContent ?? "";
const roomLines = (container: HTMLElement, room: string) =>
  [...container.querySelectorAll(`[data-room="${room}"] .kw-workshop-line`)].map(
    (line) => line.textContent,
  );
const elsewhereLines = (container: HTMLElement) =>
  [...container.querySelectorAll(".kw-workshop-elsewhere .kw-workshop-line")].map(
    (line) => line.textContent,
  );

const neighbourWorkshop: WorkshopRecord = {
  ...bareWorkshop,
  id: "bea-dc1057",
  creature: "bea",
  state: "stopped",
  workdir: "C:\\Users\\keeper\\.keywork\\node\\workshops\\bea-dc1057\\home",
  createdAt: "2026-11-05T06:21:41.700Z",
};

const wrenHome = { slug: "wren", workshop: bareWorkshop.id };
const tamHome = { slug: "tam", workshop: sealedWorkshop.id };

const limits = (container: HTMLElement) =>
  [...container.querySelectorAll(".kw-workshop-limit")].map((item) => item.textContent);

describe("the workshop pane", () => {
  it("shows a bare host plainly: its limitations, the step that seals it, and its health", async () => {
    const h = harness(servingWorkshops([bareWorkshop]));
    const { container } = mount({ kind: "workshop", creature: "wren" }, h);
    await waitFor(() => expect(headText(container)).toContain("· up ·"));
    expect(headText(container)).toBe(
      `bare host · running · up · raised ${raisedWord(bareWorkshop.createdAt, houseOffsetMinutes())}`,
    );
    expect(limits(container)).toEqual([
      "bare host: no VM boundary, no egress policy and no credential proxy; brokered credentials appear only as sentinels",
      "commands run unconfined: windows has no sandbox keywork can use",
      "to seal it: install the sbx CLI (on Windows, turn on Windows Hypervisor Platform first), then raise the workshop again",
    ]);
    expect(roomLines(container, "display")).toEqual(["no display · a bare host workshop has none"]);
    expect(roomLines(container, "files")).toEqual([
      bareWorkshop.workdir,
      "f opens it in your file browser",
    ]);
    expect(roomLines(container, "egress")).toEqual(["none · a bare host has no egress policy"]);
    expect(roomLines(container, "brokers")).toEqual([
      "anthropic · names only; the values stay on the node and the workshop sees sentinels",
    ]);
    expect(container.querySelector('[data-room="disk and memory"]')?.textContent).toContain(
      "disknot reported by this node",
    );
    expect(container.querySelector(".kw-workshop")?.getAttribute("data-health")).toBe("up");
    expect(container.querySelector('[data-room="snapshots"]')).toBeNull();
    expect(h.server.calls).toEqual([
      "GET /workshops",
      "GET /creatures",
      "GET /doc",
      "GET /workshops/wren-0a1b2c/health",
    ]);
    expect(workshopPane.adornments?.({ kind: "workshop", creature: "wren" }, h.shell)).toEqual({
      modeWord: "host",
    });
  });

  it("starts and stops from its keys and follows workshop.changed from the feed", async () => {
    const stopped = { ...bareWorkshop, state: "stopped" as const };
    const server = servingWorkshops([stopped]);
    server.set("POST /workshops/wren-0a1b2c/start", { status: 200, body: bareWorkshop });
    server.set("POST /workshops/wren-0a1b2c/stop", { status: 200, body: stopped });
    const h = harness(server);
    const { container, act } = mount({ kind: "workshop", creature: "wren" }, h);
    await waitFor(() => expect(headText(container)).toContain("stopped"));
    act("workshop.start");
    await waitFor(() => expect(headText(container)).toContain("· running ·"));
    act("workshop.stop");
    await waitFor(() => expect(headText(container)).toContain("· stopped ·"));
    expect(h.server.calls).toContain("POST /workshops/wren-0a1b2c/start");
    expect(h.server.calls).toContain("POST /workshops/wren-0a1b2c/stop");
    h.emit([changed("created", sealedWorkshop)]);
    await settle();
    expect(container.querySelector(".kw-workshop-place")?.textContent).toBe(
      "1 of 2 on this node · ] next · [ previous",
    );
    act("workshop.next");
    expect(h.rebound.at(-1)).toEqual({ kind: "workshop", creature: "tam" });
    h.emit([changed("removed", stopped)]);
    await settle();
    expect(container.querySelector(".kw-empty")?.textContent).toBe(
      "No workshop for wren yet · raise one with r",
    );
  });

  it("says why a start was refused, in the node's words", async () => {
    const server = servingWorkshops([{ ...bareWorkshop, state: "stopped" }]);
    server.set("POST /workshops/wren-0a1b2c/start", {
      status: 502,
      body: {
        refused: "failed",
        error: "workshop wren-0a1b2c started but its setup script failed",
      },
    });
    const h = harness(server);
    const { container, act } = mount({ kind: "workshop", creature: "wren" }, h);
    await waitFor(() => expect(headText(container)).toContain("stopped"));
    act("workshop.start");
    await waitFor(() =>
      expect(noticeText(container)).toBe(
        "could not start it · workshop wren-0a1b2c started but its setup script failed",
      ),
    );
  });

  it("opens the window on a sealed display as a snapshot stream, shows watching, and closes it", async () => {
    const server = servingWorkshops([sealedWorkshop]);
    const stream = sseStream();
    server.set("GET /workshops/tam-9f8e7d/display", { status: 200, stream });
    const h = harness(server);
    const { container, act } = mount({ kind: "workshop", creature: "tam" }, h);
    await waitFor(() => expect(headText(container)).toContain("sealed microVM"));
    expect(roomLines(container, "display")).toEqual(["d opens the window · view only"]);
    act("workshop.display");
    await waitFor(() => expect(roomLines(container, "display")).toEqual(["opening the window"]));
    stream.push(": connected\n\n");
    stream.push(`event: frame\ndata: {"png":"AAAA","at":"${atMinutesBeforeNoon(0)}"}\n\n`);
    await waitFor(() =>
      expect(container.querySelector("img.kw-workshop-frame")?.getAttribute("src")).toBe(
        "data:image/png;base64,AAAA",
      ),
    );
    const line = container.querySelector('[data-room="display"] .kw-workshop-line');
    expect(line?.textContent).toMatch(
      /^watching · view only · 1 fps · frame at .* · d closes it · taking over waits for the screen viewer$/,
    );
    expect(line?.getAttribute("data-tone")).toBe("live");
    act("workshop.display");
    await waitFor(() =>
      expect(roomLines(container, "display")).toEqual(["d opens the window · view only"]),
    );
    expect(stream.cancelled()).toBe(true);
    expect(container.querySelector("img.kw-workshop-frame")).toBeNull();
  });

  it("says when the display goes away and when the node refuses to stream it", async () => {
    const server = servingWorkshops([sealedWorkshop]);
    const stream = sseStream();
    server.set("GET /workshops/tam-9f8e7d/display", { status: 200, stream });
    const h = harness(server);
    const { container, act } = mount({ kind: "workshop", creature: "tam" }, h);
    await waitFor(() => expect(headText(container)).toContain("sealed microVM"));
    act("workshop.display");
    await settle();
    stream.push('event: ended\ndata: {"error":"Xvfb exited"}\n\n');
    await waitFor(() =>
      expect(roomLines(container, "display")).toEqual(["the display went away · Xvfb exited"]),
    );
    server.set("GET /workshops/tam-9f8e7d/display", {
      status: 503,
      body: { refused: "unavailable", error: "a sbx workshop has no display" },
    });
    act("workshop.display");
    await waitFor(() =>
      expect(roomLines(container, "display")).toEqual([
        "no display · a sbx workshop has no display",
      ]),
    );
  });

  it("refuses the window plainly when there is no display or the workshop is dark", async () => {
    const dark = { ...sealedWorkshop, state: "stopped" as const };
    const h = harness(servingWorkshops([bareWorkshop, dark]));
    const bare = mount({ kind: "workshop", creature: "wren" }, h);
    await waitFor(() => expect(headText(bare.container)).toContain("bare host"));
    bare.act("workshop.display");
    expect(noticeText(bare.container)).toBe("no display · a bare host workshop has none");
    bare.unmount();
    const sealed = mount({ kind: "workshop", creature: "tam" }, h);
    await waitFor(() => expect(headText(sealed.container)).toContain("sealed microVM"));
    expect(roomLines(sealed.container, "display")).toEqual([
      "display dark while the workshop is stopped · s starts it",
    ]);
    sealed.act("workshop.display");
    expect(noticeText(sealed.container)).toBe(
      "display dark while the workshop is stopped · s starts it",
    );
    expect(h.server.calls.filter((call) => call.endsWith("/display"))).toEqual([]);
  });

  it("opens a bare host's files in the file browser and never pretends to for a microVM", async () => {
    const h = harness(servingWorkshops([bareWorkshop, sealedWorkshop]));
    const bare = mount({ kind: "workshop", creature: "wren" }, h);
    await waitFor(() => expect(headText(bare.container)).toContain("bare host"));
    bare.act("workshop.files");
    await settle();
    expect(h.external).toEqual([
      "file:///C:/Users/keeper/.keywork/state/workshops/wren-0a1b2c/home",
    ]);
    bare.unmount();
    const sealed = mount({ kind: "workshop", creature: "tam" }, h);
    await waitFor(() => expect(headText(sealed.container)).toContain("sealed microVM"));
    expect(roomLines(sealed.container, "files")).toEqual([
      "/home/agent/workspace inside the sealed microVM",
      "not reachable from this console · the creature's threads read and write it",
    ]);
    sealed.act("workshop.files");
    expect(noticeText(sealed.container)).toBe(
      "files inside a sealed microVM are not served to this console yet",
    );
    expect(h.external).toHaveLength(1);
  });

  it("lists the creature's threads in the workshop and mirrors the newest in a terminal pane", async () => {
    const rows = [
      threadRow("t1", "docs index", "wren", {
        lastActivityAt: atMinutesBeforeNoon(25),
        costNanos: 120_000_000,
      }),
      threadRow("t2", "fix the flaky trash test", "wren", {
        lastActivityAt: atMinutesBeforeNoon(2),
        working: true,
        live: true,
        costNanos: 300_000_000,
      }),
      threadRow("t3", "nightly", "tam", { working: true }),
    ];
    const h = harness(servingWorkshops([bareWorkshop]), rows);
    const { container, act } = mount({ kind: "workshop", creature: "wren" }, h);
    await waitFor(() => expect(headText(container)).toContain("bare host"));
    expect(roomLines(container, "terminal")[0]).toBe(
      "2 threads of wren in the workshop · t mirrors the newest bash",
    );
    expect(
      [...container.querySelectorAll(".kw-workshop-thread")].map(
        (row) => row.querySelector(".kw-workshop-thread-title")?.textContent,
      ),
    ).toEqual(["fix the flaky trash test", "docs index"]);
    expect(roomLines(container, "terminal").at(-1)).toBe(
      "typing into the workshop is not served by this node yet · the mirror shows the engine's own bash in it",
    );
    expect(container.querySelector('[data-room="disk and memory"]')?.textContent).toContain(
      "threads2cost0.42 USD",
    );
    act("workshop.terminal");
    expect(h.opened).toEqual([{ kind: "terminal", mode: "mirror", sessionId: "t2" }]);
  });

  it("says so when no thread of the creature runs in the workshop", async () => {
    const h = harness(servingWorkshops([bareWorkshop]));
    const { container, act } = mount({ kind: "workshop", creature: "wren" }, h);
    await waitFor(() => expect(headText(container)).toContain("bare host"));
    expect(roomLines(container, "terminal")[0]).toBe("no thread of wren runs in the workshop yet");
    act("workshop.terminal");
    expect(noticeText(container)).toBe("no thread of wren to mirror yet");
    expect(h.opened).toEqual([]);
  });

  it("raises a workshop sealed when the node can and bare when it cannot, then binds to it", async () => {
    const server = servingWorkshops([]);
    const asked: unknown[] = [];
    server.set("POST /workshops", (body) => {
      asked.push(body);
      const spec = body as { substrate: string };
      return spec.substrate === "sbx"
        ? {
            status: 503,
            body: { refused: "unavailable", error: "this node has no sbx substrate" },
          }
        : { status: 201, body: { ...bareWorkshop, state: "stopped" } };
    });
    server.set("GET /workshops/wren-0a1b2c/health", {
      status: 200,
      body: healthOf(bareWorkshop, "down"),
    });
    const h = harness(server);
    const { container, act } = mount({ kind: "workshop", creature: "wren" }, h);
    await waitFor(() =>
      expect(container.querySelector(".kw-empty")?.textContent).toBe(
        "No workshop for wren yet · raise one with r",
      ),
    );
    act("workshop.raise");
    await waitFor(() => expect(headText(container)).toContain("bare host · stopped · down"));
    expect(asked).toEqual([
      { creature: "wren", substrate: "sbx" },
      { creature: "wren", substrate: "host" },
    ]);
    expect(noticeText(container)).toBe("raised a bare host for wren · wren-0a1b2c");
    expect(h.rebound).toContainEqual({ kind: "workshop", creature: "wren" });
  });

  it("asks which creature when summoned bare on a node with no workshop", async () => {
    const server = servingWorkshops([]);
    const asked: unknown[] = [];
    server.set("POST /workshops", (body) => {
      asked.push(body);
      return { status: 201, body: { ...sealedWorkshop, creature: "moss", id: "moss-111111" } };
    });
    server.set("GET /workshops/moss-111111/health", {
      status: 200,
      body: healthOf(sealedWorkshop, "starting"),
    });
    const h = harness(server);
    const { container, act } = mount({ kind: "workshop" }, h);
    await waitFor(() =>
      expect(container.querySelector(".kw-empty")?.textContent).toBe(
        "No workshop yet · raise one with r",
      ),
    );
    act("workshop.raise");
    const input = container.querySelector(".kw-ov-draft input") as HTMLInputElement;
    expect(input.getAttribute("aria-label")).toBe("raise a workshop for which creature?");
    fireEvent.input(input, { target: { value: "moss" } });
    fireEvent.submit(container.querySelector(".kw-ov-draft") as HTMLFormElement);
    await waitFor(() =>
      expect(noticeText(container)).toContain("raised a sealed microVM for moss"),
    );
    expect(asked).toEqual([{ creature: "moss", substrate: "sbx" }]);
    expect(h.rebound.at(-1)).toEqual({ kind: "workshop", creature: "moss" });
  });

  it("removes the workshop after one question, keeping or wiping its disk", async () => {
    const server = servingWorkshops([bareWorkshop]);
    server.set("DELETE /workshops/wren-0a1b2c?keepDisk=true", {
      status: 200,
      body: { id: "wren-0a1b2c", keptDisk: true },
    });
    const h = harness(server);
    const { container, act } = mount({ kind: "workshop", creature: "wren" }, h);
    await waitFor(() => expect(headText(container)).toContain("bare host"));
    act("workshop.remove");
    const question = container.querySelector('.kw-ov-line[data-tone="ask"]') as HTMLElement;
    expect(question.textContent).toBe(
      "remove the workshop of wren? · k keeps its disk · w wipes everything inside · any other key cancels",
    );
    fireEvent.keyDown(question, { key: "Escape" });
    expect(container.querySelector('.kw-ov-line[data-tone="ask"]')).toBeNull();
    expect(h.server.calls.some((call) => call.startsWith("DELETE"))).toBe(false);
    act("workshop.remove");
    fireEvent.keyDown(container.querySelector('.kw-ov-line[data-tone="ask"]') as Element, {
      key: "k",
    });
    await waitFor(() =>
      expect(noticeText(container)).toBe(
        "removed · its disk is kept under workshops-kept on the node",
      ),
    );
    expect(h.server.calls).toContain("DELETE /workshops/wren-0a1b2c?keepDisk=true");
    expect(container.querySelector(".kw-empty")?.textContent).toBe(
      "No workshop for wren yet · raise one with r",
    );
  });

  it("shows the snapshots room only when the node serves one", async () => {
    const server = servingWorkshops([sealedWorkshop]);
    server.set("GET /doc", {
      status: 200,
      body: {
        paths: { "/workshops/{id}/snapshots": { post: { operationId: "snapshotWorkshop" } } },
      },
    });
    const h = harness(server);
    const { container } = mount({ kind: "workshop", creature: "tam" }, h);
    await waitFor(() =>
      expect(roomLines(container, "snapshots")).toEqual([
        "served by this node but not read by this pane yet",
      ]),
    );
  });

  it("reads the detail a node serves: egress, refusals, disk and memory, and the terminal grant rule", async () => {
    const server = servingWorkshops([bareWorkshop]);
    server.set("GET /doc", { status: 200, body: detailDoc });
    server.set("GET /workshops/wren-0a1b2c", { status: 200, body: bareDetail });
    const h = harness(server);
    const { container, act } = mount({ kind: "workshop", creature: "wren" }, h);
    await waitFor(() =>
      expect(roomLines(container, "egress")).toEqual([
        "none · a bare host has no egress policy",
        "brokers reach api.anthropic.com",
      ]),
    );
    expect(roomLines(container, "refusals")).toEqual([
      expect.stringMatching(
        /^.* · exec refused \(forbidden\) · a bare host refuses typed commands/,
      ),
      "a bare host refuses no connections",
    ]);
    const ledger = container.querySelector('[data-room="disk and memory"]')?.textContent ?? "";
    expect(ledger).toContain("disk1.5 GB used");
    expect(ledger).toContain("memorynot measured · a bare host shares the machine's memory");
    expect(roomLines(container, "terminal").at(-1)).toBe(
      `typing is refused by this node · ${bareTerminalRule}`,
    );
    act("workshop.terminal");
    expect(noticeText(container)).toBe(`could not type into it · ${bareTerminalRule}`);
    expect(container.querySelector(".kw-ov-draft")).toBeNull();
    expect(h.opened).toEqual([]);
    expect(h.server.calls.filter((call) => call.startsWith("POST"))).toEqual([]);
  });

  it("types a command into a workshop whose node allows it, shows the run, and re-reads the log", async () => {
    const server = servingWorkshops([sealedWorkshop]);
    server.set("GET /doc", { status: 200, body: detailDoc });
    server.set("GET /workshops/tam-9f8e7d", { status: 200, body: sealedDetail });
    const typedIn: unknown[] = [];
    server.set("POST /workshops/tam-9f8e7d/exec", (body) => {
      typedIn.push(body);
      return {
        status: 200,
        body: {
          workshop: "tam-9f8e7d",
          code: 0,
          stdout: "home\nwork\n",
          stderr: "",
          timedOut: false,
        },
      };
    });
    const h = harness(server);
    const { container, act } = mount({ kind: "workshop", creature: "tam" }, h);
    await waitFor(() =>
      expect(roomLines(container, "terminal")).toEqual([
        "no thread of tam runs in the workshop yet · t types a command into it",
        "typed commands run as the creature's bash would · a microVM takes typed commands without a rule",
        expect.stringMatching(/^.* · pwd · exit 0$/),
      ]),
    );
    expect(roomLines(container, "egress")).toEqual([
      "deny-all · enforced by the microVM",
      "allows registry.npmjs.org:443",
      "brokers reach api.anthropic.com, openrouter.ai",
    ]);
    expect(container.querySelector('[data-room="disk and memory"]')?.textContent).toContain(
      "disk3.0 GB used of 20.0 GBmemory512 MB used of 4.0 GB",
    );
    act("workshop.terminal");
    const input = container.querySelector(".kw-ov-draft input") as HTMLInputElement;
    expect(input.getAttribute("aria-label")).toBe("type a command for the workshop");
    fireEvent.input(input, { target: { value: "ls" } });
    fireEvent.submit(container.querySelector(".kw-ov-draft") as HTMLFormElement);
    await waitFor(() =>
      expect(container.querySelector(".kw-workshop-output")?.textContent).toBe(
        "$ ls\nhome\nwork\nexit 0",
      ),
    );
    expect(typedIn).toEqual([{ command: "ls" }]);
    expect(h.server.calls.filter((call) => call === "GET /workshops/tam-9f8e7d")).toHaveLength(2);
    expect(h.opened).toEqual([]);
  });

  it("says so when this node serves no workshops", async () => {
    const h = harness(
      fakeServer({
        "GET /workshops": { status: 503, body: { error: "workshops is not served by this host" } },
        "GET /doc": { status: 200, body: { paths: {} } },
      }),
    );
    const { container } = mount({ kind: "workshop", creature: "wren" }, h);
    await waitFor(() =>
      expect(container.querySelector(".kw-workshop-note")?.textContent).toBe(
        "could not read the workshops on this node · workshops is not served by this host",
      ),
    );
  });

  it("binds a bare summon to the first workshop on the node", async () => {
    const h = harness(servingWorkshops([bareWorkshop, sealedWorkshop]));
    const { container } = mount({ kind: "workshop" }, h);
    await waitFor(() => expect(headText(container)).toContain("bare host"));
    expect(h.rebound[0]).toEqual({ kind: "workshop", creature: "wren" });
  });

  it("binds a bare summon to the floating creature's workshop and lists other steads' apart", async () => {
    const server = servingWorkshops([neighbourWorkshop, bareWorkshop, sealedWorkshop]);
    server.set("GET /creatures", { status: 200, body: { creatures: [wrenHome, tamHome] } });
    const h = harness(server);
    h.companion.noteFloating("tam");
    try {
      const { container } = mount({ kind: "workshop" }, h);
      await waitFor(() => expect(h.rebound[0]).toEqual({ kind: "workshop", creature: "tam" }));
      expect(headText(container)).toContain("sealed microVM");
      expect(container.querySelector(".kw-workshop-place")?.textContent).toBe(
        "2 of 2 on this node · ] next · [ previous",
      );
      expect(container.querySelector(".kw-workshop-elsewhere-name")?.textContent).toBe(
        "other workshops on this node",
      );
      expect(elsewhereLines(container)).toEqual([
        expect.stringMatching(/^bea · bea-dc1057 · bare host · stopped · raised /),
      ]);
    } finally {
      h.companion.noteFloating(undefined);
    }
  });

  it("never binds a bare summon to another stead's workshop", async () => {
    const server = servingWorkshops([neighbourWorkshop]);
    server.set("GET /creatures", {
      status: 200,
      body: { creatures: [{ slug: "osk", workshop: "osk-eb9e61" }] },
    });
    const h = harness(server);
    const { container } = mount({ kind: "workshop" }, h);
    await waitFor(() => expect(elsewhereLines(container)).toHaveLength(1));
    expect(container.textContent).toContain("No workshop yet · raise one with r");
    expect(h.rebound).toEqual([]);
  });

  it("shows another stead's workshop only when named, and walks this stead's alone", async () => {
    const server = servingWorkshops([neighbourWorkshop, bareWorkshop, sealedWorkshop]);
    server.set("GET /creatures", { status: 200, body: { creatures: [wrenHome, tamHome] } });
    const h = harness(server);
    const named = mount({ kind: "workshop", creature: "bea" }, h);
    await waitFor(() => expect(headText(named.container)).toContain("stopped"));
    expect(named.container.querySelector(".kw-workshop-place")).toBeNull();
    expect(elsewhereLines(named.container)).toEqual([]);
    named.unmount();
    const ours = mount({ kind: "workshop", creature: "tam" }, h);
    await waitFor(() => expect(headText(ours.container)).toContain("sealed microVM"));
    ours.act("workshop.next");
    expect(h.rebound).toEqual([{ kind: "workshop", creature: "wren" }]);
  });

  it("is summoned with a creature, titled by it, and parses only its own spec", () => {
    const h = harness(servingWorkshops([]));
    expect(workshopPane.summon?.spec(h.shell, "wren")).toEqual({
      kind: "workshop",
      creature: "wren",
    });
    expect(workshopPane.summon?.spec(h.shell, undefined)).toEqual({ kind: "workshop" });
    expect(workshopPane.title({ kind: "workshop", creature: "wren" }, h.shell)).toBe(
      "workshop · wren",
    );
    expect(workshopPane.title({ kind: "workshop" }, h.shell)).toBe("workshop");
    expect(workshopPane.spec.safeParse({ kind: "workshop", creature: "" }).success).toBe(false);
    expect(workshopPane.spec.safeParse({ kind: "screen", peer: "x" }).success).toBe(false);
    expect(workshopPane.emptyState(h.shell.keys)).toBe("No workshop yet · raise one with r");
  });
});
