import type { PaneId } from "../layout/index.ts";
import type { PaneSpec } from "../panes/index.ts";
import type { HostPort, NeedsYouTrigger } from "./port.ts";

export interface ActivationSeams {
  workspace: string;
  findPane(matches: (spec: PaneSpec) => boolean): PaneId | undefined;
  focusPane(id: PaneId): void;
  openSession(sessionId: string): void;
  summonMemory(): void;
}

export function followActivations(
  host: Pick<HostPort, "onNotificationActivated">,
  seams: ActivationSeams,
): () => void {
  return host.onNotificationActivated((trigger) => {
    if (trigger.workspace === seams.workspace) showWhatNeedsYou(trigger, seams);
  });
}

export function showWhatNeedsYou(trigger: NeedsYouTrigger, seams: ActivationSeams): void {
  if (trigger.kind === "memory-inbox") {
    seams.summonMemory();
    return;
  }
  const asking = seams.findPane(
    (spec) => spec.kind === "conversation" && spec.sessionId === trigger.sessionId,
  );
  if (asking === undefined) seams.openSession(trigger.sessionId);
  else seams.focusPane(asking);
}
