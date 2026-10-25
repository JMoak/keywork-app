import { describeFailure, type ServerLoss, type WorkspaceFailure } from "../host/port.ts";

export type ServerStanding =
  | { readonly kind: "up" }
  | { readonly kind: "lost"; readonly reason: string; readonly reattaching: boolean };

export const serverUp: ServerStanding = { kind: "up" };

export const reconnectCommand = "reconnect";

export function standingAfterLoss(loss: ServerLoss): ServerStanding {
  return lostFor(loss.failure, loss.reattaching === true);
}

export function standingAfterFailure(failure: WorkspaceFailure): ServerStanding {
  return lostFor(failure, false);
}

export function isLost(standing: ServerStanding | undefined): boolean {
  return standing?.kind === "lost";
}

export function standingLine(standing: ServerStanding | undefined, serverLabel: string): string {
  if (standing?.kind !== "lost") return serverLabel;
  if (standing.reattaching) return "server lost · reattaching";
  return `server lost · ${standing.reason} · /${reconnectCommand} tries again`;
}

export function composerHold(standing: ServerStanding | undefined): string | undefined {
  if (standing?.kind !== "lost") return undefined;
  return standing.reattaching
    ? "server lost · reattaching · this prompt waits here until it's back"
    : `server lost · /${reconnectCommand} tries again · this prompt waits here`;
}

export function backNotice(serverLabel: string): string {
  return `keywork is back · ${serverLabel}`;
}

export function promptReturnedNotice(reason: string): string {
  return `keywork didn't take that prompt · ${reason} · it's back in the composer`;
}

function lostFor(failure: WorkspaceFailure, reattaching: boolean): ServerStanding {
  return { kind: "lost", reason: describeFailure(failure), reattaching };
}
