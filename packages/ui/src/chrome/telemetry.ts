import type { SessionProjection } from "@keywork-app/client";
import type { CostReport } from "@keywork-app/protocol";
import { usageLine } from "../instruments/cost.ts";
import { reportedUsageLine } from "../instruments/cost-report.ts";

export const liveTurnsOnly = "live turns only";

export function telemetry(projection: SessionProjection, report?: CostReport): string {
  if (report !== undefined) return reportedUsageLine(report);
  const live = usageLine(projection.usage);
  return live === "" ? "" : `${live}${itemJoint}${liveTurnsOnly}`;
}

export function compactTelemetry(line: string): string {
  return line
    .split(itemJoint)
    .filter((item) => item !== liveTurnsOnly && !tokensItem.test(item))
    .join(itemJoint);
}

export function relativeAge(iso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

const itemJoint = " · ";
const tokensItem = / tokens$/;
