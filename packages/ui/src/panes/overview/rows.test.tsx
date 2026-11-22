import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { createRoot, type JSX } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { mcpPane } from "../mcp/index.tsx";
import type { PaneProps, PaneSpecBase } from "../registry.ts";
import { ChoiceLine, ConfirmLine, createCursor, DraftLine } from "./rows.tsx";
import { holdTypingFocus, mountPane, overviewShell, settle } from "./testing.tsx";

afterEach(cleanup);

describe("createCursor", () => {
  it("clamps to the live row count and never goes negative", () => {
    let count = 3;
    const cursor = createRoot(() => createCursor(() => count));
    cursor.move(5);
    expect(cursor.index()).toBe(2);
    cursor.move(-9);
    expect(cursor.index()).toBe(0);
    cursor.set(2);
    count = 1;
    expect(cursor.index()).toBe(0);
    count = 0;
    expect(cursor.index()).toBe(0);
  });
});

describe("the overview lines", () => {
  it("submits a trimmed draft on enter and cancels on escape", () => {
    const submitted: string[] = [];
    let cancelled = 0;
    const { container } = render(() => (
      <DraftLine
        label="slug"
        onSubmit={(text) => submitted.push(text)}
        onCancel={() => (cancelled += 1)}
      />
    ));
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "  pricing  " } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(submitted).toEqual(["pricing"]);
    expect(cancelled).toBe(1);
  });

  it("confirms only on y and names the choices it offers", () => {
    let confirmed = 0;
    let cancelled = 0;
    const { container } = render(() => (
      <ConfirmLine
        question="abandon arc-1?"
        onConfirm={() => (confirmed += 1)}
        onCancel={() => (cancelled += 1)}
      />
    ));
    const line = container.querySelector(".kw-ov-line") as HTMLElement;
    expect(line.textContent).toBe("abandon arc-1? · y confirms · any other key cancels");
    fireEvent.keyDown(line, { key: "n" });
    fireEvent.keyDown(line, { key: "y" });
    expect([confirmed, cancelled]).toEqual([1, 1]);
  });

  it("routes a choice key to its label and anything else to cancel", () => {
    const chosen: string[] = [];
    const { container } = render(() => (
      <ChoiceLine
        question="scope"
        choices={{ p: "project", u: "user" }}
        onChoose={(key) => chosen.push(key)}
        onCancel={() => chosen.push("cancel")}
      />
    ));
    const line = container.querySelector(".kw-ov-line") as HTMLElement;
    fireEvent.keyDown(line, { key: "u" });
    fireEvent.keyDown(line, { key: "Escape" });
    expect(chosen).toEqual(["u", "cancel"]);
  });
});

describe("the overview panes' keyboard home", () => {
  const panes = [["mcp", mcpPane]] as const;

  it.each(panes)(
    "%s takes DOM focus from a typing field when it is focused",
    async (kind, pane) => {
      const typing = holdTypingFocus();
      const harness = overviewShell();
      await harness.surfaces.load();
      const { container } = mountPane(
        pane.component as (props: PaneProps<PaneSpecBase>) => JSX.Element,
        { kind },
        harness.shell,
      );
      await settle();
      expect(container.firstElementChild?.contains(document.activeElement)).toBe(true);
      typing.remove();
      harness.dispose();
    },
  );
});
