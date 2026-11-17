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

it("leaves Enter and Space to native courtyard controls through workspace key routing", async () => {
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
  const choose = await screen.findByRole("button", { name: "Courtyards" });
  choose.focus();
  for (const key of ["Enter", " "]) {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    choose.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  }
  fireEvent.click(choose);
  const court = await screen.findByRole("button", { name: /Open Stone's courtyard/ });
  court.focus();
  const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  court.dispatchEvent(enter);
  expect(enter.defaultPrevented).toBe(false);
  fireEvent.click(court);
  await waitFor(() => expect(document.activeElement?.textContent).toBe("Stone's courtyard"));
  fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
  await waitFor(() =>
    expect((document.activeElement as HTMLElement)?.dataset.courtyard).toBe("stone"),
  );
});
