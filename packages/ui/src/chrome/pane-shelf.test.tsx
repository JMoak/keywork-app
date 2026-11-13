import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { PaneShelf, type ShelfItem, shelfLabel } from "./pane-shelf.tsx";

afterEach(cleanup);

const terminal: ShelfItem = {
  id: "terminal-1",
  name: "terminal",
  ordinal: 3,
  why: "shelved",
  state: "working",
  pinned: false,
};

const conversation: ShelfItem = {
  id: "conversation-2",
  name: "fix the gate",
  ordinal: 5,
  why: "tucked",
  state: "needs-you",
  pinned: true,
};

describe("PaneShelf", () => {
  it("renders nothing while every pane is on the stage", () => {
    const { container } = render(() => (
      <PaneShelf items={[]} hint="ctrl+k =" onReturn={() => undefined} />
    ));
    expect(container.querySelector(".kw-shelf")).toBeNull();
  });

  it("lists each waiting pane by its ordinal and name, and says which wait for room", () => {
    const { container } = render(() => (
      <PaneShelf items={[terminal, conversation]} hint="ctrl+k =" onReturn={() => undefined} />
    ));
    const panes = [...container.querySelectorAll<HTMLElement>(".kw-shelf-pane")];
    expect(panes.map((pane) => pane.querySelector(".kw-shelf-ordinal")?.textContent)).toEqual([
      "3",
      "5",
    ]);
    expect(panes.map((pane) => pane.querySelector(".kw-shelf-name")?.textContent)).toEqual([
      "terminal",
      "fix the gate",
    ]);
    expect(panes.map((pane) => pane.dataset.why)).toEqual(["shelved", "tucked"]);
    expect(panes[0]?.querySelector(".kw-shelf-why")).toBeNull();
    expect(panes[1]?.querySelector(".kw-shelf-why")?.textContent).toBe("waiting for room");
    expect(container.querySelector(".kw-shelf-hint")?.textContent).toBe(
      "ctrl+k = returns the last",
    );
  });

  it("keeps a waiting pane's state in sight: its stamp, its pin, and a needs-you in the label", () => {
    const { container } = render(() => (
      <PaneShelf items={[terminal, conversation]} hint={undefined} onReturn={() => undefined} />
    ));
    const [working, wanting] = [...container.querySelectorAll<HTMLElement>(".kw-shelf-pane")];
    expect(working?.dataset.state).toBe("working");
    expect(working?.querySelector(".kw-shelf-stamp")?.textContent).toBe("▌");
    expect(working?.querySelector(".kw-shelf-pin")).toBeNull();
    expect(wanting?.querySelector(".kw-shelf-pin")).not.toBeNull();
    expect(wanting?.getAttribute("aria-label")).toBe(
      "fix the gate, pane 5, waiting for room, needs you",
    );
    expect(shelfLabel(terminal)).toBe("terminal, pane 3, shelved");
    expect(container.querySelector(".kw-shelf-hint")).toBeNull();
  });

  it("hands the pane's id back when its entry is activated", () => {
    const returned: string[] = [];
    const { container } = render(() => (
      <PaneShelf items={[terminal]} hint={undefined} onReturn={(id) => returned.push(id)} />
    ));
    fireEvent.click(container.querySelector(".kw-shelf-pane") as HTMLElement);
    expect(returned).toEqual(["terminal-1"]);
  });
});
