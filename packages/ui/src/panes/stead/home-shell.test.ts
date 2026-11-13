import { describe, expect, it } from "vitest";
import type { PaneSpecBase, ShellSeams } from "../registry.ts";
import { type HomeConnection, homeShell } from "./home-shell.ts";

describe("the creature home's shell inside another window", () => {
  it("opens a new conversation empty and makes its server session only with the first prompt, shown before it is prompted", async () => {
    const said: string[] = [];
    const presented: PaneSpecBase[] = [];
    const home = {
      store: {
        create: async () => {
          said.push("create");
          return "s-new";
        },
        prompt: async (session: string, text: string) => {
          said.push(`prompt ${session} ${text}`);
          return "sent";
        },
      },
      opened: () => ({ workspace: "C:/me/.keywork/home" }),
      standing: () => ({ kind: "up" }),
    } as unknown as HomeConnection;
    const surface = { keys: {}, trust: {} } as unknown as ShellSeams;
    const shell = homeShell(
      surface,
      home,
      (spec) => presented.push(spec),
      (session) => said.push(`show ${session}`),
    );

    await shell.sessions.newSession();
    expect(presented).toEqual([{ kind: "conversation" }]);
    expect(said).toEqual([]);

    await shell.sessions.startSession("p1", "hello");
    expect(said).toEqual(["create", "show s-new", "prompt s-new hello"]);
    expect(shell.workspace).toBe("C:/me/.keywork/home");
  });
});
