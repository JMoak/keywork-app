import { emptyProjection } from "@keywork-app/client";
import type { SessionSummary } from "@keywork-app/protocol";
import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { createRoot, type JSX } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { browserHost } from "../../host/browser.ts";
import {
  emptySurfacesClient,
  fakeFeed,
  fixtureSurfacesClient,
} from "../../shell/surfaces-store.test.ts";
import {
  createSurfacesStore,
  type SurfacesClient,
  type SurfacesStore,
} from "../../shell/surfaces-store.ts";
import { inertShellExtras } from "../../shell/trust.test.ts";
import type { PaneProps, PaneSpecBase, ShellSeams } from "../registry.ts";
import { ChoiceLine, ConfirmLine, createCursor, DraftLine } from "./rows.tsx";

export interface OverviewHarness {
  shell: ShellSeams;
  surfaces: SurfacesStore;
  client: SurfacesClient & { calls: string[] };
  emit: ReturnType<typeof fakeFeed>["emit"];
  opened: string[];
  refreshed: () => number;
  dispose: () => void;
}

export interface OverviewOptions {
  client?: Partial<SurfacesClient> | undefined;
  summaries?: SessionSummary[] | undefined;
  currentSession?: string | undefined;
  empty?: boolean | undefined;
}

export function overviewShell(options: OverviewOptions = {}): OverviewHarness {
  const feed = fakeFeed();
  const client = options.empty
    ? Object.assign(emptySurfacesClient(), { calls: [] as string[] }, options.client)
    : fixtureSurfacesClient(options.client);
  const summaries = options.summaries ?? [];
  const opened: string[] = [];
  let refreshes = 0;
  const [surfaces, dispose] = createRoot((dispose) => [
    createSurfacesStore(client, feed.feed),
    dispose,
  ]);
  const shell: ShellSeams = {
    store: {
      state: { summaries, projections: {}, loading: {}, gap: undefined, lost: undefined },
      projection: () => emptyProjection,
      summary: (id: string | undefined) => summaries.find((summary) => summary.id === id),
      refresh: async () => {
        refreshes += 1;
      },
      surfaces,
    } as unknown as ShellSeams["store"],
    keys: { chord: (action) => `ctrl+k ${action}`, leader: () => "ctrl+k" },
    sessions: {
      openSession: (id) => {
        opened.push(id);
      },
      newSession: async () => {},
      startSession: async () => {},
    },
    host: browserHost({ server: { url: "http://127.0.0.1:4770", token: "t" } }),
    workspace: "C:/work",
    currentSession: () => options.currentSession,
    rebind: () => {},
    unseen: () => false,
    ...inertShellExtras(),
  };
  return { shell, surfaces, client, emit: feed.emit, opened, refreshed: () => refreshes, dispose };
}

export function mountPane<Spec extends PaneSpecBase>(
  Component: (props: PaneProps<Spec>) => JSX.Element,
  spec: Spec,
  shell: ShellSeams,
): { container: HTMLElement; act: (action: string) => void } {
  let handle: (action: string) => void = () => {};
  const { container } = render(() => (
    <Component
      id="p1"
      spec={spec}
      focused={true}
      shell={shell}
      onAction={(handler) => {
        handle = handler;
      }}
    />
  ));
  return { container, act: (action) => handle(action) };
}

export const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export function rowTexts(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".kw-ov-row")].map((row) =>
    [".kw-ov-mark", ".kw-ov-name", ".kw-ov-aside"]
      .map((part) => row.querySelector(part)?.textContent?.trim() ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .replace(/( ·)? (now|\d+[mhd])$/, "")
      .trim(),
  );
}

export function cursorRow(container: HTMLElement): string {
  return container.querySelector(".kw-ov-row[data-cursor] .kw-ov-name")?.textContent?.trim() ?? "";
}

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
