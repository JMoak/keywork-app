import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Fetch, ServerFeed } from "@keywork-app/client";
import type { BusEnvelope } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { tileFill } from "../../chrome/stamp.ts";
import { browserHost } from "../../host/browser.ts";
import type { HostPort } from "../../host/port.ts";
import type { KeyHints, PaneActionHandler, ShellSeams } from "../registry.ts";
import {
  begunBuild,
  census,
  type FakeMeshServer,
  fakeMeshServer,
  firstLightRunThree,
  fixtureClock,
  grantList,
  ids,
  meshEnvelope,
  ok,
  pairsReading,
  wrenGate,
} from "./fixtures.ts";
import { ParcelsBoard, parcelsPane } from "./index.tsx";
import { meshRoutesOver } from "./routes.ts";

afterEach(cleanup);

describe("the parcels pane", () => {
  it("draws every machine on the tailnet with identity, lane and pairing, and its roles and gates", async () => {
    const board = await loadedBoard();
    expect(rowTexts(board.container)).toEqual([
      "█ moak-main · Jordan Moak · windows here · claimed",
      "░ build-box · tag:ci · linux ░ DERP ord · unpaired",
      "▓ lab-mac · Jordan Moak · macOS ░ peer relay · pairing",
      "· old-laptop · Jordan Moak · windows offline · no node",
      "█ spark-ad4d · Jordan Moak · linux direct · claimed host",
    ]);
    expect(board.container.querySelectorAll(".kw-ov-row[data-muted]")).toHaveLength(1);
    expect(detailTexts(board.container)).toEqual([
      "roles house",
      "gate moss from spark-ad4d · screen:view · until 13:30",
      "audit 11:57 lab-mac allow pair.hello · identified",
      "audit 11:48 spark-ad4d allow screen:view · grant-moss",
      "audit 11:35 spark-ad4d deny exec · rm outside the grant",
      "code 105 377 · the console on lab-mac asks to pair; if it shows the same code, c confirms here",
      "roles host · pasture",
      "gate wren · exec bun, git status · files:read ~/src/** · until 18:00",
    ]);
    expect(board.container.querySelector(".kw-ov-head-lead")?.textContent).toBe(
      "5 parcels · 1 paired · 1 pairing · 2 gates open",
    );
    expect(board.container.querySelector(".kw-ov-head-detail")?.textContent).toBe(
      "p pair · c confirm · g gate · x revoke · u unpair",
    );
  });

  it("shows the audit rows of whichever parcel holds the cursor", async () => {
    const board = await loadedBoard();
    for (const _ of [1, 2, 3, 4]) board.act("parcels.down");
    expect(cursorName(board.container)).toBe("spark-ad4d");
    expect(detailTexts(board.container).filter((line) => line.startsWith("audit"))).toEqual([
      "audit 11:48 allow screen:view · grant-moss",
      "audit 11:35 deny exec · rm outside the grant",
      "audit 11:20 allow exec · grant-wren",
    ]);
  });

  it("begins pairing on p, shows the six-digit code, and completes on c once the keeper compares", async () => {
    const release = deferred();
    const server = fakeMeshServer();
    const board = await loadedBoard(server, async (input, init) => {
      if (input.endsWith("/complete")) await release.promise;
      return server.fetch(input, init);
    });
    board.act("parcels.down");
    board.act("parcels.pair");
    await waitFor(() => expect(board.container.textContent).toContain("code 482 913"));
    expect(server.callsTo("beginPairing")[0]?.body).toEqual({
      endpoint: "http://100.71.3.4:47800",
      stableId: ids.build,
      userId: null,
      tags: ["tag:ci"],
      role: "console",
    });
    expect(rowTexts(board.container)[1]).toBe("▓ build-box · tag:ci · linux ░ DERP ord · pairing");
    expect(detailTexts(board.container)).toContain(
      "code 482 913 · if build-box shows the same code, c confirms",
    );
    board.act("parcels.confirm");
    await waitFor(() =>
      expect(detailTexts(board.container)).toContain(
        "waiting for build-box to confirm the code there",
      ),
    );
    expect(tileFill).toContain(cursorMark(board.container));
    release.resolve();
    await waitFor(() => expect(lineTexts(board.container)).toContain("paired with build-box"));
    expect(server.callsTo("completePairing")[0]).toMatchObject({
      id: "attempt-build",
      body: { matches: true },
    });
    expect(detailTexts(board.container).join("\n")).not.toContain("482 913");
  });

  it("asks for the claim code when the parcel is headless and sends it with the confirmation", async () => {
    const server = fakeMeshServer({
      beginPairing: () => ({ status: 201, body: { ...begunBuild, confirmation: "claim-code" } }),
    });
    const board = await loadedBoard(server);
    board.act("parcels.down");
    board.act("parcels.pair");
    await waitFor(() =>
      expect(detailTexts(board.container)).toContain(
        "code 482 913 · build-box is headless; c asks for the claim code it printed at install",
      ),
    );
    board.act("parcels.confirm");
    const input = board.container.querySelector(
      "input[aria-label='claim code printed on build-box']",
    ) as HTMLInputElement;
    fireEvent.input(input, { target: { value: " K7Q2-MX4P " } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await waitFor(() => expect(server.callsTo("completePairing")).toHaveLength(1));
    expect(server.callsTo("completePairing")[0]?.body).toEqual({
      matches: true,
      claimCode: "K7Q2-MX4P",
    });
  });

  it("confirms an inbound pairing here with the code this node shows", async () => {
    const board = await loadedBoard();
    board.act("parcels.down");
    board.act("parcels.down");
    expect(cursorName(board.container)).toBe("lab-mac");
    board.act("parcels.confirm");
    await waitFor(() =>
      expect(lineTexts(board.container)).toContain(
        "confirmed here · waiting for the console on lab-mac",
      ),
    );
    expect(board.server.callsTo("confirmHere")[0]).toMatchObject({
      id: "pairing-lab",
      body: { sas: "105377" },
    });
  });

  it("cancels a pairing on u, and unpairs a paired parcel only after y", async () => {
    const board = await loadedBoard();
    board.act("parcels.down");
    board.act("parcels.pair");
    await waitFor(() => expect(board.container.textContent).toContain("code 482 913"));
    board.act("parcels.unpair");
    expect(lineTexts(board.container)).toContain("pairing with build-box cancelled");
    expect(board.server.callsTo("completePairing")[0]?.body).toEqual({ matches: false });
    expect(rowTexts(board.container)[1]).toContain("unpaired");
    for (const _ of [1, 2, 3]) board.act("parcels.down");
    board.act("parcels.unpair");
    const ask = askLine(board.container);
    expect(ask.textContent).toBe(
      "unpair spark-ad4d? its pair key is forgotten here at once · y confirms · any other key cancels",
    );
    fireEvent.keyDown(ask, { key: "y" });
    await waitFor(() => expect(lineTexts(board.container)).toContain("unpaired spark-ad4d"));
    expect(board.server.callsTo("unpair").map((call) => call.id)).toEqual(["pair-spark"]);
  });

  it("refuses to pair, confirm or unpair where there is nothing to do, and says why", async () => {
    const board = await loadedBoard();
    board.act("parcels.pair");
    expect(lastLine(board.container)).toBe(
      "this is the machine you sit at; pair the others from here",
    );
    board.act("parcels.confirm");
    expect(lastLine(board.container)).toBe("nothing to confirm on moak-main");
    for (const _ of [1, 2, 3]) board.act("parcels.down");
    board.act("parcels.pair");
    expect(lastLine(board.container)).toBe("old-laptop has no node to pair with");
    board.act("parcels.unpair");
    expect(lastLine(board.container)).toBe("old-laptop is not paired with this console");
    board.act("parcels.down");
    board.act("parcels.pair");
    expect(lastLine(board.container)).toBe("spark-ad4d is already paired; u unpairs it first");
    expect(board.server.callsTo("beginPairing")).toEqual([]);
  });

  it("opens a gate from the small form, holding it open with the problem until the fields read", async () => {
    const board = await loadedBoard();
    board.act("parcels.gate");
    expect(lastLine(board.container)).toBe(
      "a gate onto this machine is opened from the console that owns it",
    );
    board.act("parcels.down");
    board.act("parcels.gate");
    expect(lastLine(board.container)).toBe("build-box is not paired with this console");
    for (const _ of [1, 2, 3]) board.act("parcels.down");
    board.act("parcels.gate");
    const form = board.container.querySelector("form.kw-parcels-form") as HTMLFormElement;
    expect(form.getAttribute("aria-label")).toBe("open a gate onto spark-ad4d");
    fireEvent.submit(form);
    expect(form.querySelector(".kw-parcels-problem")?.textContent).toBe(
      "creature: a slug such as wren, lowercase letters, digits and dashes",
    );
    fill(form, { creature: "wren", caps: "exec bun; files:write ~/src/stead/**", expiry: "2h" });
    fireEvent.submit(form);
    await waitFor(() =>
      expect(lineTexts(board.container)).toContain("wren may act on spark-ad4d until 14:00"),
    );
    expect(board.server.callsTo("issueGrant")[0]?.body).toEqual({
      subject: { creature: "wren", node: ids.house },
      target: ids.spark,
      caps: [
        { kind: "exec", commands: ["bun"] },
        { kind: "files:write", paths: ["~/src/stead/**"] },
      ],
      expiresAt: "2026-11-05T14:00:00.000Z",
    });
    expect(board.container.querySelector("form.kw-parcels-form")).toBeNull();
  });

  it("keeps the gate form open with the node's refusal", async () => {
    const server = fakeMeshServer({
      issueGrant: () => ({ status: 403, body: { error: "the target refused it: wrong-target" } }),
    });
    const board = await loadedBoard(server);
    for (const _ of [1, 2, 3, 4]) board.act("parcels.down");
    board.act("parcels.gate");
    const form = board.container.querySelector("form.kw-parcels-form") as HTMLFormElement;
    fill(form, { creature: "wren", caps: "screen:view", expiry: "30m" });
    fireEvent.submit(form);
    await waitFor(() =>
      expect(form.querySelector(".kw-parcels-problem")?.textContent).toBe(
        "the target refused it: wrong-target",
      ),
    );
    board.act("parcels.down");
    expect(board.container.querySelector("form.kw-parcels-form")).toBeNull();
  });

  it("latches the one gate after y, or asks which when several are open", async () => {
    const single = await loadedBoard();
    for (const _ of [1, 2, 3, 4]) single.act("parcels.down");
    single.act("parcels.revoke");
    const ask = askLine(single.container);
    expect(ask.textContent).toBe(
      "revoke wren's gate onto spark-ad4d? · y confirms · any other key cancels",
    );
    fireEvent.keyDown(ask, { key: "y" });
    await waitFor(() =>
      expect(lineTexts(single.container)).toContain("wren's gate onto spark-ad4d is latched"),
    );
    expect(single.server.callsTo("revokeGrant").map((call) => call.id)).toEqual(["grant-wren"]);
    cleanup();

    const ivy = { ...wrenGate, id: "grant-ivy", subject: { ...wrenGate.subject, creature: "ivy" } };
    const several = await loadedBoard(
      fakeMeshServer({ grants: () => ok({ ...grantList, issued: [wrenGate, ivy] }) }),
    );
    for (const _ of [1, 2, 3, 4]) several.act("parcels.down");
    several.act("parcels.revoke");
    const which = askLine(several.container);
    expect(which.textContent).toBe(
      "revoke which gate onto spark-ad4d? · 1 ivy exec files:read · 2 wren exec files:read · any other key cancels",
    );
    fireEvent.keyDown(which, { key: "2" });
    await waitFor(() => expect(several.server.callsTo("revokeGrant")).toHaveLength(1));
    expect(several.server.callsTo("revokeGrant")[0]?.id).toBe("grant-wren");
  });

  it("says when no gate is open, and drops a prompt on the next key", async () => {
    const board = await loadedBoard();
    board.act("parcels.down");
    board.act("parcels.revoke");
    expect(lastLine(board.container)).toBe("no gate is open onto build-box");
    for (const _ of [1, 2, 3]) board.act("parcels.down");
    board.act("parcels.unpair");
    expect(board.container.querySelector(".kw-ov-line[data-tone='ask']")).not.toBeNull();
    board.act("parcels.down");
    expect(board.container.querySelector(".kw-ov-line[data-tone='ask']")).toBeNull();
    expect(cursorName(board.container)).toBe("spark-ad4d");
  });

  it("re-reads only what a mesh event makes stale, and shows the listener in the health line", async () => {
    const board = await loadedBoard();
    const before = (operation: "census" | "pairs" | "grants" | "audit") =>
      board.server.callsTo(operation).length;
    const counts = { census: before("census"), pairs: before("pairs"), grants: before("grants") };
    board.emit(
      meshEnvelope(41, "mesh.grant", { change: "revoked", grantId: "grant-wren", by: "keeper" }),
      meshEnvelope(42, "mesh.listener", {
        change: "bound",
        address: "100.124.48.125",
        port: 47800,
      }),
    );
    await waitFor(() => expect(before("grants")).toBe(counts.grants + 1));
    expect(before("census")).toBe(counts.census);
    expect(before("pairs")).toBe(counts.pairs);
    expect(board.server.callsTo("audit").at(-1)?.query.after).toBe("hash-5");
    expect(health(board.container)).toBe(
      "listening on 100.124.48.125 · port 47800 · policy verified 11:40 · audit chain intact · 5 rows",
    );
    board.emit(
      meshEnvelope(43, "mesh.revocation", {
        change: "undelivered",
        revocation: { kind: "grant", id: "grant-wren", target: ids.spark },
        attempts: 2,
        error: "connect ETIMEDOUT",
      }),
    );
    expect(lastLine(board.container)).toBe(
      "the grant revocation for spark-ad4d is not delivered yet after 2 attempts: connect ETIMEDOUT",
    );
  });

  it("follows a peer's lane live from mesh.peers, without re-reading the census", async () => {
    const board = await loadedBoard();
    const censusReads = board.server.callsTo("census").length;
    board.emit(
      meshEnvelope(44, "mesh.peers", {
        change: "lanes",
        peers: [{ stableId: ids.build, path: { kind: "direct", endpoint: "192.168.4.20:41641" } }],
      }),
    );
    await waitFor(() =>
      expect(rowTexts(board.container)).toContain("░ build-box · tag:ci · linux direct · unpaired"),
    );
    board.emit(
      meshEnvelope(45, "mesh.peers", {
        change: "lanes",
        peers: [{ stableId: ids.build, path: { kind: "derp", region: "nyc" } }],
      }),
    );
    await waitFor(() =>
      expect(rowTexts(board.container)).toContain(
        "░ build-box · tag:ci · linux ░ DERP nyc · unpaired",
      ),
    );
    expect(board.server.callsTo("census")).toHaveLength(censusReads);
  });

  it("lists pairs and gates by id when the node has no peers route, and says so", async () => {
    const board = mountBoard(fakeMeshServer({ census: undefined }));
    await waitFor(() => expect(rowTexts(board.container)).toHaveLength(3));
    expect(rowTexts(board.container)).toEqual([
      "▓ nLabMacCNTRL not listed · pairing",
      "· nMoakMainCNTRL not listed · not paired",
      "█ nSparkAd4dCNTRL not listed · claimed host",
    ]);
    expect(lineTexts(board.container)).toContain(
      "this node does not list tailnet machines yet; rows come from pairs and gates only",
    );
    expect(board.container.querySelector(".kw-empty")).toBeNull();
  });

  it("puts the node's own words in an error line and teaches from the empty state when the mesh is not served", async () => {
    const unserved = { status: 503, body: { error: "the mesh is not served by this host" } };
    const board = mountBoard(
      fakeMeshServer({
        census: () => unserved,
        pairs: () => unserved,
        grants: () => unserved,
        audit: () => unserved,
      }),
    );
    await waitFor(() => expect(board.container.querySelector(".kw-empty")).not.toBeNull());
    expect(board.container.querySelector(".kw-empty")?.textContent).toBe(
      "No other parcels yet · run the node on another tailnet machine, then look again with r",
    );
    expect(lineTexts(board.container).filter((line) => line.includes("not served"))).toEqual([
      "the mesh is not served by this host",
    ]);
  });

  it("teaches below this machine's row when no other parcel is on the tailnet, and looks again on r", async () => {
    const server = fakeMeshServer({
      census: () => ok({ ...census, peers: [] }),
      pairs: () => ok({ ...pairsReading, pairs: [], pending: [] }),
      grants: () => ok({ issued: [], installed: [] }),
    });
    const board = mountBoard(server);
    await waitFor(() => expect(board.container.querySelector(".kw-empty")).not.toBeNull());
    expect(rowTexts(board.container)).toEqual([
      "█ moak-main · Jordan Moak · windows here · claimed",
    ]);
    board.act("parcels.refresh");
    await waitFor(() => expect(server.callsTo("census")).toHaveLength(2));
    expect(server.callsTo("pairs")).toHaveLength(2);
  });

  it("is registered as a pane that reaches the node through HostPort.serverFetch", async () => {
    const server = fakeMeshServer();
    const board = mountRegisteredPane(server);
    await waitFor(() => expect(rowTexts(board.container)).toHaveLength(5));
    expect(server.callsTo("census")).toHaveLength(1);
    expect(board.container.querySelector("section")?.getAttribute("aria-label")).toBe("parcels");
  });
});

describe("the parcels pane's lane, replaying first light run 3", () => {
  const { censusOnDerp, censusDirect, sparkWentDirect } = firstLightRunThree;

  it("opens on DERP ord and moves to direct when mesh.peers says so, without a reopen", async () => {
    const board = await loadedBoard(fakeMeshServer({ census: () => ok(censusOnDerp) }));
    expect(sparkRow(board.container)).toContain("DERP ord");
    board.emit(meshEnvelope(46, "mesh.peers", sparkWentDirect));
    await waitFor(() => expect(sparkRow(board.container)).toContain("direct"));
    expect(sparkRow(board.container)).not.toContain("DERP");
  });

  it("reads the lane afresh on every open, never a census an earlier open held", async () => {
    const readings = [censusOnDerp, censusDirect];
    const server = fakeMeshServer({ census: () => ok(readings.shift() ?? censusDirect) });
    const first = await loadedBoard(server);
    expect(sparkRow(first.container)).toContain("DERP ord");
    cleanup();
    const reopened = await loadedBoard(server);
    expect(sparkRow(reopened.container)).toContain("direct");
    expect(server.callsTo("census")).toHaveLength(2);
  });

  it("keeps a lane heard while the census was on its way, over the older reading it brings", async () => {
    const server = fakeMeshServer({ census: () => ok(censusOnDerp) });
    const held = deferred();
    const board = mountBoard(server, async (input, init) => {
      if (String(input).startsWith("/mesh/peers")) await held.promise;
      return server.fetch(input, init);
    });
    board.emit(meshEnvelope(47, "mesh.peers", sparkWentDirect));
    held.resolve();
    await waitFor(() => expect(health(board.container)).toContain("audit chain intact"));
    await waitFor(() => expect(sparkRow(board.container)).toContain("direct"));
  });
});

describe("the parcels pane in text", () => {
  it("lays out as the golden says", async () => {
    const board = await loadedBoard();
    board.emit(
      meshEnvelope(7, "mesh.listener", { change: "bound", address: "100.124.48.125", port: 47800 }),
    );
    board.act("parcels.down");
    board.act("parcels.pair");
    await waitFor(() => expect(board.container.textContent).toContain("code 482 913"));
    for (const _ of [1, 2, 3]) board.act("parcels.down");
    board.act("parcels.gate");
    expect(`${layoutText(board.container)}\n`).toBe(
      readFileSync(join(process.cwd(), "packages/ui/src/panes/parcels/golden/parcels.txt"), "utf8"),
    );
  });
});

const paneKeys: KeyHints = {
  chord: (action) => firstChordOf(action),
  leader: () => "ctrl+k",
};

interface MountedBoard {
  readonly container: HTMLElement;
  readonly server: FakeMeshServer;
  act(action: string): void;
  emit(...envelopes: readonly object[]): void;
}

async function loadedBoard(server = fakeMeshServer(), fetch?: Fetch): Promise<MountedBoard> {
  const board = mountBoard(server, fetch);
  await waitFor(() => expect(health(board.container)).toContain("audit chain intact"));
  return board;
}

function mountBoard(server: FakeMeshServer, fetch: Fetch = server.fetch): MountedBoard {
  const feed = meshFeed();
  let handle: PaneActionHandler = () => {};
  const { container } = render(() => (
    <ParcelsBoard
      pane={{
        id: "p1",
        spec: { kind: "parcels" },
        focused: true,
        shell: paneShell(feed.feed),
        onAction: (handler) => {
          handle = handler;
        },
      }}
      seams={{ routes: meshRoutesOver(fetch), clock: fixtureClock }}
    />
  ));
  return { container, server, act: (action) => handle(action), emit: feed.emit };
}

function mountRegisteredPane(server: FakeMeshServer): MountedBoard {
  const feed = meshFeed();
  let handle: PaneActionHandler = () => {};
  const origin = "http://127.0.0.1:4770";
  const host = browserHost({
    server: { url: origin, token: "t" },
    fetch: (input, init) => server.fetch(String(input).replace(origin, ""), init),
  });
  const Pane = parcelsPane.component;
  const { container } = render(() => (
    <Pane
      id="p1"
      spec={{ kind: "parcels" }}
      focused={true}
      shell={paneShell(feed.feed, host)}
      onAction={(handler) => {
        handle = handler;
      }}
    />
  ));
  return { container, server, act: (action) => handle(action), emit: feed.emit };
}

function meshFeed(): { feed: Pick<ServerFeed, "subscribe">; emit(...envelopes: object[]): void } {
  const listeners = new Set<(envelopes: readonly BusEnvelope[]) => void>();
  return {
    feed: {
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    emit: (...envelopes) => {
      for (const listener of [...listeners]) listener(envelopes as unknown as BusEnvelope[]);
    },
  };
}

function paneShell(
  feed: Pick<ServerFeed, "subscribe">,
  host: HostPort = browserHost(),
): ShellSeams {
  return { keys: paneKeys, feed, host, workspace: "C:/work" } as unknown as ShellSeams;
}

function firstChordOf(action: string): string {
  const chords = parcelsPane.localActions?.[action]?.chords;
  if (typeof chords === "string") return chords;
  return chords?.[0] ?? action;
}

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve = (): void => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fill(form: HTMLFormElement, fields: Record<string, string>): void {
  for (const [name, value] of Object.entries(fields)) {
    const input = form.querySelector(`input[name='${name}']`) as HTMLInputElement;
    fireEvent.input(input, { target: { value } });
  }
}

function sparkRow(container: HTMLElement): string {
  return rowTexts(container).find((row) => row.includes("spark-ad4d")) ?? "";
}

function rowTexts(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".kw-ov-row")].map((row) =>
    [".kw-ov-mark", ".kw-ov-name", ".kw-ov-aside"]
      .map((part) => row.querySelector(part)?.textContent?.trim() ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function cursorName(container: HTMLElement): string {
  return container.querySelector(".kw-ov-row[data-cursor] .kw-parcels-machine")?.textContent ?? "";
}

function cursorMark(container: HTMLElement): string {
  return container.querySelector(".kw-ov-row[data-cursor] .kw-ov-mark")?.textContent ?? "";
}

function detailTexts(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".kw-parcels-detail p")].map(
    (line) => line.textContent ?? "",
  );
}

function lineTexts(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".kw-ov-line")].map((line) => line.textContent ?? "");
}

function lastLine(container: HTMLElement): string | undefined {
  return lineTexts(container).at(-1);
}

function askLine(container: HTMLElement): HTMLElement {
  return container.querySelector(".kw-ov-line[data-tone='ask']") as HTMLElement;
}

function health(container: HTMLElement): string {
  return container.querySelector(".kw-parcels-health")?.textContent ?? "";
}

function layoutText(container: HTMLElement): string {
  const parts = container.querySelectorAll(
    ".kw-ov-head, .kw-parcels-health, .kw-ov-row, .kw-parcels-detail p, .kw-empty, .kw-ov-line, .kw-parcels-form",
  );
  return [...parts].map(layoutLine).join("\n");
}

function layoutLine(element: Element): string {
  const text = (selector: string): string =>
    element.querySelector(selector)?.textContent?.trim() ?? "";
  if (element.matches(".kw-ov-head")) {
    return `${text(".kw-ov-head-lead")}    ${text(".kw-ov-head-detail")}`;
  }
  if (element.matches(".kw-ov-row")) {
    const cursor = element.hasAttribute("data-cursor") ? ">" : " ";
    const name = text(".kw-ov-name").padEnd(36);
    return `${cursor} ${text(".kw-ov-mark")} ${name} ${text(".kw-ov-aside")}`;
  }
  if (element.matches(".kw-parcels-detail p")) return `      ${element.textContent ?? ""}`;
  if (element.matches(".kw-parcels-form")) {
    const fields = [...element.querySelectorAll("input")].map(
      (input) => `[${input.name} ${input.value || input.placeholder}]`,
    );
    return [text(".kw-parcels-form-title"), ...fields].join("\n  ");
  }
  return element.textContent?.trim() ?? "";
}
