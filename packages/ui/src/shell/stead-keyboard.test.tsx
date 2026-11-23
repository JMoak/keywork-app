import type { CreatureSummary } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, expect, it } from "vitest";
import { App } from "../app.tsx";
import { browserHost } from "../host/browser.ts";
import { fakeClient } from "./client-testing.ts";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

it("leaves Enter and Space to the stead's native controls through workspace key routing", async () => {
  const creature: CreatureSummary = {
    slug: "stone",
    name: "Stone",
    sigil: "S",
    created: "2026-11-17T12:00:00.000Z",
    skin: "cairn",
    seed: 0,
    workshop: "host",
    conversation: null,
    threads: 0,
    models: { strong: "inherit", loop: "inherit", decide: "inherit", vision: "inherit" },
  };
  render(() => (
    <App
      host={browserHost({ server: { url: "http://127.0.0.1:4770", token: "t" } })}
      connect={() => fakeClient({ creatures: async () => [creature] })}
    />
  ));
  const input = await screen.findByLabelText("workspace");
  fireEvent.input(input, { target: { value: "C:/work" } });
  fireEvent.submit(input.closest("form") as HTMLFormElement);
  await screen.findByText("sessions", { selector: ".kw-frame-name" });
  fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
  fireEvent.keyDown(document.body, { key: "0" });
  const style = await screen.findByRole("button", { name: /^building style Neon/ });
  style.focus();
  for (const key of ["Enter", " "]) {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    style.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  }
  fireEvent.click(style);
  expect(style.getAttribute("aria-label")).toMatch(/^building style Lantern/);
  await waitFor(() =>
    expect(document.querySelector(".kw-stead .kw-ov-head-lead")?.textContent).toMatch(
      /^1 creature/,
    ),
  );
  fireEvent.keyDown(document.querySelector(".kw-stead") as Element, { key: "j" });
  const door = await screen.findByRole("button", { name: "Conversation" });
  door.focus();
  const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  door.dispatchEvent(enter);
  expect(enter.defaultPrevented).toBe(false);
});
