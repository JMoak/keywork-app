import { browserRtc, type CodecEfficiency, type RtcEnvironment } from "@keywork-app/screen";
import { contextBridge, ipcRenderer } from "electron";
import {
  browserMedia,
  isScreenSenderWindow,
  type SenderMedia,
  screenPort,
  startScreenSender,
} from "../../../preload/screen.ts";
import {
  harnessCandidateChannel,
  harnessCodecChannel,
  harnessNoteChannel,
  harnessStatsChannel,
} from "./probe.ts";

const gathered: string[] = [];

const pinnedCodec = String(ipcRenderer.sendSync(harnessCodecChannel) ?? "");

const statsEveryMs = 500;

const rtc = recordingRtc(browserRtc(), (candidate) => {
  gathered.push(candidate);
  ipcRenderer.send(harnessCandidateChannel, candidate);
});

if (isScreenSenderWindow(process.argv)) {
  startScreenSender(ipcRenderer, notingMedia(), rtc);
} else {
  contextBridge.exposeInMainWorld("keyworkHost", { screen: screenPort(ipcRenderer, { rtc }) });
  contextBridge.exposeInMainWorld("keyworkHarness", { candidates: () => [...gathered] });
}

function recordingRtc(inner: RtcEnvironment, record: (candidate: string) => void): RtcEnvironment {
  return {
    ...inner,
    efficiency: async (mimeTypes, probe) => {
      const measured = pinnedTo(await inner.efficiency(mimeTypes, probe), pinnedCodec);
      ipcRenderer.send(harnessNoteChannel, `efficiency ${JSON.stringify(measured)}`);
      return measured;
    },
    connection: (configuration) => {
      const connection = inner.connection(configuration);
      connection.addEventListener("icecandidate", (event) => {
        if (event.candidate !== null && event.candidate.candidate !== "")
          record(event.candidate.candidate);
      });
      reportStats(connection);
      return connection;
    },
  };
}

function pinnedTo(measured: CodecEfficiency[], mimeType: string | undefined): CodecEfficiency[] {
  if (mimeType === undefined || mimeType === "") return measured;
  const pinned = mimeType.toLowerCase();
  return measured.map((entry) => ({
    ...entry,
    powerEfficient: entry.supported && entry.mimeType.toLowerCase() === pinned,
  }));
}

function reportStats(connection: RTCPeerConnection): void {
  const timer = setInterval(async () => {
    if (connection.connectionState === "closed") return clearInterval(timer);
    const reports = await connection.getStats().catch(() => undefined);
    for (const report of reports?.values() ?? []) {
      const snapshot = videoSnapshotOf(report as Record<string, unknown>);
      if (snapshot !== undefined) ipcRenderer.send(harnessStatsChannel, snapshot);
    }
  }, statsEveryMs);
}

const counterFields: Readonly<Record<string, readonly string[]>> = {
  "outbound-rtp": [
    "framesEncoded",
    "totalEncodeTime",
    "packetsSent",
    "totalPacketSendDelay",
    "frameWidth",
    "frameHeight",
    "encoderImplementation",
    "powerEfficientEncoder",
    "qualityLimitationReason",
  ],
  "inbound-rtp": [
    "framesDecoded",
    "totalDecodeTime",
    "jitterBufferDelay",
    "jitterBufferTargetDelay",
    "jitterBufferMinimumDelay",
    "jitterBufferEmittedCount",
    "totalProcessingDelay",
    "framesDropped",
    "frameWidth",
    "frameHeight",
    "decoderImplementation",
    "powerEfficientDecoder",
  ],
};

function videoSnapshotOf(report: Record<string, unknown>): Record<string, unknown> | undefined {
  const fields = counterFields[String(report.type)];
  if (fields === undefined || report.kind !== "video") return undefined;
  const side = report.type === "outbound-rtp" ? "sender" : "receiver";
  return {
    side,
    at: Date.now(),
    ...Object.fromEntries(fields.map((field) => [field, report[field]])),
  };
}

function notingMedia(): SenderMedia {
  const media = browserMedia();
  return {
    ...media,
    capture: async (frameRate) => {
      try {
        const stream = await media.capture(frameRate);
        const settings = stream.getVideoTracks()[0]?.getSettings();
        ipcRenderer.send(harnessNoteChannel, `captured ${settings?.width}x${settings?.height}`);
        return stream;
      } catch (error) {
        ipcRenderer.send(harnessNoteChannel, `capture failed: ${String(error)}`);
        throw error;
      }
    },
  };
}
