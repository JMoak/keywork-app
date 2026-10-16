import type { PermissionRule, PermissionsView } from "@keywork-app/protocol";
import { createEffect, createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import {
  createQuietSessions,
  noQuietSession,
  type QuietChords,
  quietOffNotice,
  quietOnNotice,
  sessionGrantsHeld,
  toggleSessionQuiet,
} from "./quiet.ts";

const chords: QuietChords = {
  approve: "ctrl+y",
  quiet: "ctrl+k shift+s",
  permissions: "ctrl+k shift+p",
};

const mkdir: PermissionRule = { action: "bash", resource: "mkdir -p *", effect: "allow" };

function viewHolding(session: PermissionsView["session"]): PermissionsView {
  return { trusted: true, bundle: [], workspace: [], session };
}

function answering(view: PermissionsView | Error) {
  return {
    permissions: async () => {
      if (view instanceof Error) throw view;
      return view;
    },
  };
}

describe("createQuietSessions", () => {
  it("holds the posture per session and gives it back on the second toggle", () => {
    const quiet = createQuietSessions();
    expect(quiet.toggle("s1")).toBe(true);
    expect(quiet.toggle("s2")).toBe(true);
    expect(quiet.all()).toEqual(["s1", "s2"]);
    expect(quiet.toggle("s1")).toBe(false);
    expect(quiet.has("s1")).toBe(false);
    expect(quiet.has("s2")).toBe(true);
    expect(quiet.has(undefined)).toBe(false);
  });

  it("tells whoever is watching when a session goes quiet and comes back", () => {
    const quiet = createQuietSessions();
    const seen: boolean[] = [];
    const dispose = createRoot((dispose) => {
      createEffect(() => seen.push(quiet.has("s1")));
      return dispose;
    });
    quiet.toggle("s1");
    quiet.toggle("s1");
    expect(seen).toEqual([false, true, false]);
    dispose();
  });
});

describe("toggleSessionQuiet", () => {
  it("refuses without a focused session and changes nothing", async () => {
    const quiet = createQuietSessions();
    const notice = await toggleSessionQuiet(
      { quiet, client: answering(viewHolding({})), chords },
      undefined,
    );
    expect(notice).toBe(noQuietSession);
    expect(quiet.all()).toEqual([]);
  });

  it("goes quiet with the way back in the notice and asks the server nothing", async () => {
    const quiet = createQuietSessions();
    let reads = 0;
    const client = {
      permissions: async () => {
        reads += 1;
        return viewHolding({});
      },
    };
    expect(await toggleSessionQuiet({ quiet, client, chords }, "s1")).toBe(
      "quiet · ctrl+y now grants an ask for the rest of this session · ctrl+k shift+s ends it",
    );
    expect(quiet.has("s1")).toBe(true);
    expect(reads).toBe(0);
  });

  it("revokes nothing on the way back and counts the grants the session still holds", async () => {
    const quiet = createQuietSessions();
    quiet.toggle("s1");
    const client = answering(viewHolding({ s1: [mkdir, mkdir], s2: [mkdir] }));
    expect(await toggleSessionQuiet({ quiet, client, chords }, "s1")).toBe(
      "quiet off · 2 session grants still hold · ctrl+k shift+p revokes them",
    );
    expect(quiet.has("s1")).toBe(false);
  });
});

describe("the quiet notices", () => {
  it("word the way in and every way back", () => {
    expect(quietOnNotice(chords)).toBe(
      "quiet · ctrl+y now grants an ask for the rest of this session · ctrl+k shift+s ends it",
    );
    expect(quietOffNotice(0, chords)).toBe("quiet off · ctrl+y answers once again");
    expect(quietOffNotice(1, chords)).toBe(
      "quiet off · 1 session grant still holds · ctrl+k shift+p revokes it",
    );
    expect(quietOffNotice(3, chords)).toBe(
      "quiet off · 3 session grants still hold · ctrl+k shift+p revokes them",
    );
    expect(quietOffNotice(undefined, chords)).toBe(
      "quiet off · ctrl+k shift+p shows the grants it left",
    );
  });

  it("counts a session's grants from the server and admits when it cannot", async () => {
    expect(await sessionGrantsHeld(answering(viewHolding({ s1: [mkdir] })), "s1")).toBe(1);
    expect(await sessionGrantsHeld(answering(viewHolding({ s2: [mkdir] })), "s1")).toBe(0);
    expect(await sessionGrantsHeld(answering(new Error("answered 500")), "s1")).toBeUndefined();
  });
});
