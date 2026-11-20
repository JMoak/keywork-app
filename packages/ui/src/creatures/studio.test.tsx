import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreatureGallery, CreatureStudio } from "./studio.tsx";

afterEach(cleanup);

describe("the creature design studio", () => {
  it("previews the chosen motion, authored walking direction and paused pose on the native portrait", () => {
    const { container } = render(() => <CreatureStudio skin="tessera" hueStop={1} name="Mica" />);
    const portrait = () => container.querySelector<HTMLCanvasElement>(".kw-studio-motion-portrait");
    expect(screen.getByText(/Painted porcelain/)).toBeTruthy();
    expect(portrait()).toBeNull();
    const disclosure = screen.getByRole("button", { name: "See it move" });
    fireEvent.click(disclosure);
    expect(portrait()?.dataset.skin).toBe("tessera");
    fireEvent.click(screen.getByRole("button", { name: "Walk" }));
    expect(portrait()?.dataset.clip).toBe("walk-right");
    fireEvent.click(screen.getByRole("button", { name: "Turn left" }));
    expect(portrait()?.dataset.clip).toBe("walk-left");
    expect(portrait()?.dataset.facing).toBe("left");
    fireEvent.click(screen.getByRole("button", { name: "Pause preview" }));
    expect(portrait()?.hasAttribute("data-still")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Rest" }));
    expect(portrait()?.dataset.clip).toBe("nap");
    expect(portrait()?.dataset.frame).toBe("0");
    expect(screen.getByRole("button", { name: "Rest" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Play preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Work" }));
    expect(portrait()?.dataset.clip).toBe("work");
    const inspector = screen.getByRole("group", { name: "Animation preview" });
    expect(inspector.contains(portrait())).toBe(true);
    fireEvent.keyDown(inspector, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Animation preview" })).toBeNull();
    expect(portrait()).toBeNull();
    expect(document.activeElement).toBe(disclosure);
  });

  it("returns to the neutral encounter when selecting another design", () => {
    const [skin, setSkin] = createSignal("folio");
    const { container } = render(() => <CreatureStudio skin={skin()} hueStop={1} name="Kit" />);
    fireEvent.click(screen.getByRole("button", { name: "See it move" }));
    fireEvent.click(screen.getByRole("button", { name: "Walk" }));
    setSkin("cairn");
    expect(container.querySelector(".kw-studio-motion-portrait")).toBeNull();
    expect(screen.getByText(/Moss & sandstone/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "See it move" }));
    expect(container.querySelector(".kw-studio-motion-portrait")?.getAttribute("data-clip")).toBe(
      "idle",
    );
  });

  it("keeps every thumbnail still while reading the selected design and disabled state reactively", () => {
    const [selected, setSelected] = createSignal("folio");
    const [busy, setBusy] = createSignal(false);
    const select = vi.fn(setSelected);
    const { container } = render(() => (
      <CreatureGallery
        designs={["folio", "tessera", "cairn"]}
        selected={selected()}
        thumbnails
        hueStop={1}
        disabled={busy()}
        onSelect={select}
      />
    ));
    expect(
      container.querySelectorAll("canvas[data-still][data-clip='idle'][data-frame='0']"),
    ).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Tessera" }));
    expect(select).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Tessera" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    setBusy(true);
    for (const button of container.querySelectorAll("button")) expect(button.disabled).toBe(true);
    expect(container.querySelectorAll("canvas[data-still]")).toHaveLength(3);
  });
});
