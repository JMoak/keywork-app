import "./switch.css";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import type { AppAction } from "../keys/actions.ts";
import type { CompanionHost, CompanionPreferences, PreferencePatch, Presence } from "./port.ts";

export const companionToggleActionId = "companion.toggle";

export const companionToggleAction: AppAction = {
  chords: "leader shift+a",
  help: "turn the desktop companion on or off",
  command: {
    name: "companion",
    label: "companion on or off",
    aliases: ["companion-toggle", "pet"],
    description:
      "turn the floating companion on or off; the stead's head says where the creature is now",
  },
  invoke: (target) => target.toggleCompanion(),
};

export interface CompanionSwitch {
  enabled(): boolean | undefined;
  line(): string | undefined;
  offering(): boolean;
  considerOffer(creatures: number): void;
  toggle(): Promise<void>;
  accept(): Promise<void>;
  decline(): void;
}

export function companionSwitch(
  host: CompanionHost,
  say: (text: string) => void = () => undefined,
  onboarding: () => boolean = () => false,
): CompanionSwitch {
  const [prefs, setPrefs] = createSignal<CompanionPreferences>();
  const [presence, setPresence] = createSignal<Presence>();
  const [offering, setOffering] = createSignal(false);
  let offered = false;
  void host.preferences().then((read) => setPrefs(read));
  void host.presence().then((read) => setPresence(read));
  onCleanup(host.onPresenceChanged((next) => setPresence(next)));

  const write = async (patch: PreferencePatch): Promise<void> => {
    const written = await host.setPreferences(patch);
    setPrefs(written);
    const now = await host.presence();
    setPresence(now);
  };
  const turn = async (enabled: boolean): Promise<void> => {
    setOffering(false);
    await write({ enabled, optInOffered: true });
    say(switchLine(prefs(), presence()) ?? "");
  };

  return {
    enabled: () => prefs()?.enabled,
    line: () => switchLine(prefs(), presence()),
    offering,
    considerOffer: (creatures) => {
      if (offered || !offerDue(prefs(), creatures, onboarding())) return;
      offered = true;
      setOffering(true);
      void write({ optInOffered: true });
    },
    toggle: () => turn(prefs()?.enabled !== true),
    accept: () => turn(true),
    decline: () => setOffering(false),
  };
}

export function switchLine(
  prefs: CompanionPreferences | undefined,
  presence: Presence | undefined,
): string | undefined {
  if (prefs === undefined) return undefined;
  if (!prefs.enabled) return "companion off";
  return presence === undefined || presence.mode === "off"
    ? "companion on"
    : `companion on · ${presence.reason}`;
}

export function offerDue(
  prefs: CompanionPreferences | undefined,
  creatures: number,
  onboarding: boolean,
): boolean {
  return (
    prefs !== undefined &&
    !prefs.enabled &&
    prefs.optInOffered !== true &&
    creatures > 0 &&
    !onboarding
  );
}

export interface CompanionSwitchRowProps {
  readonly creatures: number;
  readonly chord?: string | undefined;
  readonly switch?: CompanionSwitch | undefined;
}

export function CompanionSwitchRow(props: CompanionSwitchRowProps) {
  const current = (): CompanionSwitch | undefined => props.switch;
  createEffect(() => current()?.considerOffer(props.creatures));
  return (
    <Show when={current()}>
      {(toggle) => (
        <div class="kw-companion-switch">
          <button
            type="button"
            role="switch"
            class="kw-companion-switch-state"
            aria-checked={toggle().enabled() === true}
            onClick={() => void toggle().toggle()}
          >
            {toggle().line() ?? "companion"}
          </button>
          <Show when={props.chord}>
            {(chord) => <span class="kw-companion-switch-key">{chord()}</span>}
          </Show>
          <Show when={toggle().offering()}>
            <span class="kw-companion-offer">
              <span>your creature can also float on the desktop while you work</span>
              <button type="button" onClick={() => void toggle().accept()}>
                turn it on
              </button>
              <button type="button" onClick={() => toggle().decline()}>
                not now
              </button>
            </span>
          </Show>
        </div>
      )}
    </Show>
  );
}
