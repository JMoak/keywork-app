import { keyworkProfile, steadProfile } from "@keywork-app/product";
import { cleanup, fireEvent, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("holds unfolds past the budget back as cards and heads the rail with the budget, never with an absence", async () => {
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
    await screen.findByText(/^6 of 6 opened · next at /, {
      selector: ".kw-yard-rail-head",
    });
    expect(screen.queryByText(/while you were away/)).toBeNull();
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
    await waitFor(() => expect(satelliteOf("note").contains(document.activeElement)).toBe(true));
    expect(document.querySelector(".kw-yard-rail[data-active]")).toBeNull();
    expect(yard.answered).toEqual([["delivery", "pinned"]]);

    pressLeader("y");
    key("x");
    await waitFor(() => expect(yard.answered.at(-1)).toEqual(["note", "dismissed"]));
    yard.emit([settled(3, note, "dismissed")]);
    await waitFor(() => expect(document.querySelector('[data-setting="note"]')).toBeNull());

    expect(satelliteOf("delivery").dataset.cursor).toBe("");
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

  it("opens a card from the rail beside the hub and takes the keyboard into it, marking nothing seen", async () => {
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
    await waitFor(() => expect(satelliteOf("child").contains(document.activeElement)).toBe(true));
    expect(yardField()?.dataset.mode).toBe("yard");
    expect(yard.answered).toEqual([]);
  });

  it("marks a panel focused while the keyboard is inside it, so its own keys answer", async () => {
    const yard = await openYard();
    typing();
    yard.emit([proposed(1, delivery)]);
    const panel = await waitFor(() => satelliteOf("delivery"));
    expect(panel.querySelector(".kw-frame")?.hasAttribute("data-focused")).toBe(false);
    const inside = panel.querySelector<HTMLElement>(".kw-frame-body [tabindex]");
    inside?.focus();
    await waitFor(() =>
      expect(panel.querySelector(".kw-frame")?.hasAttribute("data-focused")).toBe(true),
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
    await waitFor(() => cardCalled("the parser fix"));
    expect(document.querySelector(".kw-yard-satellite")).toBeNull();
    await screen.findByText(
      "tiles · what the model shows waits as cards · ctrl+k shift+y returns to the yard",
      {
        selector: ".kw-status-notice",
      },
    );
    pressLeader("Y", { shiftKey: true });
    await waitFor(() => satelliteOf("delivery"));
  });
});

describe("the yard under the keywork profile", () => {
  it("opens on tiles and shows what is set out as cards beside them, saying so", async () => {
    const yard = await openYard(keyworkProfile);
    expect(yardField()?.dataset.mode).toBe("tiles");
    expect(frameNamed("sessions")).toBeTruthy();
    await waitFor(() => expect(yard.listed).toHaveBeenCalled());
    yard.emit([proposed(1, delivery), proposed(2, note)]);
    await waitFor(() => cardCalled("the parser fix"));
    expect(cardTitled("the nightly chore found two stale branches")).toBeTruthy();
    expect(document.querySelector(".kw-yard-satellite")).toBeNull();
    expect(frameNamed("sessions")).toBeTruthy();
    await screen.findByText("2 new things to see · ctrl+k y reaches them", {
      selector: ".kw-status-notice",
    });

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
    pressLeader("h");
    await waitFor(() => expect(hubNames()).toEqual(["Wren at home"]));
  });

  it("makes a tile squeezed beside the conversation a tab in the hub, never a sliver", async () => {
    const stage = stageMeasuring(640, 868);
    await openYard(keyworkProfile);
    stage.mockRestore();
    pressLeader("Y", { shiftKey: true });
    await waitFor(() => expect(hubNames()).toEqual(["Wren at home"]));
    pressLeader("h");
    const tabs = await waitFor(() => screen.getAllByRole("tab"));
    expect(tabs.map((tab) => [tab.textContent, tab.getAttribute("aria-selected")])).toEqual([
      ["Wren at home", "false"],
      ["sessions", "true"],
    ]);
    const conversation = document.querySelector(".kw-slot:has(.kw-conversation)");
    expect(conversation?.hasAttribute("hidden")).toBe(true);
    fireEvent.click(tabs[0] as HTMLElement);
    await waitFor(() => expect(screen.queryAllByRole("tab")).toEqual([]));
    expect(hubNames()).toEqual(["Wren at home"]);
  });

  it("reaches the rail in tiles without leaving tiles, and Esc gives the keyboard back", async () => {
    const yard = await openYard(keyworkProfile);
    const composer = typing();
    yard.emit([proposed(1, note)]);
    await waitFor(() => cardCalled("the nightly chore found two stale branches"));
    pressLeader("y");
    expect(document.activeElement).toBe(document.querySelector(".kw-yard-rail"));
    expect(yardField()?.dataset.mode).toBe("tiles");
    expect(frameNamed("sessions")).toBeTruthy();
    key("Escape");
    expect(document.activeElement).toBe(composer);
    expect(yardField()?.dataset.mode).toBe("tiles");
  });

  it("opens a change from the rail as a tile, with the keyboard in it, and marks it seen", async () => {
    const yard = await openYard(keyworkProfile);
    typing();
    yard.emit([proposed(1, delivery)]);
    await waitFor(() => cardCalled("the parser fix"));
    pressLeader("y");
    key("Enter");
    await waitFor(() => expect(yard.answered).toEqual([["delivery", "seen"]]));
    const tile = frameNamed("changes")?.closest(".kw-slot");
    expect(tile).toBeTruthy();
    await waitFor(() => expect(tile?.contains(document.activeElement)).toBe(true));
    expect(yardField()?.dataset.mode).toBe("tiles");
  });

  it("reads a note on the rail in tiles, marks it seen, and closes the reading with Esc", async () => {
    const yard = await openYard(keyworkProfile);
    typing();
    yard.emit([proposed(1, note)]);
    await waitFor(() => cardCalled("the nightly chore found two stale branches"));
    pressLeader("y");
    key("Enter");
    const reading = await screen.findByRole("article");
    expect(reading.textContent).toBe("the nightly chore found two stale branches");
    await waitFor(() => expect(yard.answered).toEqual([["note", "seen"]]));
    key("Escape");
    expect(screen.queryByRole("article")).toBeNull();
    expect(document.activeElement).toBe(document.querySelector(".kw-yard-rail"));
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

function stageMeasuring(width: number, height: number) {
  const measured = (side: number) =>
    function (this: Element): number {
      return this.classList.contains("kw-stage") ? side : 0;
    };
  const wide = vi
    .spyOn(owning("clientWidth"), "clientWidth", "get")
    .mockImplementation(measured(width));
  const tall = vi
    .spyOn(owning("clientHeight"), "clientHeight", "get")
    .mockImplementation(measured(height));
  return {
    mockRestore: () => {
      wide.mockRestore();
      tall.mockRestore();
    },
  };
}

function owning(property: "clientWidth" | "clientHeight"): HTMLElement {
  let holder: object | null = HTMLDivElement.prototype;
  while (holder !== null && Object.getOwnPropertyDescriptor(holder, property) === undefined) {
    holder = Object.getPrototypeOf(holder);
  }
  if (holder === null) throw new Error(`no prototype defines ${property}`);
  return holder as HTMLElement;
}
