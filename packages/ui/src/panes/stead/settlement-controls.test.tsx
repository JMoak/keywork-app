import type { WorkshopFamily } from "@keywork-app/habitat";
import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, expect, it } from "vitest";
import { SettlementControls } from "./settlement-controls.tsx";

afterEach(cleanup);

it("keeps editing open while choices change, returns focus when done, and closes for another resident", () => {
  const [selected, setSelected] = createSignal<string | undefined>("a");
  const [family, setFamily] = createSignal<WorkshopFamily>();
  const view = render(() => (
    <SettlementControls
      districts={[
        {
          index: 0,
          start: 0,
          end: 2,
          address: "District 1",
          slugs: ["a", "b"],
          occupied: 2,
          waiting: 0,
        },
      ]}
      district={0}
      onDistrict={() => {}}
      selected={selected()}
      family={family()}
      automaticFamily="gable"
      garden={undefined}
      onFamily={(value) => setFamily(value as WorkshopFamily)}
      onGarden={() => {}}
      overview={false}
      compact={false}
      onArrange={() => {}}
      canUndo={false}
      onUndo={() => {}}
    />
  ));
  const toggle = view.getByRole("button", { name: "Appearance" });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(view.queryByRole("combobox", { name: "Workshop style" })).toBeNull();
  fireEvent.click(toggle);
  const chooser = view.getByRole("combobox", { name: "Workshop style" }) as HTMLSelectElement;
  expect(
    document.getElementById(toggle.getAttribute("aria-controls") ?? "")?.contains(chooser),
  ).toBe(true);
  fireEvent.change(chooser, { target: { value: "canopy" } });
  expect(family()).toBe("canopy");
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(view.getByRole("button", { name: "Done" }));
  expect(document.activeElement).toBe(toggle);
  fireEvent.click(toggle);
  setSelected("b");
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(view.queryByRole("combobox", { name: "Workshop style" })).toBeNull();
  setSelected(undefined);
  expect(view.queryByRole("button", { name: "Appearance" })).toBeNull();
});
