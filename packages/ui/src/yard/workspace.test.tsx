import { keyworkProfile, steadProfile } from "@keywork-app/product";
import { cleanup, fireEvent, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import {
  cardCalled,
  cardTitled,
  conversationId,
  frameNamed,
  hubNames,
  key,
  openYard,
  pressLeader,
  satelliteOf,
  typing,
  yardField,
} from "./app-testing.tsx";
import { aSetting, proposed, settled } from "./testing.ts";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const delivery = aSetting({
  id: "delivery",
  sessionId: conversationId,
  what: { kind: "diff", ref: "change-1", title: "the parser fix" },
  rung: "unfold",
  why: "the fix you asked for is ready",
});
const note = aSetting({
  id: "note",
  sessionId: "elsewhere",
  what: { kind: "note", ref: "the nightly chore found two stale branches" },
  why: "worth a glance when you have a minute",
});
const unowned = aSetting({
  id: "unowned",
  creature: null,
  sessionId: conversationId,
  what: { kind: "url", ref: "https://example.com/spec" },
  why: "the spec this thread follows",
});

describe("the yard under the stead profile", () => {
  it("is the first frame, with the creature's stead and conversation as the hub", async () => {
    const yard = await openYard();
    expect(yardField()?.dataset.mode).toBe("yard");
    expect(screen.getByRole("region", { name: "stead" }).closest(".kw-yard-hub")).toBeTruthy();
    expect(frameNamed("Wren at home")?.closest(".kw-yard-hub")).toBeTruthy();
    expect(yard.listed).toHaveBeenCalled();
  });

  it("sets a live setting out at its decided rung beside the hub without taking the keeper's focus", async () => {
    const yard = await openYard();
    const composer = typing();
    yard.emit([proposed(1, note), proposed(2, delivery)]);
    const satellite = await waitFor(() => satelliteOf("delivery"));
    expect(satellite.dataset.rung).toBe("unfold");
    await waitFor(
      () => {
        expect(Number.parseFloat(satelliteOf("delivery").style.width)).toBeGreaterThanOrEqual(480);
        expect(Number.parseFloat(satelliteOf("delivery").style.height)).toBeGreaterThanOrEqual(320);
      },
      { timeout: 4000 },
    );
    expect(cardTitled("the nightly chore found two stale branches")).toBeTruthy();
    expect(document.activeElement).toBe(composer);
  });

  it("keys each panel by its setting, so a relayout never remounts it", async () => {
    const yard = await openYard();
    yard.emit([proposed(1, delivery)]);
    const first = await waitFor(() => satelliteOf("delivery"));
    yard.emit([proposed(2, note)]);
    await waitFor(() => cardCalled("the nightly chore found two stale branches"));
    expect(satelliteOf("delivery")).toBe(first);
  });

  it("holds unfolds past the budget back as cards and says so at the head of the rail", async () => {
    const yard = await openYard();
    yard.emit(
      Array.from({ length: 7 }, (_, index) =>
        proposed(
          index + 1,
          aSetting({
            ...delivery,
            id: `delivery-${index}`,
            creature: `creature-${index}`,
            what: { kind: "diff", ref: `change-${index}`, title: `change ${index}` },
          }),
        ),
      ),
    );
    await screen.findByText("while you were away · 1 held back as a card", {
      selector: ".kw-yard-rail-head",
    });
  });

  it("hangs a creature-less setting on its thread and answers it the same way", async () => {
    const yard = await openYard();
    yard.emit([proposed(1, unowned)]);
    const card = await waitFor(() => cardCalled("https://example.com/spec"));
    expect(card.querySelector(".kw-yard-card-by")?.textContent).toBe("a link from Wren at home");
    pressLeader("y");
    key("x");
    await waitFor(() => expect(yard.answered).toEqual([["unowned", "dismissed"]]));
  });

  it("is keyboard-selectable, posts every keeper action to the wire, and folds what settles", async () => {
    const yard = await openYard();
    const composer = typing();
    yard.emit([proposed(1, note), proposed(2, delivery)]);
    await waitFor(() => satelliteOf("delivery"));

    pressLeader("y");
    const rail = document.querySelector(".kw-yard-rail") as HTMLElement;
    expect(document.activeElement).toBe(rail);
    expect(satelliteOf("delivery").dataset.cursor).toBe("");

    key("p");
    key("j");
    expect(cardTitled("the nightly chore found two stale branches")?.dataset.cursor).toBe("");
    key("Enter");
    await waitFor(() => satelliteOf("note"));
    expect(yard.answered).toEqual([["delivery", "pinned"]]);

    key("Enter");
    await waitFor(() =>
      expect(yard.answered).toEqual([
        ["delivery", "pinned"],
        ["note", "seen"],
      ]),
    );
    expect(satelliteOf("note")).toBeTruthy();
    yard.emit([settled(3, note, "seen")]);
    await waitFor(() => expect(document.querySelector('[data-setting="note"]')).toBeNull());

    pressLeader("y");
    key("x");
    await waitFor(() => expect(yard.answered.at(-1)).toEqual(["delivery", "dismissed"]));
    expect(satelliteOf("delivery")).toBeTruthy();
    yard.emit([settled(4, delivery, "dismissed")]);
    await waitFor(() => expect(document.querySelector('[data-setting="delivery"]')).toBeNull());

    key("Escape");
    expect(document.activeElement).toBe(composer);
  });

  it("waits for the keeper to finish writing before a delivery in the thread unfolds", async () => {
    const yard = await openYard();
    const composer = typing();
    fireEvent.input(composer, { target: { value: "half a thought" } });
    yard.emit([proposed(1, { ...delivery, at: new Date().toISOString() })]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.querySelector('[data-setting="delivery"]')).toBeNull();
    fireEvent.input(composer, { target: { value: "" } });
    await waitFor(() => expect(satelliteOf("delivery").dataset.rung).toBe("unfold"));
    expect(document.activeElement).toBe(composer);
  });

  it("keeps a delivery on the rail while the host says another application is fullscreen", async () => {
    const elsewhere = { fullscreen: false, fullscreenElsewhere: true, displayShared: false };
    const yard = await openYard(steadProfile, {
      read: async () => elsewhere,
      onChange: () => () => undefined,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    yard.emit([proposed(1, delivery)]);
    await waitFor(() => cardCalled("the parser fix"));
    expect(document.querySelector('.kw-yard-satellite[data-setting="delivery"]')).toBeNull();
  });

  it("keeps a pinned panel out and folds it once it is unpinned", async () => {
    const yard = await openYard();
    yard.emit([proposed(1, delivery)]);
    await waitFor(() => satelliteOf("delivery"));
    yard.emit([settled(2, delivery, "pinned")]);
    await waitFor(() => expect(satelliteOf("delivery").querySelector(".kw-frame")).toBeTruthy());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(satelliteOf("delivery")).toBeTruthy();
    yard.emit([settled(3, delivery, "unpinned")]);
    await waitFor(() => expect(document.querySelector('[data-setting="delivery"]')).toBeNull());
    expect(cardTitled("the parser fix")).toBeUndefined();
  });

  it("enters a thread from the rail into the hub and marks it seen", async () => {
    const yard = await openYard();
    const child = aSetting({
      id: "child",
      sessionId: conversationId,
      what: { kind: "thread", ref: "child-thread", title: "a split conversation" },
      rung: "card",
      why: "a separate thread for the migration",
    });
    yard.emit([proposed(1, child)]);
    await waitFor(() => cardCalled("a split conversation"));
    pressLeader("y");
    key("Enter");
    await waitFor(() => satelliteOf("child"));
    key("Enter");
    await waitFor(() => expect(yard.answered).toEqual([["child", "seen"]]));
    await waitFor(() =>
      expect(
        [...document.querySelectorAll(".kw-yard-hub .kw-slot")].some(
          (slot) => slot.querySelector(".kw-frame-name")?.textContent === "new session",
        ),
      ).toBe(true),
    );
  });

  it("hangs a lantern on the pane already showing the thing", async () => {
    const yard = await openYard();
    yard.emit([
      proposed(
        1,
        aSetting({
          id: "lantern",
          sessionId: conversationId,
          what: { kind: "thread", ref: conversationId },
          rung: "lantern",
        }),
      ),
    ]);
    await waitFor(() =>
      expect(frameNamed("Wren at home")?.closest(".kw-slot")?.hasAttribute("data-lantern")).toBe(
        true,
      ),
    );
    expect(document.querySelector(".kw-yard-rail")).toBeNull();
  });

  it("saves a hand-raised rule with the console's preferences and follows it in the next sitting", async () => {
    const first = await openYard();
    first.emit([proposed(1, note)]);
    await waitFor(() => cardCalled("the nightly chore found two stale branches"));
    pressLeader("y");
    key("Enter");
    await waitFor(() => satelliteOf("note"));
    expect(JSON.parse(localStorage.getItem("keywork.yard-rules") ?? "[]")).toEqual([
      { creature: "wren", kind: "note", rung: "unfold", lasts: "while-present" },
    ]);

    cleanup();
    const next = await openYard();
    next.emit([
      proposed(
        1,
        aSetting({ ...note, id: "another-note", what: { kind: "note", ref: "a second note" } }),
      ),
    ]);
    await waitFor(() => expect(satelliteOf("another-note").dataset.rung).toBe("unfold"));
  });

  it("keeps the classic tiles one chord away", async () => {
    const yard = await openYard();
    yard.emit([proposed(1, delivery)]);
    await waitFor(() => satelliteOf("delivery"));
    pressLeader("Y", { shiftKey: true });
    await waitFor(() => expect(yardField()?.dataset.mode).toBe("tiles"));
    expect(document.querySelector(".kw-yard-satellite")).toBeNull();
    await screen.findByText("tiles · ctrl+k shift+y returns to the yard", {
      selector: ".kw-status-notice",
    });
    pressLeader("Y", { shiftKey: true });
    await waitFor(() => satelliteOf("delivery"));
  });
});

describe("the yard under the keywork profile", () => {
  it("opens on tiles and holds settings back until the keeper asks for the yard", async () => {
    const yard = await openYard(keyworkProfile);
    expect(yardField()?.dataset.mode).toBe("tiles");
    expect(frameNamed("sessions")).toBeTruthy();
    yard.emit([proposed(1, delivery), proposed(2, note)]);
    await waitFor(() => expect(yard.listed).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.querySelector(".kw-yard-satellite, .kw-yard-rail")).toBeNull();

    pressLeader("Y", { shiftKey: true });
    await waitFor(() => expect(yardField()?.dataset.mode).toBe("yard"));
    await waitFor(() => satelliteOf("delivery"));
    expect(cardTitled("the nightly chore found two stale branches")).toBeTruthy();
  });

  it("makes the focused conversation alone the hub, with no creature imagery", async () => {
    await openYard(keyworkProfile);
    pressLeader("Y", { shiftKey: true });
    await waitFor(() => expect(yardField()?.dataset.mode).toBe("yard"));
    const hub = document.querySelector(".kw-yard-hub") as HTMLElement;
    const names = [...hub.querySelectorAll(".kw-frame-name")].map((name) => name.textContent);
    expect(names).toEqual(["Wren at home"]);
    expect(screen.queryByRole("region", { name: "stead" })).toBeNull();
    expect(hub.querySelectorAll(".kw-seam")).toHaveLength(0);
  });

  it("keeps the focused conversation as the hub when the keeper focuses another tile", async () => {
    await openYard(keyworkProfile);
    pressLeader("Y", { shiftKey: true });
    await waitFor(() => expect(hubNames()).toEqual(["Wren at home"]));
    pressLeader("h");
    await waitFor(() => expect(hubNames()).toEqual(["Wren at home", "sessions"]));
    pressLeader("l");
    await waitFor(() => expect(hubNames()).toEqual(["Wren at home"]));
  });

  it("answers from the same rail with the same keys", async () => {
    const yard = await openYard(keyworkProfile);
    const composer = typing();
    yard.emit([proposed(1, note)]);
    pressLeader("y");
    await waitFor(() => cardCalled("the nightly chore found two stale branches"));
    key("p");
    key("x");
    await waitFor(() =>
      expect(yard.answered).toEqual([
        ["note", "pinned"],
        ["note", "dismissed"],
      ]),
    );
    key("Escape");
    expect(document.activeElement).toBe(composer);
  });
});
