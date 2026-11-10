import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { keyworkProfile, type ProductProfile } from "@keywork-app/product";
import { z } from "zod";
import { runtimeFailure } from "./runtime-failure.ts";
import {
  type ContractMismatch,
  expectedContract,
  type NodeTicketOwner,
  type ServeFailure,
} from "./serve-process.ts";
import type { NodeServing } from "./workspace.ts";

export type NodeAnswer = "installed" | "declined";

export const nodeAnswerFiles: Record<NodeAnswer, string> = {
  installed: "node-installed.json",
  declined: "node-declined.json",
};
export const runtimeConsumerFile = "runtime-consumer.id";
export const noWorkspaceFlag = "--no-workspace";
export const nodeStatusArgs = ["node", "status", "--json"] as const;
export const nodeRestartArgs = ["node", "restart"] as const;
export const nodeWorkspaceRemoveArgs = ["node", "workspace", "remove"] as const;

export function nodeWorkspaceAddArgs(consolePid: number): readonly string[] {
  return ["node", "workspace", "add", "--console", String(consolePid)];
}

export function nodeInstallArgs(folder: string | undefined): readonly string[] {
  return folder === undefined ? ["node", "install", noWorkspaceFlag] : ["node", "install"];
}

export const nodeAnswerRecord = z.object({
  schema: z.literal(1).describe("The persisted consent record version."),
  answer: z
    .enum(["installed", "declined"])
    .describe(
      "Consent to background execution; this record is never evidence of runtime ownership.",
    ),
  at: z.string().describe("The time the keeper gave this consent."),
  machine: z.string().describe("The machine where this consent was given."),
});

export type NodeAnswerRecord = z.infer<typeof nodeAnswerRecord>;

export interface ConsentCard {
  title: string;
  message: string;
  detail: string;
  install: string;
  decline: string;
}

export interface FailureCard {
  title: string;
  message: string;
  detail: string;
}

export interface SidecarRun {
  code: number | null;
  output: string;
}

export interface NodeConsentSeams {
  profile?: ProductProfile;
  platform: NodeJS.Platform;
  machine: string;
  account: string;
  userData: string;
  sidecar: string;
  folder: string | undefined;
  exists(path: string): Promise<boolean>;
  modifiedAt(path: string): Promise<number | undefined>;
  readText(path: string): Promise<string | undefined>;
  writeText(path: string, text: string): Promise<void>;
  ask(card: ConsentCard): Promise<boolean>;
  tell(card: FailureCard): Promise<void>;
  run(binary: string, args: readonly string[], cwd?: string): Promise<SidecarRun>;
  now(): Date;
}

export type NodeOffer =
  | { kind: "answered"; answer: NodeAnswer }
  | { kind: "no-sidecar" }
  | { kind: "declined" }
  | { kind: "installed" }
  | { kind: "failed"; code: number | null; detail: string };

export interface NodeStanding {
  runtimeCompatibility?: number;
  installed: boolean;
  program: string | null;
  running: boolean;
  startedAt: string | null;
  tickets: readonly string[];
  version?: string;
  contract?: string;
}

export type NodeUpgrade =
  | { kind: "no-sidecar" }
  | { kind: "unknown" }
  | { kind: "not-installed" }
  | { kind: "another-install"; program: string | null }
  | { kind: "current" }
  | { kind: "restarted"; line: string }
  | { kind: "failed"; line: string };

type UpgradeSeams = Pick<
  NodeConsentSeams,
  "platform" | "sidecar" | "exists" | "modifiedAt" | "run" | "profile"
>;
type RefusalSeams = Pick<
  NodeConsentSeams,
  "platform" | "machine" | "sidecar" | "ask" | "run" | "profile"
>;

export async function offerNodeAtFirstRun(
  seams: NodeConsentSeams,
  options: { reconsiderDecline?: boolean } = {},
): Promise<NodeOffer> {
  const earlier = await answerGiven(seams);
  if (earlier === "declined" && !options.reconsiderDecline)
    return { kind: "answered", answer: earlier };
  if (!(await seams.exists(seams.sidecar))) return { kind: "no-sidecar" };
  if (earlier !== "installed" && !(await seams.ask(nodeConsentCard(seams)))) {
    await recordAnswer(seams, "declined");
    return { kind: "declined" };
  }
  const profile = seams.profile ?? keyworkProfile;
  const installation = consumerInstallationId(seams);
  const refusal = bootstrapRefusal(await readNodeStanding(seams));
  const ran =
    refusal ?? (await seams.run(seams.sidecar, nodeConsumerArgs("install", profile, installation)));
  if (ran.code !== 0) {
    const failure = runtimeFailure(ran.output);
    const detail = [failure.message, failure.nextAction].filter(Boolean).join("\n\n");
    await seams.tell(nodeFailureCard(seams.machine, ran.code, detail, profile));
    return { kind: "failed", code: ran.code, detail };
  }
  await seams.writeText(join(seams.userData, runtimeConsumerFile), `${installation}\n`);
  await recordAnswer(seams, "installed");
  return earlier === "installed" ? { kind: "answered", answer: earlier } : { kind: "installed" };
}

export function consumerInstallationId(
  seams: Pick<NodeConsentSeams, "profile" | "machine" | "userData" | "platform">,
): string {
  const profile = seams.profile ?? keyworkProfile;
  const path = seams.userData.replaceAll("\\", "/");
  const canonical = seams.platform === "win32" ? path.toLowerCase() : path;
  return createHash("sha256")
    .update([profile.id, seams.machine, canonical].join("\0"))
    .digest("hex")
    .slice(0, 32);
}

export function nodeConsumerArgs(
  action: "install" | "remove",
  profile: ProductProfile,
  installation: string,
): readonly string[] {
  return [
    "node",
    "consumer",
    action,
    "--product",
    profile.id,
    "--installation",
    installation,
    ...(action === "install" ? ["--contract", expectedContract] : []),
    "--json",
  ];
}

export async function restartAnOlderNode(seams: UpgradeSeams): Promise<NodeUpgrade> {
  if (!(await seams.exists(seams.sidecar))) return { kind: "no-sidecar" };
  const standing = await readNodeStanding(seams);
  if (standing === undefined) return { kind: "unknown" };
  if (!standing.installed) return { kind: "not-installed" };
  if (standing.contract === undefined) return { kind: "unknown" };
  if (standing.contract === expectedContract) {
    return { kind: "current" };
  }
  return {
    kind: "failed",
    line: "This app needs a matching shared engine. Incompatible upgrades require explicit maintenance; existing clients and background work remain running.",
  };
}

export async function answerNodeRefusal(
  seams: RefusalSeams,
  failure: ContractMismatch,
): Promise<ServeFailure> {
  if (failure.source?.origin !== "ticket") return failure;
  const node = ticketOwner(await readNodeStanding(seams), failure.ticket.url, seams);
  return node === undefined
    ? failure
    : { ...failure, source: { ...failure.source, node: "shared-runtime" } };
}

export function sidecarNodeServing(
  seams: Pick<NodeConsentSeams, "sidecar" | "run" | "profile"> & {
    consolePid: number;
    clientId?: () => string;
  },
): NodeServing {
  const clients = new Map<string, string>();
  const profile = seams.profile ?? keyworkProfile;
  let standing: NodeStanding | undefined;
  let inspected = false;
  const inspect = async (): Promise<NodeStanding | undefined> => {
    standing = await readNodeStanding(seams);
    inspected = true;
    return standing;
  };
  const attach = async (folder: string, home = false): Promise<SidecarRun> => {
    const refusal = bootstrapRefusal(inspected ? standing : await inspect());
    if (refusal !== undefined) return refusal;
    const id = clients.get(folder) ?? (seams.clientId ?? randomUUID)();
    clients.set(folder, id);
    return seams.run(seams.sidecar, [
      "node",
      "client",
      "attach",
      folder,
      "--product",
      profile.id,
      "--client",
      id,
      "--console",
      String(seams.consolePid),
      "--contract",
      expectedContract,
      ...(home ? ["--home"] : []),
      "--json",
    ]);
  };
  return {
    required: true,
    serves: async () => {
      const standing = await inspect();
      return standing?.installed === true && standing.running;
    },
    add: attach,
    renew: attach,
    remove: async (folder) => {
      const id = clients.get(folder);
      if (id === undefined) return { code: 0, output: "" };
      clients.delete(folder);
      return seams.run(seams.sidecar, ["node", "client", "detach", "--client", id, "--json"]);
    },
  };
}

export async function readNodeStanding(
  seams: Pick<NodeConsentSeams, "sidecar" | "run">,
): Promise<NodeStanding | undefined> {
  const ran = await seams.run(seams.sidecar, nodeStatusArgs);
  if (ran.code !== 0) return undefined;
  const report = parsedStatus(ran.output);
  if (report === undefined) return undefined;
  return {
    ...(report.runtimeCompatibility !== undefined && {
      runtimeCompatibility: report.runtimeCompatibility,
    }),
    installed: report.registration?.installed ?? false,
    program: report.registration?.program ?? null,
    running: report.liveness === "running",
    startedAt: report.node?.startedAt ?? null,
    tickets: (report.node?.workspaces ?? []).flatMap(({ url }) => (url === null ? [] : [url])),
    ...(report.node?.version !== undefined && { version: report.node.version }),
    ...(report.node?.contract !== undefined && { contract: report.node.contract }),
  };
}

export function ticketOwner(
  standing: NodeStanding | undefined,
  ticketUrl: string,
  _seams: Pick<NodeConsentSeams, "platform" | "sidecar">,
): NodeTicketOwner | undefined {
  return standing?.tickets.some((url) => sameUrl(url, ticketUrl)) ? "shared-runtime" : undefined;
}

export function isThisInstall(
  standing: NodeStanding,
  seams: Pick<NodeConsentSeams, "platform" | "sidecar">,
): boolean {
  return (
    standing.installed &&
    standing.program !== null &&
    sameProgram(standing.program, seams.sidecar, seams.platform)
  );
}

export function sameProgram(left: string, right: string, platform: NodeJS.Platform): boolean {
  const plain = (path: string): string => {
    const slashes = path.replaceAll("\\", "/");
    return platform === "win32" ? slashes.toLowerCase() : slashes;
  };
  return plain(left) === plain(right);
}

export function nodeConsentCard(
  seams: Pick<NodeConsentSeams, "platform" | "machine" | "account" | "profile"> & {
    folder?: string | undefined;
  },
): ConsentCard {
  const product = (seams.profile ?? keyworkProfile).name;
  return {
    title: `${product}: background work`,
    message: `Enable background work on ${seams.machine}?`,
    detail: [
      `A shared engine runs as ${seams.account} and keeps authorized work going after either app closes.`,
      "Your creature can have a private home before you choose a project. Opening a project grants only the access you approve.",
      "Both apps use the same compatible engine. Uninstalling one app preserves the other app and any authorized work.",
    ].join("\n\n"),
    install: "Enable background work",
    decline: "Not now",
  };
}

export function nodeRestartCard(
  machine: string,
  _refusal: ContractMismatch,
  profile: ProductProfile = keyworkProfile,
): ConsentCard {
  return {
    title: `${profile.name}: shared engine update`,
    message: `Update the shared engine on ${machine}?`,
    detail:
      "Incompatible upgrades need an explicit maintenance window. Finish current tasks and quit both apps, then follow the upgrade guide to stop serving workspaces and remove old product registrations before installing matching releases. Home and history files remain.",
    install: "Review updates",
    decline: "Not now",
  };
}

export function nodeFailureCard(
  machine: string,
  _code: number | null,
  detail: string,
  profile: ProductProfile = keyworkProfile,
): FailureCard {
  return {
    title: `${profile.name}: background work unavailable`,
    message: `The shared engine could not be prepared on ${machine}.`,
    detail:
      detail ||
      "Try enabling background work again. Existing clients and authorized work are preserved.",
  };
}

export async function answerGiven(
  seams: Pick<NodeConsentSeams, "userData" | "readText">,
): Promise<NodeAnswer | undefined> {
  for (const answer of ["installed", "declined"] as const) {
    const text = await seams.readText(answerPath(seams.userData, answer));
    if (text !== undefined && parsedRecord(text)?.answer === answer) return answer;
  }
  return undefined;
}

export function answerPath(userData: string, answer: NodeAnswer): string {
  return join(userData, nodeAnswerFiles[answer]);
}

const nodeStatusReport = z.object({
  runtimeCompatibility: z.number().int().optional(),
  registration: z
    .object({ installed: z.boolean(), program: z.string().nullable().optional() })
    .nullable(),
  liveness: z.string(),
  node: z
    .object({
      startedAt: z.string(),
      version: z.string().optional(),
      contract: z.string().optional(),
      workspaces: z.array(z.object({ url: z.string().nullable() })),
    })
    .nullable(),
});

function bootstrapRefusal(standing: NodeStanding | undefined): SidecarRun | undefined {
  if (standing?.runtimeCompatibility === 1) return undefined;
  return {
    code: 3,
    output: JSON.stringify({
      kind: "refused",
      code: "bootstrap-update-required",
      message:
        standing === undefined
          ? "The shared engine's compatibility could not be checked."
          : "This app needs an update before it can use the shared engine.",
      ...(standing !== undefined && { recovery: "update-bootstrap" }),
    }),
  };
}

function parsedStatus(output: string): z.infer<typeof nodeStatusReport> | undefined {
  try {
    const parsed = nodeStatusReport.safeParse(JSON.parse(output));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function sameUrl(left: string, right: string): boolean {
  return left.replace(/\/+$/, "") === right.replace(/\/+$/, "");
}

async function recordAnswer(seams: NodeConsentSeams, answer: NodeAnswer): Promise<void> {
  const record: NodeAnswerRecord = {
    schema: 1,
    answer,
    at: seams.now().toISOString(),
    machine: seams.machine,
  };
  await seams.writeText(answerPath(seams.userData, answer), `${JSON.stringify(record)}\n`);
}

function parsedRecord(text: string): NodeAnswerRecord | undefined {
  try {
    const parsed = nodeAnswerRecord.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
