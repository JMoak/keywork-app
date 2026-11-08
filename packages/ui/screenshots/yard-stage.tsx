import type { YardCard, YardDecision, YardSetting } from "@keywork-app/habitat";
import type { JSX } from "solid-js";
import type { ShellSeams } from "../src/panes/registry.ts";
import { Yard } from "../src/yard/index.ts";

export type YardScene = "yard-cards" | "yard-unfold" | "yard-rail" | "yard-stage";

export const yardScenes: readonly YardScene[] = [
  "yard-cards",
  "yard-unfold",
  "yard-rail",
  "yard-stage",
];

export function isYardScene(scene: string): scene is YardScene {
  return (yardScenes as readonly string[]).includes(scene);
}

export function YardStage(props: { scene: YardScene; hub: JSX.Element }) {
  return (
    <Yard
      on={true}
      settings={settingsOf(props.scene)}
      card={cardOf(props.scene)}
      offsetMinutes={0}
      railActive={props.scene === "yard-rail"}
      reducedMotion={true}
      shell={{} as ShellSeams}
      ownerOf={ownerOf}
      onEnter={() => undefined}
      onAnswer={() => undefined}
      onReturn={() => undefined}
    >
      <div class="kw-stage">
        <div class="kw-slot" style={{ left: "0px", top: "0px", width: "100%", height: "100%" }}>
          {props.hub}
        </div>
      </div>
    </Yard>
  );
}

function ownerOf(setting: YardSetting): string {
  if (setting.creature === null) return "fix the parser";
  return `${setting.creature.slice(0, 1).toUpperCase()}${setting.creature.slice(1)}`;
}

function settingsOf(scene: YardScene): readonly YardSetting[] {
  const cards = [
    staged("branches", "card", 6, "note", "the nightly chore found two stale branches"),
    staged("spec", "card", 5, "url", "https://example.com/parser-spec", null),
    staged("budget", "card", 4, "note", "this week's spend is under the cap", "tam"),
    staged("deploy", "card", 3, "note", "the preview deploy is green"),
    staged("lint", "card", 2, "note", "two new lint warnings in scripts", "ada"),
    staged("docs", "card", 1, "note", "the events doc gained the show events", "tam"),
    staged("rename", "card", 0.5, "note", "a rename is waiting on your word"),
  ];
  switch (scene) {
    case "yard-cards":
      return [...cards, staged("tidy", "card", 0.25, "note", "the notes folder could use a tidy")];
    case "yard-rail":
      return cards;
    case "yard-unfold":
      return [staged("summary", "unfold", 9, "note", summary), ...cards.slice(0, 3)];
    case "yard-stage":
      return [staged("summary", "stage", 9, "note", summary), ...cards.slice(0, 2)];
  }
}

function cardOf(scene: YardScene): YardCard {
  const unfolded = scene === "yard-unfold" || scene === "yard-stage";
  return {
    id: "yard:card",
    used: unfolded ? 1 : 0,
    limit: 6,
    windowMs: 600_000,
    nextFreeAt: Date.UTC(2026, 10, 8, 9, 0),
    cooldowns: [],
    decisions: unfolded ? [decided("summary", "unfold", "you asked, it shows")] : [],
  };
}

function decided(id: string, rung: YardDecision["rung"], reason: string): YardDecision {
  return {
    at: Date.UTC(2026, 10, 8, 9, 0),
    id,
    creature: "wren",
    kind: "note",
    proposed: rung === "card" ? "unfold" : rung,
    rung,
    verdict: "play",
    reason,
  };
}

const summary = [
  "The parser fix is in.",
  "",
  "Three call sites read the old token shape; all three now go through readToken.",
  "The fixture for nested quotes was wrong and is corrected; nothing else changed.",
  "",
  "Next: the formatter still assumes the old shape in one branch.",
].join("\n");

function staged(
  id: string,
  shown: YardSetting["shown"],
  depth: number,
  kind: "note" | "url",
  ref: string,
  creature: string | null = "wren",
): YardSetting {
  return {
    id,
    creature,
    sessionId: "s1",
    what: { kind, ref, ...(kind === "note" && ref.length > 48 && { title: "the parser fix" }) },
    rung: shown === "lantern" ? "lantern" : shown === "glyph" ? "card" : shown,
    why: "set out because you asked about it this morning",
    at: "2026-11-08T09:00:00.000Z",
    until: "seen",
    state: "live",
    shown,
    depth,
  };
}
