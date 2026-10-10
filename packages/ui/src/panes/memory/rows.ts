import type {
  AirlockCandidate,
  AirlockDigest,
  AirlockQuestion,
  InboxItem,
  LedgerEntry,
  MemoryGarden,
  MemoryLayer,
  MemoryNote,
  MemoryQueryHit,
  Provenance,
  StagedWrite,
} from "@keywork-app/protocol";

export type MemoryRow =
  | { id: string; kind: "layer"; layer: MemoryLayer }
  | { id: string; kind: "note"; note: MemoryNote }
  | { id: string; kind: "date"; date: string }
  | { id: string; kind: "inbox"; item: InboxItem; view: InboxView }
  | { id: string; kind: "candidate"; arc: string; candidate: AirlockCandidate }
  | { id: string; kind: "question"; arc: string; question: AirlockQuestion }
  | { id: string; kind: "finish"; arc: string; digest: AirlockDigest }
  | { id: string; kind: "hit"; hit: MemoryQueryHit };

export type MemoryRowKind = MemoryRow["kind"];

export interface MemorySection {
  readonly id: string;
  readonly heading: string;
  readonly rows: readonly MemoryRow[];
}

export type InboxGroup = "staged" | "promotion" | "contradiction" | "proposal" | "airlock";

export interface InboxView {
  readonly group: InboxGroup;
  readonly title: string;
  readonly provenance: Provenance;
  readonly detail?: string;
  readonly note?: string;
}

export const inboxGroups: readonly InboxGroup[] = [
  "staged",
  "promotion",
  "contradiction",
  "proposal",
  "airlock",
];

export interface GardenInputs {
  readonly garden: MemoryGarden;
  readonly notes: readonly MemoryNote[];
  readonly dates: readonly string[];
  readonly hits?: readonly MemoryQueryHit[] | undefined;
}

export function gardenSections(inputs: GardenInputs): MemorySection[] {
  return [
    ...hitSections(inputs.hits),
    ...layerSections(inputs.garden.layers, inputs.notes),
    ...dailySection(inputs.dates),
    ...inboxSections(inputs.garden.inbox),
    ...airlockSections(inputs.garden.airlocks),
  ];
}

export function flatRows(sections: readonly MemorySection[]): MemoryRow[] {
  return sections.flatMap((section) => section.rows);
}

export function inboxView(item: InboxItem): InboxView {
  const view = stagedView(item);
  return item.bot === undefined ? view : { ...view, title: `${item.bot} · ${view.title}` };
}

export function ledgerSummary(entry: LedgerEntry): string {
  const paths = entry.deltas.map((delta) => delta.path);
  const names = paths.filter(isNotePath).map(noteNameOf);
  const subject = names.length > 0 ? names.join(", ") : (paths[0] ?? "staging");
  return `${entry.op} ${subject}`;
}

export function entriesTouching(ledger: readonly LedgerEntry[], notePath: string): LedgerEntry[] {
  return ledger.filter((entry) => entry.deltas.some((delta) => delta.path === notePath));
}

export function newestFirst(ledger: readonly LedgerEntry[]): LedgerEntry[] {
  return [...ledger].reverse();
}

export function noteNameOf(path: string): string {
  return path.replace(/^entities\//, "").replace(/\.md$/, "");
}

function hitSections(hits: readonly MemoryQueryHit[] | undefined): MemorySection[] {
  if (hits === undefined) return [];
  return [
    {
      id: "ask",
      heading: hits.length === 0 ? "ask · nothing matches" : `ask · ${hits.length} hits`,
      rows: hits.map((hit) => ({ id: `hit:${hit.layer}:${hit.note}`, kind: "hit", hit })),
    },
  ];
}

function layerSections(
  layers: readonly MemoryLayer[],
  notes: readonly MemoryNote[],
): MemorySection[] {
  return layers.map((layer) => ({
    id: `layer:${layer.id}`,
    heading: layer.label,
    rows: [
      { id: `layer:${layer.id}`, kind: "layer", layer },
      ...notes
        .filter((note) => note.layer === layer.id)
        .map((note): MemoryRow => ({ id: `note:${layer.id}:${note.name}`, kind: "note", note })),
    ],
  }));
}

function dailySection(dates: readonly string[]): MemorySection[] {
  if (dates.length === 0) return [];
  return [
    {
      id: "daily",
      heading: "daily",
      rows: dates.map((date) => ({ id: `date:${date}`, kind: "date", date })),
    },
  ];
}

function inboxSections(inbox: readonly InboxItem[]): MemorySection[] {
  const rows = inbox.map(
    (item): Extract<MemoryRow, { kind: "inbox" }> => ({
      id: `inbox:${item.id}`,
      kind: "inbox",
      item,
      view: inboxView(item),
    }),
  );
  return inboxGroups.flatMap((group) => {
    const grouped = rows.filter((row) => row.view.group === group);
    if (grouped.length === 0) return [];
    return [{ id: `inbox:${group}`, heading: `inbox · ${group}`, rows: grouped }];
  });
}

function airlockSections(airlocks: readonly AirlockDigest[]): MemorySection[] {
  return airlocks.map((digest) => ({
    id: `airlock:${digest.arc}`,
    heading: `airlock · ${digest.arc}`,
    rows: [
      ...digest.candidates.map(
        (candidate): MemoryRow => ({
          id: `candidate:${digest.arc}:${candidate.note}`,
          kind: "candidate",
          arc: digest.arc,
          candidate,
        }),
      ),
      ...digest.questions.map(
        (question): MemoryRow => ({
          id: `question:${digest.arc}:${question.title}`,
          kind: "question",
          arc: digest.arc,
          question,
        }),
      ),
      { id: `finish:${digest.arc}`, kind: "finish", arc: digest.arc, digest },
    ],
  }));
}

function stagedView(item: InboxItem): InboxView {
  switch (item.kind) {
    case "note":
    case "daily":
    case "moc":
      return stagedWriteView(item);
    case "borderline-promotion":
      return {
        group: "promotion",
        title: item.title,
        provenance: "agent",
        detail: `from ${item.source}`,
        note: item.title,
      };
    case "contradiction":
      return {
        group: "contradiction",
        title: `${item.a} vs ${item.b}`,
        provenance: worseProvenance(item.aProvenance, item.bProvenance),
      };
    case "merge-proposal":
      return {
        group: "proposal",
        title: `merge ${item.retire} into ${item.keep}`,
        provenance: "agent",
        note: item.keep,
      };
    case "supersession-proposal":
      return {
        group: "proposal",
        title: `${item.winner} supersedes ${item.loser}`,
        provenance: "agent",
        note: item.winner,
      };
    case "link-proposal":
      return {
        group: "proposal",
        title: `link ${item.note} → ${item.target}`,
        provenance: "agent",
        note: item.note,
      };
    case "arc-distillation":
      return {
        group: "airlock",
        title: `deliver ${item.note}`,
        provenance: "agent",
        detail: item.eligible ? "eligible" : "below bar",
        note: item.note,
      };
    case "arc-question":
      return {
        group: "airlock",
        title: `triage ${item.note}`,
        provenance: "agent",
        note: item.note,
      };
    case "preference-proposal":
      return {
        group: "proposal",
        title: `allow ${item.toolShape} without asking`,
        provenance: "user",
        detail: `approved ${item.approvals} times in a row`,
      };
    case "skill-proposal":
      return {
        group: "proposal",
        title: `new skill ${item.name}`,
        provenance: "agent",
        detail: `${item.commands.split("\n").length} steps, seen ${item.occurrences} times`,
      };
    case "skill-review":
      return {
        group: "proposal",
        title: `${item.reason === "churning" ? "rework" : "retire"} skill ${item.skill}`,
        provenance: "agent",
        detail: `${item.uses} uses, ${item.patches} patches, ${item.rewrites} rewrites`,
      };
  }
}

function stagedWriteView(item: StagedWrite): InboxView {
  return {
    group: "staged",
    title: item.target,
    provenance: "untrusted",
    detail: item.kind,
    ...(item.kind === "note" && { note: noteNameOf(item.target) }),
  };
}

function worseProvenance(a: Provenance, b: Provenance): Provenance {
  const order: readonly Provenance[] = ["user", "agent", "untrusted"];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

function isNotePath(path: string): boolean {
  return path.endsWith(".md") && !path.startsWith("daily/") && !path.startsWith(".staging/");
}
