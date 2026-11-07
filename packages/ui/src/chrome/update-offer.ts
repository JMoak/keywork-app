import { keyworkProfile, type ProductProfile } from "@keywork-app/product";
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
  onCleanup(
    host.onUpdateReady((update) => {
      if (!sameOffer(waiting(), update)) setAccepted(false);
      setWaiting(update);
    }),
  );
  return {
    waiting,
    accepted,
    accept: () => {
      const update = waiting();
      if (update === undefined || update.reviewRequired === true || accepted()) return;
      host.acceptUpdate().then(
        () => {
          if (sameOffer(waiting(), update)) setAccepted(true);
        },
        () => undefined,
      );
    },
  };
}

export function updateLine(update: UpdateReady, accepted: boolean): string {
  if (update.reviewRequired === true)
    return `update ${update.version} available · manual compatibility review required`;
  return accepted
    ? `update ${update.version} installs when you quit`
    : `update ${update.version} ready`;
}

export const acceptLabel = "install on quit";

export function updateCommands(
  offer: UpdateOffer,
  profile: ProductProfile = keyworkProfile,
): CommandSpec[] {
  const update = offer.waiting();
  if (update === undefined || update.reviewRequired === true || offer.accepted()) return [];
  return [
    {
      name: "install-update",
      description: `install ${profile.name} ${update.version} when you quit`,
      run: () => offer.accept(),
    },
  ];
}

function sameOffer(current: UpdateReady | undefined, update: UpdateReady): boolean {
  return current?.version === update.version && current.reviewRequired === update.reviewRequired;
}
