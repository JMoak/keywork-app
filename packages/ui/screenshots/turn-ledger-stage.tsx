import {
  type ChangesState,
  emptyProjection,
  latestLedger,
  pathReading,
  projectAll,
  transcriptLedger,
} from "@keywork-app/client";
import type { BusEnvelope, SessionEntries, SessionEntry } from "@keywork-app/protocol";
import type { JSX } from "solid-js";
import { PaneFrame } from "../src/chrome/pane-frame.tsx";
import { Composer } from "../src/composer/composer.tsx";
import { scenarios } from "../src/dev/scenarios.ts";
import { assumedContextLevel } from "../src/instruments/context.ts";
import { ribbonText } from "../src/page/ledger.tsx";
import { ConversationPane } from "../src/page/pane.tsx";

export function turnLedgerPane(): JSX.Element {
  const ledger = transcriptLedger(stagedTranscript, pathReading(stagedLog), stagedChanges);
  const ribbon = ribbonText(latestLedger(stagedTranscript, pathReading(stagedLog), stagedChanges));
  return (
    <PaneFrame
      name="dress the page in its ledger"
      state="idle"
      focused
      spawnRank={0}
      arc="page-grammar"
      bot={{ sigil: "◆", name: "editor" }}
      inference="opus · high"
      telemetry="2.4k tokens · $0.05"
      context={assumedContextLevel(24_000)}
      ribbon={ribbon}
    >
      <ConversationPane
        projection={stagedTranscript}
        ledger={ledger}
        ledgerVerbs={{ restore: () => {}, fork: () => {}, choose: () => {} }}
        redoable
      />
      <Composer queue={[]} onSteer={() => {}} onQueue={() => {}} onInterrupt={() => {}} />
    </PaneFrame>
  );
}

const stagedTranscript = projectAll(emptyProjection, [
  ...envelopesOf("tool"),
  ...envelopesOf("plain").map((envelope) => ({ ...envelope, id: envelope.id + 100 })),
]);

function envelopesOf(name: string): readonly BusEnvelope[] {
  return scenarios.find((scenario) => scenario.name === name)?.envelopes ?? [];
}

const stagedLog: SessionEntries = log([
  prompt("p1", "run echo served"),
  reply("r1", 0.0123),
  prompt("p2", "say hello"),
  reply("r2", 0.0381),
  { type: "custom", customType: "restore", data: { turn: 3 }, ...placed("x3") },
]);

const stagedChanges: ChangesState = {
  availability: "ready",
  baseline: "session start",
  stale: false,
  files: [
    { path: "packages/ui/src/page/ledger.tsx", added: 148, deleted: 0, turn: 1 },
    { path: "packages/ui/src/page/pane.tsx", added: 41, deleted: 12, turn: 2 },
    { path: "packages/ui/src/page/page.css", added: 38, deleted: 0, turn: 2 },
  ],
};

function log(entries: readonly SessionEntry[]): SessionEntries {
  return {
    sessionId: "s1",
    leafId: entries.at(-1)?.id ?? null,
    entries,
    labels: {},
    activePath: entries.map((entry) => entry.id),
  };
}

function prompt(id: string, text: string): SessionEntry {
  return {
    type: "message",
    message: { role: "user", parts: [{ type: "text", text }] },
    ...placed(id),
  };
}

function reply(id: string, costUsd: number): SessionEntry {
  return {
    type: "message",
    message: { role: "assistant", parts: [{ type: "text", text: "done" }] },
    usage: { inputTokens: 900, outputTokens: 300, costUsd },
    ...placed(id),
  };
}

function placed(id: string) {
  return { id, parentId: null, timestamp: "2026-10-15T12:00:00.000Z" };
}
