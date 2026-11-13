import type {
  AssistantEntry,
  EndingEntry,
  SessionProjection,
  TranscriptEntry,
} from "@keywork-app/client";
import { createMemo } from "solid-js";
import { endingLine } from "../../page/pane.tsx";
import "./conversation.css";

export function Announcements(props: { projection: SessionProjection }) {
  const reply = createMemo(() => replyAnnouncement(props.projection));
  const ask = createMemo(() => askAnnouncement(props.projection));
  return (
    <>
      <p class="kw-announce" role="status" aria-live="polite">
        {reply()}
      </p>
      <p class="kw-announce" role="alert" aria-live="assertive">
        {ask()}
      </p>
    </>
  );
}

export function replyAnnouncement(projection: SessionProjection): string {
  const latest = projection.entries.findLast(isAnnounced);
  if (latest === undefined || latest.replay) return "";
  return latest.kind === "ending"
    ? endingLine(latest)
    : `reply · ${clippedAnnouncement(latest.text)}`;
}

export function askAnnouncement(projection: SessionProjection): string {
  const asking = projection.entries.findLast(
    (entry) => entry.kind === "tool" && entry.run.phase === "asking" && !entry.run.replay,
  );
  if (asking?.kind !== "tool") return "";
  const { name, subject } = asking.run;
  return `${subject === "" ? name : `${name} ${subject}`} needs your answer`;
}

function isAnnounced(entry: TranscriptEntry): entry is AssistantEntry | EndingEntry {
  return (entry.kind === "assistant" && entry.settled) || entry.kind === "ending";
}

function clippedAnnouncement(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > announcementLimit ? `${flat.slice(0, announcementLimit - 1)}…` : flat;
}

const announcementLimit = 240;
