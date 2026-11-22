import type { PermissionRule, PermissionsView } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { sessionGrantsHeld } from "./quiet.ts";

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
  it("counts a session's grants from the server and admits when it cannot", async () => {
    expect(await sessionGrantsHeld(answering(viewHolding({ s1: [mkdir] })), "s1")).toBe(1);
    expect(await sessionGrantsHeld(answering(viewHolding({ s2: [mkdir] })), "s1")).toBe(0);
    expect(await sessionGrantsHeld(answering(new Error("answered 500")), "s1")).toBeUndefined();
  });
});
