import { createSignal, onCleanup } from "solid-js";
import type { HostPort, UpdateReady } from "../host/port.ts";
import type { CommandSpec } from "../palette/commands.ts";

export type UpdateHost = Pick<HostPort, "onUpdateReady" | "acceptUpdate">;

export interface UpdateOffer {
  waiting(): UpdateReady | undefined;
  accepted(): boolean;
  accept(): void;
}

export function createUpdateOffer(host: UpdateHost): UpdateOffer {
  const [waiting, setWaiting] = createSignal<UpdateReady>();
  const [accepted, setAccepted] = createSignal(false);
  onCleanup(host.onUpdateReady((update) => setWaiting(update)));
  return {
    waiting,
    accepted,
    accept: () => {
      if (waiting() === undefined || accepted()) return;
      host.acceptUpdate().then(
        () => setAccepted(true),
        () => undefined,
      );
    },
  };
}

export function updateLine(update: UpdateReady, accepted: boolean): string {
  return accepted
    ? `update ${update.version} installs when you quit`
    : `update ${update.version} ready`;
}

export const acceptLabel = "install on quit";

export function updateCommands(offer: UpdateOffer): CommandSpec[] {
  const update = offer.waiting();
  if (update === undefined || offer.accepted()) return [];
  return [
    {
      name: "install-update",
      description: `install keywork-app ${update.version} when you quit`,
      run: () => offer.accept(),
    },
  ];
}
