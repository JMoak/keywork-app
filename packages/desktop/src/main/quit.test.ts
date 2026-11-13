import { steadProfile } from "@keywork-app/product";
import type { SessionRow } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import {
  interruptWork,
  mayQuit,
  type QuitWarning,
  quitWarning,
  stopAndQuit,
  type WorkInFlight,
  workAcross,
  workInFlight,
} from "./quit.ts";

describe("what quitting would interrupt", () => {
  it("names the sessions with a running turn and counts the asks waiting", () => {
    expect(
      workInFlight("C:\\work\\app", [
        row("fix the tests", { working: true, waiting: { asks: 1, tools: ["write"] } }),
        row("docs pass", { working: true }),
        row("old idea"),
        row("   ", { waiting: { asks: 2, tools: ["bash"] } }),
      ]),
    ).toEqual({ workspace: "C:\\work\\app", working: ["fix the tests", "docs pass"], asks: 3 });
  });

  it("is nothing when every session is idle", () => {
    expect(workInFlight("/w", [row("a"), row("b", { working: false })])).toBeUndefined();
  });

  it("asks only the workspaces given, skips any that answer late or not at all", async () => {
    const asked: string[] = [];
    const work = await workAcross(
      ["/busy", "/idle", "/silent", "/broken"],
      (workspace) => {
        asked.push(workspace);
        if (workspace === "/busy") return Promise.resolve([row("build", { working: true })]);
        if (workspace === "/idle") return Promise.resolve([row("done")]);
        if (workspace === "/silent") return new Promise(() => undefined);
        return Promise.reject(new Error("unreachable"));
      },
      20,
    );
    expect(asked).toEqual(["/busy", "/idle", "/silent", "/broken"]);
    expect(work).toEqual([{ workspace: "/busy", working: ["build"], asks: 0 }]);
  });
});

describe("the question before quitting", () => {
  const busy: WorkInFlight[] = [
    { workspace: "C:\\work\\app", working: ["fix the tests", "docs pass"], asks: 1 },
    { workspace: "/home/me/site", working: [], asks: 2 },
  ];

  it("is never asked when nothing is in flight", () => {
    expect(quitWarning([])).toBeUndefined();
  });

  it("names each workspace's working sessions and waiting asks, and says what stops", () => {
    const warning = quitWarning(busy) as QuitWarning;
    expect(warning.title).toBe("Quit keywork");
    expect(warning.detail).toBe(
      [
        "app\nworking: fix the tests, docs pass\n1 ask waits for you",
        "site\n2 asks wait for you",
        "Quitting stops the engine and interrupts this work.",
      ].join("\n\n"),
    );
  });

  it("offers stopping the work against a default, escapable Cancel", () => {
    const warning = quitWarning(busy) as QuitWarning;
    expect(warning.buttons).toEqual(["Stop work and quit", "Cancel"]);
    expect(warning.buttons[stopAndQuit]).toBe("Stop work and quit");
    expect(warning.defaultId).toBe(1);
    expect(warning.cancelId).toBe(1);
  });

  it("keeps a long list of working sessions short", () => {
    const warning = quitWarning([
      { workspace: "/w", working: ["a", "b", "c", "d", "e"], asks: 0 },
    ]) as QuitWarning;
    expect(warning.detail.split("\n\n")[0]).toBe("w\nworking: a, b, c and 2 more");
  });

  it("speaks with the product's own name", () => {
    expect(quitWarning(busy, steadProfile)?.title).toBe("Quit stead");
  });
});

describe("stopping the work before the engine", () => {
  it("interrupts each session with a running turn or a waiting ask, so the server keeps what streamed", async () => {
    const aborted: string[] = [];
    await interruptWork(["/a", "/b"], {
      sessionsOf: async (workspace) =>
        workspace === "/a"
          ? [row("build", { working: true }), row("idle")]
          : [row("asking", { waiting: { asks: 1, tools: ["write"] } })],
      abort: async (workspace, sessionId) => {
        aborted.push(`${workspace} ${sessionId}`);
      },
    });
    expect(aborted.sort()).toEqual(["/a build", "/b asking"]);
  });

  it("never holds the quit hostage to a server that fails or hangs", async () => {
    const aborted: string[] = [];
    await interruptWork(
      ["/hung", "/broken", "/fine"],
      {
        sessionsOf: (workspace) => {
          if (workspace === "/hung") return new Promise(() => undefined);
          if (workspace === "/broken") return Promise.reject(new Error("unreachable"));
          return Promise.resolve([row("a", { working: true }), row("b", { working: true })]);
        },
        abort: async (_workspace, sessionId) => {
          aborted.push(sessionId);
          if (sessionId === "a") return new Promise(() => undefined);
        },
      },
      20,
    );
    expect(aborted).toEqual(["a", "b"]);
  });
});

describe("deciding to quit", () => {
  it("quits without a dialog when nothing is in flight", async () => {
    const shown: QuitWarning[] = [];
    const quits = await mayQuit({
      work: async () => [],
      ask: async (warning) => {
        shown.push(warning);
        return stopAndQuit;
      },
    });
    expect({ quits, shown }).toEqual({ quits: true, shown: [] });
  });

  it("quits only when the dialog is answered with stopping the work", async () => {
    const work = async () => [{ workspace: "/w", working: ["build"], asks: 0 }];
    expect(await mayQuit({ work, ask: async () => stopAndQuit })).toBe(true);
    expect(await mayQuit({ work, ask: async () => 1 })).toBe(false);
  });
});

function row(title: string, extra: Partial<SessionRow> = {}): SessionRow {
  return {
    id: title,
    title,
    createdAt: "2026-11-12T00:00:00Z",
    lastActivityAt: "2026-11-12T00:00:00Z",
    messageCount: 1,
    ...extra,
  };
}
