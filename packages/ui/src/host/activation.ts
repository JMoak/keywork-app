import type { HostPort, NeedsYouTrigger } from "./port.ts";

export interface ActivationSeams {
  workspace: string;
  show(trigger: NeedsYouTrigger): void;
}

export function followActivations(
  host: Pick<HostPort, "onNotificationActivated">,
  seams: ActivationSeams,
): () => void {
  return host.onNotificationActivated((trigger) => {
    if (trigger.workspace === seams.workspace) seams.show(trigger);
  });
}
