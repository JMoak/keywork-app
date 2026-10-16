import { createRoot, createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import type { PaneSpec } from "../panes/index.ts";
import type { NeedsYouItem } from "./needs-you.ts";
import {
  createJumps,
  itemOfTrigger,
  nextWaiting,
  placeOf,
  placeOfTrigger,
  returnDepth,
} from "./needs-you-jumps.ts";
import { airlockItem, askItem, failedItem, inboxItem } from "./needs-you-testing.ts";
import { createTiler } from "./tiler.ts";

const screen = { width: 8000, height: 8000 };
const disposers: Array<() => void> = [];

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
});

describe("leader n and leader shift+n", () => {
  it("goes to the head's pane, then back to where the person was", () => {
    const desk = deskWith([askItem("c1", { sessionId: "s2" })]);
    desk.open(conversation("s1"));
    desk.open(conversation("s2"));
    desk.focusSession("s1");
    expect(desk.jumps.next()?.key).toBe("C:/work#ask:c1");
    expect(desk.focusedSpec()).toEqual(conversation("s2"));
    expect(desk.jumps.back()).toBe(true);
    expect(desk.focusedSpec()).toEqual(conversation("s1"));
    expect(desk.jumps.back()).toBe(false);
  });

  it("opens the session when no pane shows it, and summons memory for its items", () => {
    const desk = deskWith([askItem("c1", { sessionId: "s7" }), inboxItem("m1")]);
    desk.open(conversation("s1"));
    desk.jumps.next();
    expect(desk.opened).toEqual(["s7"]);
    expect(desk.focusedSpec()).toEqual(conversation("s7"));
    desk.jumps.to(inboxItem("m1"));
    expect(desk.focusedSpec()).toEqual({ kind: "memory" });
  });

  it("walks the queue on repeat and steps back one jump at a time", () => {
    const desk = deskWith([
      askItem("c1", { sessionId: "s2" }),
      askItem("c2", { sessionId: "s3", since: "2026-10-15T11:00:00.000Z" }),
    ]);
    for (const id of ["s1", "s2", "s3"]) desk.open(conversation(id));
    desk.focusSession("s1");
    desk.jumps.next();
    expect(desk.focusedSpec()).toEqual(conversation("s2"));
    desk.jumps.next();
    expect(desk.focusedSpec()).toEqual(conversation("s3"));
    desk.jumps.next();
    expect(desk.focusedSpec()).toEqual(conversation("s2"));
    desk.jumps.back();
    expect(desk.focusedSpec()).toEqual(conversation("s3"));
    desk.jumps.back();
    expect(desk.focusedSpec()).toEqual(conversation("s2"));
    desk.jumps.back();
    expect(desk.focusedSpec()).toEqual(conversation("s1"));
  });

  it("starts from the new head once the item it landed on is answered", () => {
    const desk = deskWith([
      askItem("c1", { sessionId: "s2" }),
      askItem("c2", { sessionId: "s3", since: "2026-10-15T11:00:00.000Z" }),
    ]);
    for (const id of ["s1", "s2", "s3"]) desk.open(conversation(id));
    desk.focusSession("s1");
    desk.jumps.next();
    desk.setItems([askItem("c2", { sessionId: "s3", since: "2026-10-15T11:00:00.000Z" })]);
    desk.jumps.next();
    expect(desk.focusedSpec()).toEqual(conversation("s3"));
  });

  it("stays put with nothing waiting, and a jump that moves nothing records no return", () => {
    const empty = deskWith([]);
    empty.open(conversation("s1"));
    expect(empty.jumps.next()).toBeUndefined();
    expect(empty.jumps.back()).toBe(false);

    const desk = deskWith([askItem("c1"), failedItem("s1")]);
    desk.open(conversation("s1"));
    desk.jumps.next();
    desk.jumps.next();
    expect(desk.jumps.back()).toBe(false);
  });

  it("skips panes closed since the jump, and keeps only a small return stack", () => {
    const desk = deskWith([askItem("c1", { sessionId: "s9" })]);
    desk.open(conversation("s1"));
    const left = desk.focused();
    desk.open(conversation("s2"));
    desk.focusSession("s1");
    desk.jumps.next();
    desk.focusSession("s2");
    desk.jumps.next();
    desk.close(left);
    expect(desk.jumps.back()).toBe(true);
    expect(desk.focusedSpec()).toEqual(conversation("s2"));
    expect(desk.jumps.back()).toBe(false);

    const deep = deskWith([askItem("c1", { sessionId: "target" })]);
    deep.open(conversation("target"));
    for (let at = 0; at < returnDepth + 3; at += 1) {
      deep.open(conversation(`from-${at}`));
      deep.jumps.next();
    }
    let returns = 0;
    while (deep.jumps.back()) returns += 1;
    expect(returns).toBe(returnDepth);
  });

  it("visits a session from the desk with nothing to reveal, and leader shift+n comes back", () => {
    const desk = deskWith([askItem("c1")]);
    desk.open({ kind: "needs-you" });
    desk.jumps.toPlace({ kind: "session", workspace: "C:/work", sessionId: "s4" });
    expect(desk.focusedSpec()).toEqual(conversation("s4"));
    expect(desk.jumps.revealing()).toBeUndefined();
    expect(desk.jumps.back()).toBe(true);
    expect(desk.focusedSpec()).toEqual({ kind: "needs-you" });
  });

  it("asks the pane that answers to reveal the item, once per jump", () => {
    const desk = deskWith([askItem("c1")]);
    desk.open(conversation("s1"));
    expect(desk.jumps.revealing()).toBeUndefined();
    desk.jumps.next();
    const first = desk.jumps.revealing();
    expect(first?.item.key).toBe("C:/work#ask:c1");
    expect(first?.pane).toBe(desk.focused());
    desk.jumps.next();
    expect(desk.jumps.revealing()?.seq).toBeGreaterThan(first?.seq ?? 0);
  });

  it("follows a toast's trigger to its item, or to its place when the item is gone", () => {
    const desk = deskWith([askItem("c1", { sessionId: "s2" }), inboxItem("m1")]);
    desk.open(conversation("s1"));
    desk.jumps.toTrigger({ kind: "ask", workspace: "C:/work", sessionId: "s2", callId: "c1" });
    expect(desk.jumps.revealing()?.item.key).toBe("C:/work#ask:c1");
    desk.jumps.toTrigger({ kind: "ask", workspace: "C:/work", sessionId: "s5", callId: "gone" });
    expect(desk.focusedSpec()).toEqual(conversation("s5"));
    expect(desk.jumps.revealing()?.item.key).toBe("C:/work#ask:c1");
    desk.jumps.toTrigger({ kind: "memory-inbox", workspace: "C:/work", pending: 3 });
    expect(desk.focusedSpec()).toEqual({ kind: "memory" });
    expect(desk.jumps.revealing()?.item.key).toBe("C:/work#inbox:m1");
  });
});

describe("the walk and the places", () => {
  it("takes the head unless focus still rests where the last jump landed", () => {
    const items = [askItem("c1"), askItem("c2"), askItem("c3")];
    expect(nextWaiting(items, undefined, "p1")?.key).toBe("C:/work#ask:c1");
    expect(nextWaiting(items, { key: items[1]?.key ?? "", landed: "p1" }, "p2")).toBe(items[0]);
    expect(nextWaiting(items, { key: items[1]?.key ?? "", landed: "p1" }, "p1")).toBe(items[2]);
    expect(nextWaiting(items, { key: items[2]?.key ?? "", landed: "p1" }, "p1")).toBe(items[0]);
    expect(nextWaiting([], undefined, undefined)).toBeUndefined();
  });

  it("answers asks and failures in their session, airlock and inbox items in memory", () => {
    expect(placeOf(askItem("c1"))).toEqual({
      kind: "session",
      workspace: "C:/work",
      sessionId: "s1",
    });
    expect(placeOf(failedItem("s4")).kind).toBe("session");
    expect(placeOf(airlockItem("pricing"))).toEqual({ kind: "memory", workspace: "C:/work" });
    expect(placeOf(inboxItem("m1")).kind).toBe("memory");
    expect(placeOfTrigger({ kind: "memory-inbox", workspace: "C:/w", pending: 3 })).toEqual({
      kind: "memory",
      workspace: "C:/w",
    });
    expect(
      itemOfTrigger([inboxItem("m1"), askItem("c1")], {
        kind: "ask",
        workspace: "C:/work",
        sessionId: "s1",
        callId: "c1",
      })?.kind,
    ).toBe("ask");
  });
});

function deskWith(initial: NeedsYouItem[]) {
  return createRoot((dispose) => {
    disposers.push(dispose);
    const tiler = createTiler();
    const opened: string[] = [];
    const [items, setItems] = createSignal<readonly NeedsYouItem[]>(initial);
    const jumps = createJumps({
      items,
      focused: () => tiler.focused(),
      show: (place) => {
        if (place.kind === "memory") {
          tiler.summon({ kind: "memory" }, screen);
          return;
        }
        const showing = tiler.findPane(
          (spec) => spec.kind === "conversation" && spec.sessionId === place.sessionId,
        );
        if (showing !== undefined) {
          tiler.focus(showing);
          return;
        }
        opened.push(place.sessionId);
        tiler.open(conversation(place.sessionId), screen);
      },
      refocus: (pane) => tiler.spec(pane) !== undefined && tiler.focus(pane).ok,
    });
    return {
      jumps,
      opened,
      setItems,
      open: (spec: PaneSpec) => void tiler.open(spec, screen),
      close: (pane: string | undefined) => {
        if (pane !== undefined) tiler.close(pane);
      },
      focused: () => tiler.focused(),
      focusedSpec: () => tiler.focusedSpec(),
      focusSession: (sessionId: string) => {
        const pane = tiler.findPane(
          (spec) => spec.kind === "conversation" && spec.sessionId === sessionId,
        );
        if (pane !== undefined) tiler.focus(pane);
      },
    };
  });
}

function conversation(sessionId: string): PaneSpec {
  return { kind: "conversation", sessionId };
}
