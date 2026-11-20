import type { CreatureSummary } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, expect, it, vi } from "vitest";
import { browserHost } from "../host/browser.ts";
import type { HostPort } from "../host/port.ts";
import type { ShellSeams } from "../panes/registry.ts";
import { MeetCreature, meetingName } from "./meet.tsx";
import { proposeNames } from "./names.ts";

afterEach(cleanup);

it("starts the first conversation with Folio, then binds the selected model without sending a prompt", async () => {
  const draft: CreatureSummary = {
    slug: "wren",
    name: "Wren",
    sigil: "W",
    created: "2026-11-10T00:00:00Z",
    skin: "folio",
    seed: 0,
    workshop: "wren-home",
    models: { strong: "inherit", loop: "inherit", decide: "inherit", vision: "inherit" },
    conversation: "wren-thread",
    threads: 1,
  };
  const model = { provider: "openai", model: "first-model" };
  const serverFetch = vi.fn<HostPort["serverFetch"]>(async () => {
    let bytes: Uint8Array | undefined = new TextEncoder().encode(
      JSON.stringify({
        nodes: [],
        market: [{ kind: "openai" }],
        inherits: { strong: { refused: "missing-capability", detail: "Needs tool support." } },
        conversation: { ...model, mode: "chat" },
      }),
    );
    return {
      status: 200,
      statusText: "",
      headers: [["content-type", "application/json"]],
      read: async () => {
        const chunk = bytes;
        bytes = undefined;
        return chunk;
      },
      cancel: () => {
        bytes = undefined;
      },
    };
  });
  const createCreature = vi.fn(async () => draft);
  const updateCreature = vi.fn(async () => draft);
  const openSession = vi.fn();
  const inject = vi.fn();
  const shell = {
    host: { ...browserHost(), serverFetch },
    workspace: "C:/managed-home",
    client: {
      creatures: async () => [],
      createCreature,
      creature: async () => draft,
      updateCreature,
      inject,
    },
    sessions: { openSession },
    store: { surfaces: { refetch: async () => {} } },
  } as unknown as ShellSeams;

  const proposed = meetingName("C:/managed-home");
  render(() => <MeetCreature shell={shell} creatures={[]} first onCustomize={() => {}} />);
  expect(screen.getByRole("heading", { name: `Meet ${proposed}` })).toBeTruthy();
  expect(
    screen.getByText(
      `${proposed} can help with projects on your computer. Try asking it to explain a file.`,
    ),
  ).toBeTruthy();
  expect(createCreature).not.toHaveBeenCalled();
  expect(serverFetch).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Folio" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.queryByRole("group", { name: "Animation preview" })).toBeNull();
  expect(screen.getByRole("group", { name: "Creature design" }).querySelector("canvas")).toBeNull();
  expect(openSession).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Start a conversation" }));
  expect(
    await screen.findByRole("heading", { name: "How would you like Wren to reply?" }),
  ).toBeTruthy();
  expect(await screen.findByText("first-model")).toBeTruthy();
  expect(screen.getByText(/Conversation only/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Open conversation" }));
  await waitFor(() => expect(openSession).toHaveBeenCalledWith("wren-thread"));
  expect(createCreature).toHaveBeenCalledOnce();
  expect(createCreature).toHaveBeenCalledWith({ name: proposed, skin: "folio" });
  expect(updateCreature).toHaveBeenCalledWith("wren", { models: { strong: model } });
  expect(inject).not.toHaveBeenCalled();
  expect(screen.queryByRole("region", { name: "Meet your creature" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Start a conversation" })).toBeNull();
});

it("introduces the name the customize card proposes first, and steps aside for a creature already at home", () => {
  const shell = {
    host: browserHost(),
    workspace: "C:/managed-home",
    client: { creatures: async () => [] },
  } as unknown as ShellSeams;
  const firstProposal = proposeNames("C:/managed-home")[0];
  render(() => <MeetCreature shell={shell} creatures={[]} first onCustomize={() => {}} />);
  expect(screen.getByRole("heading", { name: `Meet ${firstProposal}` })).toBeTruthy();
  cleanup();

  const resident = { slug: "kit", name: "Kit", conversation: "kit-thread" } as CreatureSummary;
  render(() => (
    <MeetCreature shell={shell} creatures={[resident]} first={false} onCustomize={() => {}} />
  ));
  expect(screen.queryByRole("region", { name: "Meet your creature" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Open current conversation" })).toBeNull();
});

it("previews and rolls designs without creating anything, can undo, then saves the selected creature", async () => {
  const createCreature = vi.fn(async () => ({ slug: "stone", name: "Stone" }) as CreatureSummary);
  const shell = {
    workspace: "C:/managed-home",
    client: { creatures: async () => [], createCreature },
    store: { surfaces: { refetch: async () => {} } },
  } as unknown as ShellSeams;
  render(() => <MeetCreature shell={shell} creatures={[]} first onCustomize={() => {}} />);
  const cairn = screen.getByRole("button", { name: "Cairn" });
  fireEvent.click(cairn);
  expect(cairn.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "See it move" }));
  fireEvent.click(screen.getByRole("button", { name: "Work" }));
  expect(
    screen
      .getByRole("img", { name: `${meetingName(shell.workspace)}, work` })
      .getAttribute("data-skin"),
  ).toBe("cairn");
  expect(createCreature).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Roll a design" }));
  expect(cairn.getAttribute("aria-pressed")).toBe("false");
  expect(createCreature).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Undo roll" }));
  expect(cairn.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Explore first" }));
  await waitFor(() =>
    expect(createCreature).toHaveBeenCalledWith({
      name: meetingName(shell.workspace),
      skin: "cairn",
    }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("region", { name: "Meet your creature" })).toBeNull(),
  );
});

it("keeps a design explicitly brought back from customization", () => {
  const customize = vi.fn();
  const shell = { workspace: "C:/managed-home" } as unknown as ShellSeams;
  render(() => (
    <MeetCreature shell={shell} creatures={[]} initialSkin="carter" first onCustomize={customize} />
  ));
  expect(screen.getByRole("button", { name: "Carter" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Customize first" }));
  expect(customize).toHaveBeenCalledWith("carter");
});

it("returns home from model setup without recreating a resident found on the final check", async () => {
  const resident = {
    slug: "kit",
    name: "Kit",
    skin: "tessera",
    models: { strong: "inherit" },
    conversation: "existing-thread",
  } as CreatureSummary;
  const createCreature = vi.fn();
  const openSession = vi.fn();
  const shell = {
    workspace: "C:/managed-home",
    host: { ...browserHost(), serverFetch: vi.fn().mockRejectedValue(new Error("Offline")) },
    client: { creatures: async () => [resident], createCreature },
    sessions: { openSession },
  } as unknown as ShellSeams;
  render(() => <MeetCreature shell={shell} creatures={[]} first onCustomize={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Start a conversation" }));
  expect(
    await screen.findByRole("heading", { name: "How would you like Kit to reply?" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Explore first" }));
  expect(screen.queryByRole("heading", { name: "How would you like Kit to reply?" })).toBeNull();
  expect(screen.queryByRole("region", { name: "Meet your creature" })).toBeNull();
  expect(createCreature).not.toHaveBeenCalled();
  expect(openSession).not.toHaveBeenCalled();
});
