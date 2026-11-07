import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { appActions, appBindings } from "../keys/actions.ts";
import { createCompanionController } from "./floating.ts";
import type { CompanionHost, CompanionPreferences, PreferencePatch, Presence } from "./port.ts";
import {
  CompanionSwitchRow,
  companionSwitch,
  companionToggleActionId,
  offerDue,
  switchLine,
} from "./switch.tsx";

const offPreferences: CompanionPreferences = {
  version: 1,
  enabled: false,
  optInOffered: false,
  mode: "floating",
  hidden: false,
  still: false,
  quiet: false,
  onlyWhileBusy: false,
  size: 100,
  shortcut: null,
  motion: "system",
  positions: {},
};

const floating: Presence = { mode: "floating", window: "shown", reason: "floating" };
const off: Presence = { mode: "off", window: "none", reason: "companions are off" };

interface FakeHost extends CompanionHost {
  stored: CompanionPreferences;
  patches: PreferencePatch[];
  emitPresence(presence: Presence): void;
}

function fakeHost(initial: Partial<CompanionPreferences> = {}): FakeHost {
  let presence: Presence = initial.enabled === true ? floating : off;
  let onPresence: ((presence: Presence) => void) | undefined;
  const host: FakeHost = {
    stored: { ...offPreferences, ...initial },
    patches: [],
    emitPresence: (next) => {
      presence = next;
      onPresence?.(next);
    },
    publish: () => undefined,
    preferences: async () => host.stored,
    setPreferences: async (patch) => {
      host.patches.push(patch);
      host.stored = { ...host.stored, ...patch };
      presence = host.stored.enabled ? floating : off;
      return host.stored;
    },
    presence: async () => presence,
    show: async () => undefined,
    hide: async () => undefined,
    onPresenceChanged: (listener) => {
      onPresence = listener;
      return () => undefined;
    },
    onAnswerRequested: () => () => undefined,
    onOpenRequested: () => () => undefined,
    onSettingsRequested: () => () => undefined,
    onSwitchRequested: () => () => undefined,
  };
  return host;
}

const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(cleanup);

describe("the companion switch", () => {
  it("states where the creature is, and says the pane fallback plainly", () => {
    expect(switchLine(undefined, undefined)).toBeUndefined();
    expect(switchLine(offPreferences, off)).toBe("companion off");
    expect(switchLine({ ...offPreferences, enabled: true }, floating)).toBe(
      "companion on · floating",
    );
    expect(
      switchLine(
        { ...offPreferences, enabled: true },
        {
          mode: "pane",
          window: "none",
          reason: "transparent windows paint black on this machine; the creature lives in the pane",
        },
      ),
    ).toBe(
      "companion on · transparent windows paint black on this machine; the creature lives in the pane",
    );
  });

  it("turns the companion on and off through the host port and says so", async () => {
    const host = fakeHost();
    const said: string[] = [];
    await createRoot(async (dispose) => {
      const toggle = companionSwitch(host, (text) => said.push(text));
      await settled();
      expect(toggle.line()).toBe("companion off");
      await toggle.toggle();
      expect(host.patches).toEqual([{ enabled: true, optInOffered: true }]);
      expect(toggle.enabled()).toBe(true);
      expect(toggle.line()).toBe("companion on · floating");
      host.emitPresence({ mode: "floating", window: "none", reason: "hidden until shown" });
      expect(toggle.line()).toBe("companion on · hidden until shown");
      await toggle.toggle();
      expect(host.stored.enabled).toBe(false);
      expect(said).toEqual(["companion on · floating", "companion off"]);
      dispose();
    });
  });

  it("is reachable from the palette and a free leader chord", async () => {
    const action = appActions[companionToggleActionId];
    expect(action?.command?.name).toBe("companion");
    expect(appBindings[companionToggleActionId]).toBe("leader shift+a");
    const host = fakeHost();
    await createRoot(async (dispose) => {
      const toggle = companionSwitch(host);
      const controller = createCompanionController();
      const unbind = controller.bindToggle(toggle);
      await settled();
      action?.invoke({
        toggleCompanion: () => void controller.toggle()?.toggle(),
      } as Parameters<NonNullable<typeof action>["invoke"]>[0]);
      await settled();
      await settled();
      expect(host.stored.enabled).toBe(true);
      unbind();
      expect(controller.toggle()).toBeUndefined();
      dispose();
    });
  });
});

describe("the first-run opt-in", () => {
  it("is due once, after the first creature is made and onboarding has closed", () => {
    expect(offerDue(offPreferences, 1, false)).toBe(true);
    expect(offerDue(offPreferences, 0, false)).toBe(false);
    expect(offerDue(offPreferences, 1, true)).toBe(false);
    expect(offerDue({ ...offPreferences, optInOffered: true }, 1, false)).toBe(false);
    expect(offerDue({ ...offPreferences, enabled: true }, 1, false)).toBe(false);
    expect(offerDue(undefined, 1, false)).toBe(false);
  });

  it("shows one line on the stead, records that it was offered, and turns the companion on", async () => {
    const host = fakeHost();
    const view = render(() => {
      const toggle = companionSwitch(host);
      return <CompanionSwitchRow creatures={1} chord="leader shift+a" switch={toggle} />;
    });
    await settled();
    await settled();
    expect(
      screen.getByText("your creature can also float on the desktop while you work"),
    ).toBeTruthy();
    expect(host.patches).toEqual([{ optInOffered: true }]);
    expect(view.container.querySelector("[role=dialog]")).toBeNull();
    fireEvent.click(screen.getByText("turn it on"));
    await settled();
    await settled();
    expect(host.stored.enabled).toBe(true);
    expect(screen.queryByText("turn it on")).toBeNull();
    const state = screen.getByRole("switch");
    expect(state.getAttribute("aria-checked")).toBe("true");
    expect(state.textContent).toBe("companion on · floating");
    expect(screen.getByText("leader shift+a")).toBeTruthy();
  });

  it("is never offered again once offered, and not now leaves the switch off", async () => {
    const offeredBefore = fakeHost({ optInOffered: true });
    render(() => {
      const toggle = companionSwitch(offeredBefore);
      return <CompanionSwitchRow creatures={2} switch={toggle} />;
    });
    await settled();
    expect(screen.queryByText("turn it on")).toBeNull();
    expect(offeredBefore.patches).toEqual([]);
    cleanup();

    const fresh = fakeHost();
    render(() => {
      const toggle = companionSwitch(fresh);
      return <CompanionSwitchRow creatures={1} switch={toggle} />;
    });
    await settled();
    await settled();
    fireEvent.click(screen.getByText("not now"));
    expect(screen.queryByText("not now")).toBeNull();
    expect(fresh.stored).toMatchObject({ enabled: false, optInOffered: true });
    expect(screen.getByRole("switch").textContent).toBe("companion off");
  });

  it("the row toggles the switch on click", async () => {
    const host = fakeHost({ optInOffered: true });
    render(() => {
      const toggle = companionSwitch(host);
      return <CompanionSwitchRow creatures={1} switch={toggle} />;
    });
    await settled();
    fireEvent.click(screen.getByRole("switch"));
    await settled();
    await settled();
    expect(host.stored.enabled).toBe(true);
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
  });
});
