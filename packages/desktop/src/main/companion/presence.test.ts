import { describe, expect, it } from "vitest";
import {
  derivePresence,
  type PresenceInputs,
  presenceController,
  restingInputs,
} from "./presence.ts";

const floating: PresenceInputs = { ...restingInputs, enabled: true, transparency: "clear" };

describe("derivePresence", () => {
  it("is off until the keeper opts in, whatever else is true", () => {
    expect(derivePresence({ ...floating, enabled: false, busyNow: true })).toEqual({
      mode: "off",
      window: "none",
      reason: "companions are off",
    });
  });

  it("floats by default and honors a preferred tray, pane or notification mode", () => {
    expect(derivePresence(floating)).toEqual({
      mode: "floating",
      window: "shown",
      reason: "floating",
    });
    for (const preferred of ["tray", "pane", "notification"] as const) {
      expect(derivePresence({ ...floating, preferred })).toMatchObject({
        mode: preferred,
        window: "none",
      });
    }
  });

  it("downgrades to the pane on Wayland and when transparency paints black", () => {
    expect(derivePresence({ ...floating, wayland: true })).toMatchObject({ mode: "pane" });
    expect(derivePresence({ ...floating, transparency: "opaque" })).toMatchObject({ mode: "pane" });
    expect(derivePresence({ ...floating, transparency: "unknown" })).toMatchObject({
      window: "shown",
    });
  });

  it("keeps a hidden creature hidden over every context", () => {
    expect(derivePresence({ ...floating, hidden: true, busyNow: true })).toEqual({
      mode: "floating",
      window: "none",
      reason: "hidden until shown",
    });
  });

  it("tucks on lock, behind a busy foreground, and while nothing works in busy-only mode", () => {
    expect(derivePresence({ ...floating, locked: true })).toMatchObject({ window: "tucked" });
    expect(derivePresence({ ...floating, foregroundBusy: true })).toMatchObject({
      window: "tucked",
    });
    expect(derivePresence({ ...floating, onlyWhileBusy: true })).toMatchObject({
      window: "tucked",
    });
    expect(derivePresence({ ...floating, onlyWhileBusy: true, busyNow: true })).toMatchObject({
      window: "shown",
    });
  });
});

describe("presenceController", () => {
  it("announces only real changes and never rewrites the preference", () => {
    const controller = presenceController(floating);
    const seen: string[] = [];
    controller.onChange((presence, previous) => seen.push(`${previous.window}>${presence.window}`));
    controller.update({ busyNow: true });
    controller.update({ locked: true });
    controller.update({ locked: true });
    controller.update({ locked: false });
    expect(seen).toEqual(["shown>tucked", "tucked>shown"]);
    expect(controller.inputs().preferred).toBe("floating");
  });
});
