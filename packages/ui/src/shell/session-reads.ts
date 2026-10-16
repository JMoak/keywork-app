import type { SessionSummary } from "@keywork-app/protocol";
import { createSignal } from "solid-js";

export interface SessionReads {
  sight(summaries: readonly SessionSummary[]): void;
  read(summary: SessionSummary): void;
  unread(summary: SessionSummary): boolean;
}

export function createSessionReads(): SessionReads {
  const [readTo, setReadTo] = createSignal<ReadonlyMap<string, string>>(new Map());
  return {
    sight: (summaries) =>
      setReadTo((marks) => {
        const firstSeen = summaries.filter((summary) => !marks.has(summary.id));
        return firstSeen.length === 0 ? marks : marked(marks, firstSeen);
      }),
    read: (summary) =>
      setReadTo((marks) =>
        marks.get(summary.id) === summary.lastActivityAt ? marks : marked(marks, [summary]),
      ),
    unread: (summary) => {
      const mark = readTo().get(summary.id);
      return mark !== undefined && Date.parse(summary.lastActivityAt) > Date.parse(mark);
    },
  };
}

function marked(
  marks: ReadonlyMap<string, string>,
  summaries: readonly SessionSummary[],
): ReadonlyMap<string, string> {
  const next = new Map(marks);
  for (const summary of summaries) next.set(summary.id, summary.lastActivityAt);
  return next;
}
