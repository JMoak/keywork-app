import type { BatchListener, ConsoleClient } from "@keywork-app/client";
import type { CreatureSummary } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, expect, it, vi } from "vitest";
import { browserHost } from "../host/browser.ts";
import type { ShellSeams } from "../panes/registry.ts";
import { fakeClient } from "../shell/client-testing.ts";
import type { TrustState } from "../shell/trust.ts";
import { inertFeed, inertTrust } from "../shell/trust-testing.ts";
import { OnboardingOnTheStead } from "./index.tsx";

const at = "2026-11-19T12:00:00Z";
const resident: CreatureSummary = {
  slug: "wren",
  name: "Wren",
  skin: "folio",
  sigil: "W",
  created: at,
  seed: 1,
  workshop: "home",
  models: { strong: "inherit", loop: "inherit", decide: "inherit", vision: "inherit" },
  conversation: "wren-talk",
  threads: 0,
};
const refused = { refused: "unserved", detail: "Unavailable" } as const;
type Listing = Awaited<ReturnType<ConsoleClient["creatures"]>>;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

it("distinguishes loading, failed and refused listings from a confirmed empty home and retries without a feed event", async () => {
  const home = fixture();
  const first = pending<Listing>();
  const second = pending<Listing>();
  home.list
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise)
    .mockResolvedValueOnce([]);
  const view = home.open();
  expect(view.getByRole("status").textContent).toMatch(/looking for your creatures/i);
  expect(view.queryByRole("button", { name: "Start a conversation" })).toBeNull();
  first.reject(new Error("offline"));
  await fireEvent.click(await view.findByRole("button", { name: "Retry" }));
  expect(view.getByRole("status").textContent).toMatch(/looking for/i);
  expect(view.queryByRole("region", { name: "Meet your creature" })).toBeNull();
  second.resolve(refused);
  const retry = await view.findByRole("button", { name: "Retry" });
  expect(view.getByRole("status").textContent).toMatch(/couldn’t load your creatures/i);
  expect(view.queryByRole("region", { name: "Meet your creature" })).toBeNull();
  await fireEvent.click(retry);
  expect(await view.findByRole("region", { name: "Meet your creature" })).toBeTruthy();
  expect(home.list).toHaveBeenCalledTimes(3);
  expect(home.create).not.toHaveBeenCalled();
  expect(home.showing.mock.calls.flat()).not.toContain(false);
  view.unmount();
  expect(home.showing).toHaveBeenLastCalledWith(false);
});

it("keeps the chosen design and its focus through a background refresh failure", async () => {
  const home = fixture();
  const refresh = pending<Listing>();
  home.list.mockResolvedValueOnce([]).mockReturnValueOnce(refresh.promise);
  const view = home.open();
  const chosen = await view.findByRole("button", { name: "Cairn" });
  await fireEvent.click(chosen);
  chosen.focus();
  home.changed();
  expect(view.queryByRole("status")).toBeNull();
  refresh.resolve(refused);
  await settles();
  expect(view.getByRole("button", { name: "Cairn" })).toBe(chosen);
  expect(chosen.getAttribute("aria-pressed")).toBe("true");
  expect(document.activeElement).toBe(chosen);
  expect(view.queryByRole("button", { name: "Retry" })).toBeNull();
});

it("keeps the first encounter visible while saving and through model setup as the new resident reaches home", async () => {
  const home = fixture();
  const created = pending<CreatureSummary>();
  home.create.mockReturnValue(created.promise);
  home.list
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([resident])
    .mockResolvedValueOnce(refused);
  const view = home.open();
  await fireEvent.click(await view.findByRole("button", { name: "Start a conversation" }));
  await waitFor(() => expect(home.create).toHaveBeenCalledTimes(1));
  home.hasResidents(true);
  home.changed();
  await settles();
  expect(view.getByRole("region", { name: "Meet your creature" }).getAttribute("aria-busy")).toBe(
    "true",
  );
  created.resolve(resident);
  const setup = await view.findByRole("heading", { name: "How would you like Wren to reply?" });
  home.changed();
  await settles();
  expect(view.getByRole("heading", { name: "How would you like Wren to reply?" })).toBe(setup);
  expect(home.showing.mock.calls.flat()).not.toContain(false);
  await fireEvent.click(view.getByRole("button", { name: "Explore first" }));
  await waitFor(() => expect(home.showing).toHaveBeenLastCalledWith(false));
});

it("keeps the returning home visible after a known resident or a successful listing", async () => {
  const home = fixture();
  home.hasResidents(true);
  home.list
    .mockResolvedValueOnce(refused)
    .mockResolvedValueOnce([resident])
    .mockResolvedValueOnce(refused);
  const view = home.open();
  expect(view.queryByRole("status")).toBeNull();
  await settles();
  expect(view.queryByRole("button", { name: "Retry" })).toBeNull();
  home.changed();
  await settles();
  home.hasResidents(false);
  home.changed();
  await settles();
  expect(home.list).toHaveBeenCalledTimes(3);
  expect(view.queryByRole("status")).toBeNull();
  expect(view.queryByRole("region", { name: "Meet your creature" })).toBeNull();
  expect(home.showing.mock.calls.flat()).not.toContain(true);
});

it("coalesces a burst of changes and discards an obsolete empty response", async () => {
  const home = fixture();
  const stale = pending<Listing>();
  const fresh = pending<Listing>();
  home.list.mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise);
  const view = home.open();
  for (let i = 0; i < 10; i++) home.changed();
  expect(home.list).toHaveBeenCalledTimes(1);
  stale.resolve([]);
  await waitFor(() => expect(home.list).toHaveBeenCalledTimes(2));
  expect(view.queryByRole("region", { name: "Meet your creature" })).toBeNull();
  expect(view.getByRole("status").textContent).toMatch(/looking for/i);
  fresh.resolve([resident]);
  await waitFor(() => expect(view.queryByRole("status")).toBeNull());
  expect(view.queryByRole("button", { name: "Start a conversation" })).toBeNull();
});

it("waits for trust, invalidates earlier roots, and ignores completions after disposal", async () => {
  const home = fixture();
  const old = pending<Listing>();
  const last = pending<Listing>();
  home.trust({ kind: "undecided", root: "/home" });
  home.list
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce([resident])
    .mockReturnValueOnce(last.promise);
  const view = home.open();
  home.changed();
  expect(home.list).not.toHaveBeenCalled();
  expect(view.queryByRole("status")).toBeNull();
  home.trust({ kind: "trusted", root: "/home" });
  home.trust({ kind: "trusted", root: "/new-home" });
  await settles();
  old.resolve([]);
  await settles();
  expect(view.queryByRole("region", { name: "Meet your creature" })).toBeNull();
  home.changed();
  expect(home.list).toHaveBeenCalledTimes(3);
  view.unmount();
  const count = home.showing.mock.calls.length;
  last.resolve([]);
  await settles();
  home.changed();
  expect(home.list).toHaveBeenCalledTimes(3);
  expect(home.showing).toHaveBeenCalledTimes(count);
  expect(home.showing).toHaveBeenLastCalledWith(false);
});

function fixture() {
  const list = vi.fn<ConsoleClient["creatures"]>();
  const create = vi.fn<ConsoleClient["createCreature"]>();
  const showing = vi.fn<(visible: boolean) => void>();
  const listeners = new Set<BatchListener>();
  const [trusted, trust] = createSignal<TrustState>({ kind: "trusted", root: "/home" });
  const [occupied, hasResidents] = createSignal(false);
  const host = browserHost();
  host.serverFetch = vi.fn().mockRejectedValue(new Error("No models configured"));
  const shell = {
    workspace: "/home",
    host,
    client: fakeClient({ creatures: list, createCreature: create }),
    trust: { ...inertTrust(), state: trusted },
    feed: {
      ...inertFeed(),
      subscribe(listener: BatchListener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    store: { state: { summaries: [] }, surfaces: { refetch: vi.fn() } },
  } as unknown as ShellSeams;
  return {
    list,
    create,
    showing,
    trust,
    hasResidents,
    open: () =>
      render(() => (
        <OnboardingOnTheStead
          automatic
          simple
          shell={shell}
          hasResidents={occupied()}
          onShowingChange={showing}
        />
      )),
    changed() {
      for (const listener of listeners)
        listener([
          {
            id: 1,
            ts: at,
            sessionId: "",
            type: "creature.changed",
            payload: { slug: "wren", change: "created" },
          },
        ]);
    },
  };
}

function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}

async function settles() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}
