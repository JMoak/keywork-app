import type { FrameAges } from "@keywork-app/screen";

export const harnessCandidateChannel = "harness:candidate";

export const harnessNoteChannel = "harness:note";

export const clockCells = 35;

export const harnessStatsChannel = "harness:rtc-stats";

export const harnessCodecChannel = "harness:pinned-codec";

export interface ProbeConfig {
  readonly display: { x: number; y: number; width: number; height: number };
  readonly clock: { x: number; y: number; width: number; height: number; cells: number };
  readonly collectMs: number;
  readonly samples: number;
  readonly warmupFrames: number;
}

export interface ProbeResult {
  readonly ok: boolean;
  readonly problem?: string;
  readonly sessionId?: string;
  readonly events?: unknown[];
  readonly stats?: unknown;
  readonly samples?: number[];
  readonly frames?: FrameAges[];
  readonly window?: { from: number; to: number };
  readonly warmedUpAfter?: number;
  readonly decodeFailures?: number;
  readonly framesSeen?: number;
  readonly candidates?: string[];
  readonly videoWidth?: number;
  readonly videoHeight?: number;
}

export function clockPage(): string {
  const script = `
const cells = ${clockCells};
const canvas = document.getElementById("clock");
const context = canvas.getContext("2d");
function draw() {
  const now = Date.now() % 4294967296;
  const bits = [1, 0];
  let parity = 0;
  for (let index = 31; index >= 0; index -= 1) {
    const bit = Math.floor(now / 2 ** index) % 2;
    bits.push(bit);
    parity ^= bit;
  }
  bits.push(parity);
  const cell = canvas.width / cells;
  bits.forEach((bit, index) => {
    context.fillStyle = bit === 1 ? "white" : "black";
    context.fillRect(Math.floor(index * cell), 0, Math.ceil(cell), canvas.height);
  });
  requestAnimationFrame(draw);
}
draw();`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden;background:black}canvas{display:block;width:100vw;height:100vh}</style></head><body><canvas id="clock" width="${clockCells * 24}" height="24"></canvas><script>${script}</script></body></html>`;
}

export async function viewerProbe(config: ProbeConfig): Promise<ProbeResult> {
  type Port = {
    view(request: { peer: string }): Promise<{ ok: boolean; sessionId?: string; problem?: string }>;
    attach(sessionId: string, video: HTMLVideoElement): void;
    onEvent(sessionId: string, listener: (event: Record<string, unknown>) => void): () => void;
    stop(sessionId: string): Promise<void>;
  };
  const scope = window as unknown as {
    keyworkHost: { screen: Port };
    keyworkHarness: { candidates(): string[] };
  };
  const port = scope.keyworkHost.screen;
  const video = document.createElement("video");
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.style.width = "100%";
  document.body.append(video);
  const started = await port.view({ peer: "loopback-sharer" });
  if (!started.ok || started.sessionId === undefined)
    return { ok: false, problem: started.problem ?? "no session" };
  const sessionId = started.sessionId;
  const events: unknown[] = [];
  let lastStats: unknown;
  let ended = false;
  port.attach(sessionId, video);
  port.onEvent(sessionId, (event) => {
    if (event.kind === "stats") lastStats = event;
    else events.push(event);
    if (event.kind === "ended") ended = true;
  });
  const samples: number[] = [];
  const frames: FrameAges[] = [];
  let decodeFailures = 0;
  let framesSeen = 0;
  let warmup = config.warmupFrames;
  let measuredFrom = Date.now();
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  await new Promise<void>((resolve) => {
    const deadline = setTimeout(resolve, config.collectMs);
    const onFrame = (_now: number, metadata: FrameMetadata) => {
      framesSeen += 1;
      const scaleX = video.videoWidth / config.display.width;
      const scaleY = video.videoHeight / config.display.height;
      const width = Math.max(1, Math.round(config.clock.width * scaleX));
      const height = Math.max(1, Math.round(config.clock.height * scaleY));
      canvas.width = width;
      canvas.height = height;
      context?.drawImage(
        video,
        (config.clock.x - config.display.x) * scaleX,
        (config.clock.y - config.display.y) * scaleY,
        config.clock.width * scaleX,
        config.clock.height * scaleY,
        0,
        0,
        width,
        height,
      );
      const pixels = context?.getImageData(0, 0, width, height).data;
      const bitAt = (cell: number): number => {
        const x = Math.floor(((cell + 0.5) * width) / config.clock.cells);
        const offset = (Math.floor(height / 2) * width + x) * 4;
        const light =
          ((pixels?.[offset] ?? 0) + (pixels?.[offset + 1] ?? 0) + (pixels?.[offset + 2] ?? 0)) / 3;
        return light > 128 ? 1 : 0;
      };
      const bits = Array.from({ length: config.clock.cells }, (_unused, cell) => bitAt(cell));
      const data = bits.slice(2, 34);
      const parity = data.reduce((sum, bit) => sum ^ bit, 0);
      if (bits[0] === 1 && bits[1] === 0 && parity === bits[34]) {
        const shown = data.reduce((value, bit) => value * 2 + bit, 0);
        const ageAt = (time: number): number =>
          (((performance.timeOrigin + time) % 4294967296) - shown + 4294967296) % 4294967296;
        const latency = ageAt(metadata.expectedDisplayTime);
        if (latency >= 5000) decodeFailures += 1;
        else if (warmup > 0) {
          warmup -= 1;
          measuredFrom = Date.now();
        } else {
          samples.push(latency);
          frames.push({
            ...(metadata.captureTime !== undefined && { captured: ageAt(metadata.captureTime) }),
            ...(metadata.receiveTime !== undefined && { received: ageAt(metadata.receiveTime) }),
            presented: ageAt(metadata.presentationTime),
            displayed: latency,
          });
        }
      } else decodeFailures += 1;
      if (samples.length >= config.samples) {
        clearTimeout(deadline);
        resolve();
        return;
      }
      video.requestVideoFrameCallback(onFrame);
    };
    video.requestVideoFrameCallback(onFrame);
  });
  const measuredTo = Date.now();
  const stats = lastStats;
  await port.stop(sessionId);
  for (let waited = 0; !ended && waited < 30; waited += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return {
    ok: true,
    sessionId,
    events,
    stats,
    samples,
    frames,
    window: { from: measuredFrom, to: measuredTo },
    warmedUpAfter: config.warmupFrames - warmup,
    decodeFailures,
    framesSeen,
    candidates: scope.keyworkHarness.candidates(),
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
  };
}

interface FrameMetadata {
  readonly expectedDisplayTime: number;
  readonly presentationTime: number;
  readonly captureTime?: number;
  readonly receiveTime?: number;
}
