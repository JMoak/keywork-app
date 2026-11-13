import { describe, expect, it } from "vitest";
import { composerHold, heldDraftLine, serverUp } from "./server-standing.ts";

describe("the composer's hold while the server is lost", () => {
  it("says the held draft is not sent, and that enter sends it once the server is back", () => {
    expect(composerHold(serverUp)).toBeUndefined();
    expect(composerHold({ kind: "lost", reason: "exited", reattaching: true })).toBe(
      `server lost · reattaching · ${heldDraftLine}`,
    );
    expect(composerHold({ kind: "lost", reason: "exited", reattaching: false })).toBe(
      `server lost · /reconnect tries again · ${heldDraftLine}`,
    );
    expect(heldDraftLine).not.toMatch(/until it's back$/);
  });
});
