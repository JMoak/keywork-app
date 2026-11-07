import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import {
  type FrameAges,
  isTailnetAddress,
  isTailnetCandidate,
  parseLog,
  type RtcSnapshot,
  type SignalMessage,
  type StatsWindow,
  sdpCandidates,
  stageReport,
} from "@keywork-app/screen";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { keeperOnSpark } from "./fakes.ts";
import { type LoopbackNode, startLoopbackNode } from "./loopback/node.ts";
import { loopbackRunFile } from "./loopback/run-file.ts";
import { loopbackHouseEnv } from "./loopback/seams.ts";

const enabled = process.env.KEYWORK_SCREEN_LOOPBACK === "1";
const glassToGlassBudgetMs = 120;
const harnessDir = join(import.meta.dirname, "loopback");
const keyworkRoot = join(import.meta.dirname, "../../../../../../keywork");
const appRoot = join(import.meta.dirname, "../../../../..");

type Line = Record<string, unknown> & { event: string };

describe.skipIf(!enabled)(
  "two consoles on one machine through the node's screen route on loopback (KEYWORK_SCREEN_LOOPBACK=1; needs an interactive desktop)",
  () => {
    let workDir = "";
    let node: LoopbackNode;
    const children: ChildProcess[] = [];

    beforeAll(async () => {
      workDir = await mkdtemp(join(tmpdir(), "keywork-screen-loopback-"));
      await buildHarness(join(workDir, "out"));
      node = await startLoopbackNode(keeperOnSpark, keyworkRoot);
    }, 120_000);

    afterAll(async () => {
      for (const child of children) child.kill();
      await node?.close();
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    });

    let run: LoopbackRun;

    beforeAll(async () => {
      run = await runLoopback(workDir, node, children);
    }, 180_000);

    it("connects host to host over literal tailnet candidates, decodes frames, and serves a snapshot", () => {
      const { result, stats, viewerCandidates, sharerCandidates, signaled, snapshot, rows } = run;
      expect(result.ok).toBe(true);
      expect(result.events).toContainEqual(
        expect.objectContaining({ kind: "granted", path: "local" }),
      );
      expect(result.events).toContainEqual(
        expect.objectContaining({ kind: "connection", state: "connected" }),
      );
      expect(stats?.pair?.local.type).toBe("host");
      expect(stats?.pair?.remote.type).toBe("host");
      expect(isTailnetAddress(stats?.pair?.local.address ?? "")).toBe(true);
      expect(isTailnetAddress(stats?.pair?.remote.address ?? "")).toBe(true);
      expect(stats?.frames ?? 0).toBeGreaterThan(0);
      for (const gathered of [viewerCandidates, sharerCandidates]) {
        expect(gathered.some((candidate) => candidate.includes(".local"))).toBe(false);
        expect(gathered.some(isTailnetCandidate)).toBe(true);
      }
      expect(signaled.length).toBeGreaterThan(0);
      expect(signaled.every(isTailnetCandidate)).toBe(true);
      expect(snapshot.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
      expect(result.webgl2).toBe(true);
      expect(rows.map((row) => row.kind)).toEqual([
        "requested",
        "decided",
        "kill-switch",
        "started",
        "ended",
      ]);
      expect(rows.at(-1)).toMatchObject({ kind: "ended", reason: "viewer-left" });
      expect(node.ticketsIssued).toBeGreaterThan(0);
    });

    it("keeps glass-to-glass latency within the direct-path budget", () => {
      expect(run.latency.count).toBeGreaterThanOrEqual(30);
      expect(run.latency.p50).toBeLessThanOrEqual(glassToGlassBudgetMs);
    });
  },
);

interface LoopbackRun {
  readonly result: Line;
  readonly stats: { frames?: number; pair?: Pair; width?: number; height?: number } | undefined;
  readonly viewerCandidates: string[];
  readonly sharerCandidates: string[];
  readonly signaled: string[];
  readonly snapshot: Buffer;
  readonly rows: ReturnType<typeof parseLog>;
  readonly latency: { p50: number; p95: number; count: number };
}

async function runLoopback(
  workDir: string,
  node: LoopbackNode,
  children: ChildProcess[],
): Promise<LoopbackRun> {
  const sharer = launch("sharer", workDir, node, children);
  const ready = await sharer.next((line) => line.event === "ready", 30_000);
  await waitFor(() => (node.following("sharer") ? true : undefined), 30_000);
  const viewer = launch("viewer", workDir, node, children);
  const granted = await waitFor(
    () => node.traffic.find((entry) => entry.message.kind === "granted"),
    30_000,
  );
  const snapshot = await snapshotOf(String(ready.snapshots), granted.message);
  const result = await viewer.next((line) => line.event === "result", 90_000);
  await sharer.next((line) => line.event === "sharer-ended", 15_000);
  const samples = (result.samples as number[]) ?? [];
  const latency = percentiles(samples);
  const reported = result.stats as { stats?: LoopbackRun["stats"]; rates?: unknown } | undefined;
  const stats = reported?.stats;
  const viewerCandidates = (result.candidates as string[]) ?? [];
  const sharerCandidates = sharer.lines
    .filter((line) => line.event === "candidate")
    .map((line) => String(line.candidate));
  const signaled = node.traffic.flatMap(({ message }) => signaledCandidates(message));
  const rows = parseLog(await readFile(join(workDir, "sharer-sessions.jsonl"), "utf8"));
  const notes = [...sharer.lines, ...viewer.lines].filter((line) => line.event === "note");
  await record({
    measuredAt: new Date().toISOString(),
    electron: "45.2.3",
    capture: { width: stats?.width, height: stats?.height },
    display: ready.display,
    captured: capturedSizeOf(notes),
    encoded: { width: stats?.width, height: stats?.height },
    pinnedCodec: process.env.KEYWORK_SCREEN_PERF_CODEC,
    warmupFrames: result.warmedUpAfter,
    probes: samples.length,
    stages: stagesOf(result, [...sharer.lines, ...viewer.lines]),
    framesDecoded: stats?.frames,
    framesSeen: result.framesSeen,
    decodeFailures: result.decodeFailures,
    stats: reported,
    glassToGlassMs: latency,
    budgetMs: glassToGlassBudgetMs,
    snapshotBytes: snapshot.length,
    webgl2: result.webgl2,
    notes,
    traffic: node.traffic.map((entry) => `${entry.from} ${entry.message.kind}`),
    sessionLog: rows.map((row) => row.kind),
    ticketsIssued: node.ticketsIssued,
    refusals: node.refusals,
    viewerCandidates,
    sharerCandidates,
  });
  return { result, stats, viewerCandidates, sharerCandidates, signaled, snapshot, rows, latency };
}

interface Pair {
  local: { address: string; type: string };
  remote: { address: string; type: string };
}

interface Launched {
  readonly lines: Line[];
  next(match: (line: Line) => boolean, timeoutMs: number): Promise<Line>;
}

function launch(
  role: "sharer" | "viewer",
  workDir: string,
  node: LoopbackNode,
  children: ChildProcess[],
): Launched {
  const electron = createRequire(import.meta.url)("electron") as string;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    KEYWORK_LOOPBACK_ROLE: role,
    [loopbackHouseEnv]: JSON.stringify(node.house),
    KEYWORK_LOOPBACK_DIR: workDir,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, [join(workDir, "out", "main.mjs")], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  const lines: Line[] = [];
  const waiters = new Set<() => void>();
  createInterface({ input: child.stdout as NodeJS.ReadableStream }).on("line", (text) => {
    if (!text.startsWith("{")) return;
    lines.push(JSON.parse(text) as Line);
    for (const wake of waiters) wake();
  });
  const errors: string[] = [];
  child.stderr?.on("data", (chunk: Buffer) => errors.push(chunk.toString()));
  child.on(
    "exit",
    () =>
      void writeFile(join(workDir, `${role}-stderr.log`), errors.join(""), "utf8").catch(
        () => undefined,
      ),
  );
  return {
    lines,
    next: (match, timeoutMs) =>
      new Promise((resolve, reject) => {
        const check = (): void => {
          const found = lines.find(match);
          if (found === undefined) return;
          clearTimeout(timer);
          waiters.delete(check);
          resolve(found);
        };
        const timer = setTimeout(() => {
          waiters.delete(check);
          reject(
            new Error(
              `${role} never reported; it said: ${lines.map((line) => line.event).join(", ")}`,
            ),
          );
        }, timeoutMs);
        waiters.add(check);
        check();
      }),
  };
}

async function buildHarness(outDir: string): Promise<void> {
  const { build } = await import("vite");
  await build({
    configFile: false,
    logLevel: "warn",
    root: harnessDir,
    ssr: { noExternal: true },
    build: {
      outDir,
      emptyOutDir: false,
      minify: false,
      target: "node24",
      ssr: join(harnessDir, "main.ts"),
      rollupOptions: {
        external: ["electron"],
        output: { format: "es", entryFileNames: "main.mjs" },
      },
    },
  });
  await build({
    configFile: false,
    logLevel: "warn",
    root: harnessDir,
    build: {
      outDir,
      emptyOutDir: false,
      minify: false,
      target: "chrome140",
      copyPublicDir: false,
      rollupOptions: {
        input: join(harnessDir, "preload.ts"),
        external: ["electron"],
        output: { format: "cjs", entryFileNames: "preload.cjs" },
      },
    },
  });
}

async function snapshotOf(baseUrl: string, granted: SignalMessage): Promise<Buffer> {
  if (granted.kind !== "granted") return Buffer.alloc(0);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${baseUrl}/screen/${granted.sessionId}/snapshot`, {
      headers: { authorization: `Bearer ${granted.token}` },
    });
    if (response.status === 200) return Buffer.from(await response.arrayBuffer());
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return Buffer.alloc(0);
}

function signaledCandidates(message: SignalMessage): string[] {
  if (message.kind === "candidate") return [message.candidate];
  if (message.kind === "offer" || message.kind === "answer") return sdpCandidates(message.sdp);
  return [];
}

function stagesOf(result: Line, lines: readonly Line[]) {
  const window = result.window as StatsWindow | undefined;
  if (window === undefined) return undefined;
  const snapshots = (side: string): RtcSnapshot[] =>
    lines.flatMap((line) =>
      line.event === "rtc-stats" && line.side === side ? rtcSnapshotOf(line) : [],
    );
  return stageReport(
    (result.frames as FrameAges[] | undefined) ?? [],
    snapshots("sender"),
    snapshots("receiver"),
    window,
  );
}

function rtcSnapshotOf(line: Line): RtcSnapshot[] {
  if (typeof line.at !== "number") return [];
  const counters = Object.entries(line).filter(
    (entry): entry is [string, number | string | boolean] =>
      ["number", "string", "boolean"].includes(typeof entry[1]),
  );
  return [{ ...Object.fromEntries(counters), at: line.at }];
}

function capturedSizeOf(notes: readonly Line[]): { width: number; height: number } | undefined {
  for (const { note } of notes) {
    const size = /^captured (\d+)x(\d+)$/.exec(String(note));
    if (size !== null) return { width: Number(size[1]), height: Number(size[2]) };
  }
  return undefined;
}

function percentiles(samples: readonly number[]): { p50: number; p95: number; count: number } {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (fraction: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ?? Number.NaN;
  return { p50: at(0.5), p95: at(0.95), count: sorted.length };
}

async function waitFor<Value>(probe: () => Value | undefined, timeoutMs: number): Promise<Value> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = probe();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error("timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function record(measurement: Record<string, unknown>): Promise<void> {
  const runFile = loopbackRunFile(appRoot);
  await mkdir(dirname(runFile), { recursive: true });
  await writeFile(runFile, `${JSON.stringify(measurement, null, 2)}\n`, "utf8");
}
