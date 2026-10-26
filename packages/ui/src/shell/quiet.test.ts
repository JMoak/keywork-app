import type { PermissionRule, PermissionsView } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { type QuietChords, quietOffNotice, quietOnNotice, sessionGrantsHeld } from "./quiet.ts";

const chords: QuietChords = {
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

describe("the quiet notices", () => {
  it("word the way in and every way back", () => {
    expect(quietOnNotice(chords)).toBe(
      "quiet · the gate now grants what this session already covers · ctrl+k shift+s ends it",
    );
    expect(quietOffNotice(0, chords)).toBe("quiet off · asks come to you again");
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
