import { describe, expect, it } from "vitest";
import { stopSharingLabel, trayModel } from "./tray.ts";

describe("the tray's screen kill switch", () => {
  it("offers Stop sharing only while a screen session is live, above Quit", () => {
    const quiet = trayModel([]);
    expect(quiet.menu.some((item) => item.kind === "action" && item.action === "screen-stop")).toBe(
      false,
    );
    const sharing = trayModel([{ workspace: "C:/w", windows: 1, needsYou: 0 }], ["session-1"]);
    const actions = sharing.menu.map((item) => (item.kind === "action" ? item.action : item.kind));
    expect(actions).toEqual([
      "open-folder",
      "separator",
      "open-recent",
      "separator",
      "screen-stop",
      "separator",
      "quit",
    ]);
  });

  it("counts the viewers in the label", () => {
    expect(stopSharingLabel(1)).toBe("Stop sharing screen");
    expect(stopSharingLabel(3)).toBe("Stop sharing screen (3 viewers)");
    const two = trayModel([], ["a", "b"]).menu.find(
      (item) => item.kind === "action" && item.action === "screen-stop",
    );
    expect(two).toMatchObject({ label: "Stop sharing screen (2 viewers)" });
  });
});
