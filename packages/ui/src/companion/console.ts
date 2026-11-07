import type { ServerFeed } from "@keywork-app/client";
import type { RoutineNeed } from "@keywork-app/protocol";
import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { askOffers } from "../page/ask-card.tsx";
import {
  createHabitatState,
  type HabitatSeams,
  houseOffsetMinutes,
} from "../panes/stead/habitat.ts";
import { answerHeldAsk, askingRun } from "../shell/answer-ask.ts";
import { type DecidedForYou, type NeedsYouItem, pendingAsksAmong } from "../shell/needs-you.ts";
import { needsYouCount } from "../shell/needs-you-ledger.ts";
import type { SessionStore } from "../shell/session-store.ts";
import { announcer } from "./announce.ts";
import {
  type AnswersFor,
  creatureSnapshot,
  defaultAnswers,
  residents,
  threadOfAsk,
} from "./feed.ts";
import { type CompanionController, createCompanionController } from "./floating.ts";
import type { ChoreAccept, CompanionHost, CompanionSnapshot } from "./port.ts";
import { companionSwitch } from "./switch.tsx";

export interface CompanionConsoleSeams {
  readonly controller?: CompanionController;
  readonly onboarding?: () => boolean;
  readonly host: CompanionHost;
  readonly store: SessionStore;
  readonly feed: Pick<ServerFeed, "subscribe">;
  currentSession(): string | undefined;
  approveKey(): string;
  openSession(sessionId: string): void;
  say(text: string): void;
  chores?: (() => readonly RoutineNeed[]) | undefined;
  decided?: (() => readonly DecidedForYou[]) | undefined;
  needsYou?: (() => readonly NeedsYouItem[]) | undefined;
  creatures?: HabitatSeams["creatures"];
  openChores?: (() => void) | undefined;
  acceptChore?: ((chore: ChoreAccept) => Promise<string | undefined>) | undefined;
  overturn?: ((recordId: string) => Promise<string | undefined>) | undefined;
  now?: () => number;
}

export function followCompanion(seams: CompanionConsoleSeams): void {
  const controller = seams.controller ?? createCompanionController();
  const now = seams.now ?? Date.now;
  const needsYou = seams.needsYou;
  const world = createHabitatState({
    rows: () => seams.store.state.summaries,
    bots: () => seams.store.surfaces.state.bots,
    currentSession: seams.currentSession,
    asks: needsYou === undefined ? undefined : () => pendingAsksAmong(needsYou()),
    chores: seams.chores,
    decided: seams.decided,
    creatures: seams.creatures,
    feed: seams.feed,
    now,
    offsetMinutes: houseOffsetMinutes(),
  });
  const [enabled, setEnabled] = createSignal(false);
  const seated = createMemo(() => residents(world()));
  const resident = createMemo(() => {
    const wanted = controller.wanted();
    return seated().find((candidate) => candidate.slug === wanted) ?? seated()[0];
  });
  const answersFor: AnswersFor = (threadId, callId) => {
    const run = askingRun(seams.store.projection(threadId), callId);
    return run === undefined ? defaultAnswers : askOffers(run).map((offer) => offer.pick);
  };
  const announce = announcer();
  let published: string | undefined;
  let latest: CompanionSnapshot | undefined;
  const toggle = companionSwitch(seams.host, seams.say, seams.onboarding);
  onCleanup(controller.bindToggle(toggle));

  createEffect(() => setEnabled(toggle.enabled() === true));
  createEffect(() => controller.noteResidents(seated()));
  createEffect(() => controller.noteFloating(enabled() ? resident()?.slug : undefined));
  onCleanup(() => {
    controller.noteFloating(undefined);
    controller.noteResidents([]);
  });

  createEffect(() => {
    const creature = resident();
    if (creature === undefined) return;
    const snapshot: CompanionSnapshot = {
      ...creatureSnapshot(world(), creature, now(), answersFor),
      residents: seated(),
      waiting: needsYouCount(seams.needsYou?.() ?? []),
    };
    const key = JSON.stringify(snapshot);
    if (key === published) return;
    published = key;
    latest = snapshot;
    seams.host.publish(snapshot);
    if (snapshot.needsYou?.callId !== undefined && snapshot.threadId !== undefined) {
      void seams.store.open(snapshot.threadId);
    }
    const said = announce.next(snapshot);
    if (said !== undefined) seams.say(said.text);
  });

  onCleanup(
    seams.host.onAnswerRequested(({ callId, pick, accept, overturn }) => {
      const said = (line: string | undefined): void => {
        if (line !== undefined) seams.say(line);
      };
      if (overturn !== undefined) {
        void seams.overturn?.(overturn.recordId).then(said);
        return;
      }
      if (accept !== undefined) {
        void seams.acceptChore?.(accept).then(said);
        return;
      }
      const held = { sessionId: threadOfAsk(world(), callId), callId };
      const answering = { store: seams.store, approveKey: seams.approveKey() };
      void answerHeldAsk(answering, held, pick).then(said);
    }),
  );
  onCleanup(
    seams.host.onOpenRequested((threadId) => {
      if (threadId !== undefined) seams.openSession(threadId);
      else if (latest?.heldChore !== undefined) seams.openChores?.();
    }),
  );
  onCleanup(seams.host.onSwitchRequested(controller.switchTo));
}
