import { emptyProjection, projectAll } from "@keywork-app/client";
import { describe, expect, it } from "vitest";
import { echoPty } from "../../host/echo-pty.ts";
import { connectPty, mirrorPainter, type PtyEvent } from "./session.ts";
import { fakeSurface } from "./session-testing.ts";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("a shell over the pty seam", () => {
  const link = { workspace: "C:/work", program: "shell" as const, args: [] };

  it("opens at the surface's size, echoes typed input, and propagates resizes", async () => {
    const surface = fakeSurface({ cols: 100, rows: 30 });
    const events: PtyEvent[] = [];
    const connection = connectPty(surface, echoPty(), link, (event) => events.push(event));
    await settle();
    expect(events).toEqual([{ kind: "opened", title: "echo" }]);
    expect(surface.text()).toContain("echo shell");
    expect(surface.text()).toContain("C:/work> ");
    surface.type("dir\r");
    expect(surface.text()).toContain("dir\r\ndir\r\nC:/work> ");
    surface.grow({ cols: 120, rows: 40 });
    expect(surface.text()).toContain("[120x40]");
    connection.write("ls\r");
    expect(surface.text().endsWith("ls\r\nls\r\nC:/work> ")).toBe(true);
    connection.dispose();
  });

  it("reports the exit and ignores input afterwards", async () => {
    const surface = fakeSurface();
    const events: PtyEvent[] = [];
    connectPty(surface, echoPty(), link, (event) => events.push(event));
    await settle();
    surface.type("\x03");
    expect(surface.text()).toContain("^C");
    surface.type("\x04");
    expect(events.at(-1)).toEqual({
      kind: "exit",
      exit: { id: 1, exitCode: 0, signal: undefined },
    });
    const before = surface.text();
    surface.type("more");
    expect(surface.text()).toBe(before);
  });

  it("closes a pty that opened after the pane was disposed", async () => {
    const surface = fakeSurface();
    const port = echoPty();
    const events: PtyEvent[] = [];
    const connection = connectPty(surface, port, link, (event) => events.push(event));
    connection.dispose();
    await settle();
    expect(events).toEqual([]);
    expect(surface.text()).toBe("");
  });

  it("asks the host for keywork in bridge mode without a token", async () => {
    const surface = fakeSurface();
    const bridge = { workspace: "C:/work", program: "keywork" as const, args: ["attach"] };
    connectPty(surface, echoPty(), bridge, () => {});
    await settle();
    expect(surface.text()).toContain("keywork attach");
    expect(surface.text()).not.toMatch(/token/i);
  });
});

describe("the mirror painter", () => {
  it("paints growth as a tail write and a rewrite as a reset", () => {
    const surface = fakeSurface();
    const painter = mirrorPainter(surface);
    painter.paint(emptyProjection);
    expect(surface.text()).toContain("no bash calls");
    const started = projectAll(emptyProjection, [
      {
        id: 1,
        ts: "t",
        sessionId: "s",
        type: "tool.started",
        payload: {
          call: { type: "tool-call", callId: "c1", name: "bash", arguments: { command: "pwd" } },
        },
      },
    ]);
    painter.paint(started);
    expect(surface.resets).toBe(1);
    expect(surface.text()).toContain("$ pwd");
    const finished = projectAll(started, [
      {
        id: 2,
        ts: "t",
        sessionId: "s",
        type: "tool.finished",
        payload: { callId: "c1", output: "/w", isError: false },
      },
    ]);
    painter.paint(finished);
    expect(surface.resets).toBe(1);
    expect(surface.text()).toContain("/w\r\n");
    expect(surface.text()).toContain("done");
  });
});
