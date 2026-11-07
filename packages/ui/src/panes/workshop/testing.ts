import type { SessionRow } from "@keywork-app/protocol";
import type { WorkshopDetailRecord, WorkshopHealthReport, WorkshopRecord } from "./port.ts";

export const noon = Date.UTC(2026, 10, 5, 12, 0, 0);

export const bareHostLimitation =
  "bare host: no VM boundary, no egress policy and no credential proxy; brokered credentials appear only as sentinels";

export const unconfinedLimitation =
  "commands run unconfined: windows has no sandbox keywork can use";

export const bareWorkshop: WorkshopRecord = {
  id: "wren-0a1b2c",
  creature: "wren",
  substrate: "host",
  state: "running",
  workdir: "C:\\Users\\keeper\\.keywork\\state\\workshops\\wren-0a1b2c\\home",
  brokers: ["anthropic"],
  limitations: [bareHostLimitation, unconfinedLimitation],
  display: false,
  createdAt: "2026-11-05T09:00:00.000Z",
};

export const sealedWorkshop: WorkshopRecord = {
  id: "tam-9f8e7d",
  creature: "tam",
  substrate: "sbx",
  state: "running",
  workdir: "/home/agent/workspace",
  brokers: ["anthropic", "openrouter"],
  limitations: [
    "cpus 2 and memory 4g are recorded, not applied: sbx documents no create flag for them",
  ],
  display: true,
  createdAt: "2026-11-04T18:30:00.000Z",
};

export const bareTerminalRule =
  'a bare host refuses typed commands until a keeper rule allows them: { action: "workshop.exec", resource: "wren-0a1b2c", effect: "allow" }';

export const bareDetail: WorkshopDetailRecord = {
  ...bareWorkshop,
  egress: { policy: "none", enforced: false, rules: [], brokerHosts: ["api.anthropic.com"] },
  resources: {
    cpus: 2,
    memory: "4g",
    disks: null,
    measured: {
      disk: { usedBytes: 1_610_612_736, sizeBytes: null },
      memory: { usedBytes: null, totalBytes: null },
      unmeasured: ["a bare host shares the machine's memory"],
    },
  },
  refusals: {
    entries: [
      {
        at: "2026-11-05T11:50:00.000Z",
        operation: "exec",
        refused: "forbidden",
        error: bareTerminalRule,
      },
    ],
    unreported: "a bare host refuses no connections",
  },
  terminal: { allowed: false, reason: bareTerminalRule, log: [] },
};

export const sealedDetail: WorkshopDetailRecord = {
  ...sealedWorkshop,
  egress: {
    policy: "deny-all",
    enforced: true,
    rules: [{ host: "registry.npmjs.org", port: 443 }],
    brokerHosts: ["api.anthropic.com", "openrouter.ai"],
  },
  resources: {
    cpus: 2,
    memory: "4g",
    disks: { rootGb: 20, dockerGb: 10 },
    measured: {
      disk: { usedBytes: 3_221_225_472, sizeBytes: 21_474_836_480 },
      memory: { usedBytes: 536_870_912, totalBytes: 4_294_967_296 },
      unmeasured: [],
    },
  },
  refusals: { entries: [], unreported: "refused connections inside sbx are not readable yet" },
  terminal: {
    allowed: true,
    reason: "a microVM takes typed commands without a rule",
    log: [
      {
        at: "2026-11-05T11:40:00.000Z",
        tool: "bash",
        origin: "keeper",
        input: { command: "pwd" },
        outcome: { code: 0, timedOut: false },
      },
    ],
  },
};

export function healthOf(
  workshop: WorkshopRecord,
  health: WorkshopHealthReport["health"],
): WorkshopHealthReport {
  return {
    id: workshop.id,
    substrate: workshop.substrate,
    health,
    limitations: workshop.limitations,
  };
}

export function threadRow(
  id: string,
  title: string,
  bot: string,
  overrides: Partial<SessionRow> = {},
): SessionRow {
  return {
    id,
    title,
    bot,
    createdAt: "2026-11-05T08:00:00.000Z",
    lastActivityAt: "2026-11-05T11:35:00.000Z",
    messageCount: 4,
    ...overrides,
  };
}

export const atMinutesBeforeNoon = (minutes: number): string =>
  new Date(noon - minutes * 60_000).toISOString();
