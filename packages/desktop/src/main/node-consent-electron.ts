import { mkdir, stat, writeFile } from "node:fs/promises";
import { homedir, hostname, userInfo } from "node:os";
import { dirname } from "node:path";
import { keyworkProfile, type ProductProfile } from "@keywork-app/product";
import { app, type BrowserWindow, dialog, type MessageBoxOptions } from "electron";
import { spawnChild } from "./child.ts";
import {
  answerNodeRefusal,
  type ConsentCard,
  type FailureCard,
  type NodeConsentSeams,
  type NodeOffer,
  type NodeUpgrade,
  offerNodeAtFirstRun,
  restartAnOlderNode,
  type SidecarRun,
} from "./node-consent.ts";
import type { ContractMismatch, ServeFailure } from "./serve-process.ts";
import { bundledBinary, fileSeams } from "./system.ts";

export const nodeInstallPatienceMs = 60_000;

export function prepareSharedRuntime(
  profile: ProductProfile = keyworkProfile,
  parent: BrowserWindow | null = null,
): Promise<NodeOffer> {
  return offerNodeAtFirstRun(nodeSeams(parent, undefined, profile));
}

export function retrySharedRuntime(
  profile: ProductProfile = keyworkProfile,
  parent: BrowserWindow | null = null,
): Promise<NodeOffer> {
  return offerNodeAtFirstRun(nodeSeams(parent, undefined, profile), { reconsiderDecline: true });
}

export function offerTheNode(
  parent: BrowserWindow,
  folder: string | undefined,
  profile: ProductProfile = keyworkProfile,
): Promise<NodeOffer> {
  return offerNodeAtFirstRun(nodeSeams(parent, folder, profile));
}

export function restartTheNodeIfOlder(
  profile: ProductProfile = keyworkProfile,
): Promise<NodeUpgrade> {
  return restartAnOlderNode(nodeSeams(null, undefined, profile));
}

export function answerTheNodeRefusal(
  parent: BrowserWindow | null,
  failure: ContractMismatch,
  profile: ProductProfile = keyworkProfile,
): Promise<ServeFailure> {
  return answerNodeRefusal(nodeSeams(parent, undefined, profile), failure);
}

function nodeSeams(
  parent: BrowserWindow | null,
  folder: string | undefined,
  profile: ProductProfile,
): NodeConsentSeams {
  return {
    platform: process.platform,
    profile,
    machine: hostname(),
    account: userInfo().username,
    userData: app.getPath("userData"),
    sidecar: bundledBinary(process.resourcesPath),
    folder,
    exists,
    modifiedAt,
    readText: fileSeams.readText,
    writeText: async (path, text) => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, text, "utf8");
    },
    ask: async (card) => (await showBox(parent, consentBox(card))).response === 0,
    tell: async (card) => {
      await showBox(parent, failureBox(card));
    },
    run: runSidecar,
    now: () => new Date(),
  };
}

function consentBox(card: ConsentCard): MessageBoxOptions {
  return {
    type: "question",
    title: card.title,
    message: card.message,
    detail: card.detail,
    buttons: [card.install, card.decline],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  };
}

function failureBox(card: FailureCard): MessageBoxOptions {
  return { type: "warning", title: card.title, message: card.message, detail: card.detail };
}

function showBox(parent: BrowserWindow | null, options: MessageBoxOptions) {
  return parent === null || parent.isDestroyed()
    ? dialog.showMessageBox(options)
    : dialog.showMessageBox(parent, options);
}

async function runSidecar(
  binary: string,
  args: readonly string[],
  cwd: string = homedir(),
): Promise<SidecarRun> {
  const child = spawnChild(binary, args, cwd);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const gaveUp = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      child.signal("SIGKILL");
      resolve(null);
    }, nodeInstallPatienceMs);
  });
  const [code, stdout, stderr] = await Promise.all([
    Promise.race([child.exited, gaveUp]),
    collect(child.stdout),
    collect(child.stderr),
  ]);
  clearTimeout(timer);
  return { code, output: code === 0 || stderr.trim() === "" ? stdout : stderr };
}

async function collect(chunks: AsyncIterable<string>): Promise<string> {
  let text = "";
  for await (const chunk of chunks) text += chunk;
  return text;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function modifiedAt(path: string): Promise<number | undefined> {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return undefined;
  }
}
