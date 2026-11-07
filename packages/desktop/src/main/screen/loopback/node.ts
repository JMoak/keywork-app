import { type ChildProcess, spawn } from "node:child_process";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { PeerIdentity, SignalMessage } from "@keywork-app/screen";
import type { LoopbackHouse } from "./seams.ts";

export interface SignalTraffic {
  readonly from: "viewer" | "sharer";
  readonly message: SignalMessage;
}

export interface LoopbackNode {
  readonly house: LoopbackHouse;
  readonly traffic: readonly SignalTraffic[];
  readonly ticketsIssued: number;
  readonly refusals: readonly string[];
  following(side: "sharer" | "viewer"): boolean;
  close(): Promise<void>;
}

export const nodeListenTimeoutMs = 30_000;

export async function startLoopbackNode(
  viewer: PeerIdentity,
  keyworkRoot: string,
): Promise<LoopbackNode> {
  const child = spawn(bunBinary(), [serveNodeScript, keyworkRoot, JSON.stringify(viewer)], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const heard = listenTo(child);
  const house = await heard.listening;
  return {
    house,
    traffic: heard.traffic,
    get ticketsIssued() {
      return heard.tickets.filter((status) => status === 201).length;
    },
    refusals: heard.refusals,
    following: (side) => heard.followers.has(side),
    close: () => stop(child),
  };
}

const serveNodeScript = join(import.meta.dirname, "serve-node.ts");

interface Heard {
  readonly listening: Promise<LoopbackHouse>;
  readonly traffic: SignalTraffic[];
  readonly tickets: number[];
  readonly refusals: string[];
  readonly followers: Set<string>;
}

type NodeLine = { event: string } & Record<string, unknown>;

function listenTo(child: ChildProcess): Heard {
  const heard: Omit<Heard, "listening"> = {
    traffic: [],
    tickets: [],
    refusals: [],
    followers: new Set(),
  };
  const errors: string[] = [];
  child.stderr?.on("data", (chunk: Buffer) => errors.push(chunk.toString()));
  const listening = new Promise<LoopbackHouse>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`the loopback node never listened; it said: ${errors.join("")}`)),
      nodeListenTimeoutMs,
    );
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`the loopback node exited with ${code}: ${errors.join("")}`));
    });
    createInterface({ input: child.stdout as NodeJS.ReadableStream }).on("line", (text) => {
      if (!text.startsWith("{")) return;
      const line = JSON.parse(text) as NodeLine;
      if (line.event === "listening") {
        clearTimeout(timer);
        resolve(line.house as LoopbackHouse);
      }
      record(heard, line);
    });
  });
  return { ...heard, listening };
}

function record(heard: Omit<Heard, "listening">, line: NodeLine): void {
  if (line.event === "signal")
    heard.traffic.push({
      from: line.from as SignalTraffic["from"],
      message: line.message as SignalMessage,
    });
  if (line.event === "ticket") heard.tickets.push(Number(line.status));
  if (line.event === "following") heard.followers.add(String(line.side));
  if (line.event === "refused")
    heard.refusals.push(`${line.side} ${line.path} ${line.status}: ${line.problem}`);
}

function bunBinary(): string {
  return process.versions.bun === undefined ? "bun" : process.execPath;
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.stdin?.end();
  child.kill();
  await exited;
}
