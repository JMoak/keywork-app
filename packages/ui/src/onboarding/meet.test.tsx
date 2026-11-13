import type { CreatureSummary } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, expect, it, vi } from "vitest";
import { browserHost } from "../host/browser.ts";
import type { HostPort } from "../host/port.ts";
import type { ShellSeams } from "../panes/registry.ts";
import { MeetCreature, meetingName } from "./meet.tsx";
import { proposeNames } from "./names.ts";

vi.mock("./portrait.tsx", () => ({ Portrait: () => <span>Creature portrait</span> }));

afterEach(cleanup);

it("lets the keeper meet and keep a creature before setup, then binds the selected model without sending a prompt", async () => {
  const draft: CreatureSummary = {
    slug: "wren",
    name: "Wren",
    sigil: "W",
    created: "2026-11-10T00:00:00Z",
    skin: "kid",
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
  expect(createCreature).not.toHaveBeenCalled();
  expect(serverFetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Explore first" }));
  expect(await screen.findByRole("heading", { name: "Wren" })).toBeTruthy();
  expect(createCreature).toHaveBeenCalledWith({ name: proposed, skin: "kid" });
  expect(serverFetch).not.toHaveBeenCalled();
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
