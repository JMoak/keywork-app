import {
  type CreatureLedgerEntry,
  isServedRefusal,
  type ServedRefusal,
} from "@keywork-app/protocol";
import { createEffect, createMemo, createResource, createSignal, untrack } from "solid-js";
import type { ConversationSpec } from "../conversation/index.tsx";
import type { ShellSeams } from "../registry.ts";
import { answeredAlreadyLine, conversationRefusedLine } from "./copy.ts";
import {
  answeredWithoutConversation,
  type LedgerSummary,
  ledgerOrder,
  summaryOf,
  unseen,
} from "./ledger.ts";
import { createLedgerBook, type LedgerReading, ledgerSourceOf } from "./ledger-book.ts";

export interface LedgerDesk {
  rows(): readonly CreatureLedgerEntry[];
  summary(): LedgerSummary;
  reading(): LedgerReading;
  cursor(): number;
  move(by: number): void;
  point(index: number): void;
  talk(index?: number): void;
}

export function createLedgerDesk(
  shell: ShellSeams,
  slug: () => string | undefined,
  say: (line: string) => void,
): LedgerDesk {
  const book = createLedgerBook(ledgerSourceOf(shell), slug);
  const [bound] = createResource(slug, (held) => boundProjects(shell, held), { initialValue: [] });
  const rows = createMemo(() => ledgerOrder(book.entries()));
  const summary = createMemo(() => summaryOf(book.entries(), bound(), shell.workspace));
  const cursor = createRowCursor(rows);
  const seeing = new Set<string>();
  const opening = new Set<string>();

  const see = (entry: CreatureLedgerEntry): void => {
    const held = slug();
    if (held === undefined || !unseen(entry) || seeing.has(entry.id)) return;
    seeing.add(entry.id);
    void shell.client
      .markLedgerEntrySeen(held, entry.id)
      .then((outcome) => {
        if (!isServedRefusal(outcome)) book.learned(outcome);
      })
      .catch(() => undefined)
      .finally(() => seeing.delete(entry.id));
  };
  const rise = (sessionId: string, creature: string): void => {
    const spec: ConversationSpec = { kind: "conversation", sessionId };
    if (shell.setOut !== undefined) shell.setOut(spec, { kind: "workshop", creature });
    else shell.sessions.openSession(sessionId);
  };
  const open = async (creature: string, entry: CreatureLedgerEntry): Promise<void> => {
    opening.add(entry.id);
    try {
      const outcome = await shell.client.openLedgerConversation(creature, entry.id);
      if (isServedRefusal(outcome)) return say(refusalLine(outcome));
      book.learned(outcome);
      const session = outcome.conversation?.session;
      if (session !== undefined) rise(session, creature);
    } catch (cause) {
      say(conversationRefusedLine(cause instanceof Error ? cause.message : String(cause)));
    } finally {
      opening.delete(entry.id);
    }
  };

  return {
    rows,
    summary,
    reading: book.reading,
    cursor: cursor.index,
    move: (by) => {
      const entry = cursor.move(by);
      if (entry !== undefined) see(entry);
    },
    point: (index) => {
      const entry = rows()[index];
      if (entry !== undefined) see(entry);
    },
    talk: (index = cursor.index()) => {
      const held = slug();
      const entry = cursor.place(index);
      if (held === undefined || entry === undefined) return;
      see(entry);
      const known = entry.conversation?.session;
      if (known !== undefined) rise(known, held);
      else if (answeredWithoutConversation(entry)) say(answeredAlreadyLine);
      else if (!opening.has(entry.id)) void open(held, entry);
    },
  };
}

interface RowCursor {
  index(): number;
  move(by: number): CreatureLedgerEntry | undefined;
  place(index: number): CreatureLedgerEntry | undefined;
}

function createRowCursor(rows: () => readonly CreatureLedgerEntry[]): RowCursor {
  const [heldId, setHeldId] = createSignal<string>();
  const [heldAt, setHeldAt] = createSignal(0);
  const clamp = (index: number): number => Math.min(Math.max(0, index), rows().length - 1);
  const index = (): number => {
    const at = rows().findIndex((entry) => entry.id === heldId());
    return at >= 0 ? at : Math.max(0, clamp(heldAt()));
  };
  const place = (at: number): CreatureLedgerEntry | undefined => {
    const entry = rows()[clamp(at)];
    if (entry === undefined) return undefined;
    setHeldAt(clamp(at));
    setHeldId(entry.id);
    return entry;
  };

  createEffect(() => {
    const all = rows();
    const at = all.findIndex((entry) => entry.id === heldId());
    if (at >= 0) setHeldAt(at);
    else if (all.length > 0) setHeldId(all[untrack(() => clamp(heldAt()))]?.id);
  });

  return {
    index,
    move: (by) => (rows().length === 0 ? undefined : place(index() + by)),
    place,
  };
}

function refusalLine(refusal: ServedRefusal): string {
  return refusal.refused === "conflict"
    ? answeredAlreadyLine
    : conversationRefusedLine(refusal.detail);
}

async function boundProjects(shell: ShellSeams, slug: string): Promise<string[]> {
  try {
    const { projects } = await shell.client.listCreatureProjects(slug);
    return projects.map((binding) => binding.project);
  } catch {
    return [];
  }
}
