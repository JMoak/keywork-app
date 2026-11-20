import { cleanup, fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { afterEach, expect, it } from "vitest";
import { App } from "../app.tsx";
import { browserHost } from "../host/browser.ts";
import { fakeHost, fakeRanch, wrenBot, wrenSummary } from "../panes/creature/testing.ts";
import { fakeClient } from "./client-testing.ts";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

it("gives the body chooser its keys through workspace capture, then returns focus on cancel or save", async () => {
  const resident = wrenSummary();
  const server = fakeHost({ "PATCH /creatures/wren": { status: 200, body: resident } });
  const host = {
    ...browserHost({ server: { url: "http://127.0.0.1:4770", token: "t" } }),
    serverFetch: server.host.serverFetch,
  };
  const client = fakeClient({
    ...fakeRanch().routes,
    creatures: async () => [resident],
    bots: async () => [wrenBot()],
  });
  render(() => <App host={host} connect={() => client} />);
  const input = await screen.findByLabelText("workspace");
  fireEvent.input(input, { target: { value: "C:/work" } });
  fireEvent.submit(input.closest("form") as HTMLFormElement);
  await screen.findByText("sessions", { selector: ".kw-frame-name" });
  press(document.body, "k", { ctrlKey: true });
  press(document.body, "I", { shiftKey: true });

  const opener = await screen.findByRole("button", { name: "Change body" });
  opener.focus();
  expect(press(opener, "b").defaultPrevented).toBe(true);
  const chooser = await screen.findByRole("group", { name: "Change body" });
  const prompt = within(chooser).getByText(/Esc cancels/);
  await waitFor(() => expect(document.activeElement).toBe(prompt));
  press(prompt, "Tab");
  expect(document.activeElement).toBe(within(chooser).getByRole("button", { name: "Tinkerer" }));
  press(document.activeElement as Element, "Tab");
  expect(document.activeElement).toBe(within(chooser).getByRole("button", { name: "Carter" }));
  press(document.activeElement as Element, "Tab", { shiftKey: true });
  expect(document.activeElement).toBe(within(chooser).getByRole("button", { name: "Tinkerer" }));
  const folio = within(chooser).getByRole("button", { name: "Folio" });
  folio.focus();
  for (const key of ["j", "p", "Enter", " "]) {
    expect(press(folio, key).defaultPrevented, key).toBe(false);
    expect(opener.getAttribute("aria-expanded"), key).toBe("true");
    expect(document.activeElement, key).toBe(folio);
  }
  expect(press(folio, "Escape").defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(opener);
  expect(screen.queryByRole("group", { name: "Change body" })).toBeNull();
  expect(server.calls.filter((call) => call.method === "PATCH")).toHaveLength(0);

  fireEvent.click(opener);
  const second = screen.getByRole("group", { name: "Change body" });
  const option = within(second).getByRole("button", { name: "Cairn" });
  await waitFor(() => expect(document.activeElement).toBe(within(second).getByText(/Esc cancels/)));
  option.focus();
  expect(press(option, "4", { ctrlKey: true }).defaultPrevented).toBe(false);
  expect(opener.getAttribute("aria-expanded")).toBe("true");
  expect(press(option, "4").defaultPrevented).toBe(true);
  await waitFor(() =>
    expect(server.calls.filter((call) => call.method === "PATCH")).toEqual([
      { method: "PATCH", path: "/creatures/wren", body: { body: { skin: "tessera" } } },
    ]),
  );
  expect(document.activeElement).toBe(opener);
});

function press(target: Element, key: string, options: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
  target.dispatchEvent(event);
  return event;
}
