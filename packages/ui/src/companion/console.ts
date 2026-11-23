import type { ConsoleClient, ServerFeed } from "@keywork-app/client";
import { firstKit, kitNamed } from "@keywork-app/habitat/block";
import type { RoutineNeed } from "@keywork-app/protocol";
import { createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
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
import type { SteadBeside } from "./stead-beside.ts";
import { companionSwitch } from "./switch.tsx";
import { teamOf } from "./team.ts";

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
  readonly stead?: SteadBeside | undefined;
  hatch?: (() => void) | undefined;
  creature?: ConsoleClient["creature"] | undefined;
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
  const [remembered, setRemembered] = createSignal<string | null>();
  const [broughtForward, setBroughtForward] = createSignal<string>();
  const seated = createMemo(() => residents(world()));
  const resident = createMemo(() => {
    const wanted = controller.wanted() ?? remembered();
    return seated().find((candidate) => candidate.slug === wanted) ?? seated()[0];
  });
  const kit = createMemo(() => kitNamed(seams.stead?.kit() ?? "") ?? firstKit);
  const team = createMemo(() => teamOf(world(), kit(), now()));
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

  void seams.host.preferences().then(
    (kept) => setRemembered(kept.creature ?? null),
    () => setRemembered(null),
  );
  createEffect(
    on(
      controller.wanted,
      (chosen) => {
        if (chosen === undefined || chosen === remembered()) return;
        setRemembered(chosen);
        void seams.host.setPreferences({ creature: chosen });
      },
      { defer: true },
    ),
  );
  createEffect(on(seams.currentSession, (session) => setBroughtForward(session), { defer: true }));
  createEffect(() => {
    const session = broughtForward();
    const speaker = session === undefined ? undefined : world().threads[session]?.creature;
    if (speaker === undefined) return;
    setBroughtForward(undefined);
    controller.switchTo(speaker);
  });

  createEffect(() => {
    const creature = resident();
    if (creature === undefined || remembered() === undefined) return;
    const snapshot: CompanionSnapshot = {
      ...creatureSnapshot(world(), creature, now(), answersFor),
      residents: seated(),
      waiting: needsYouCount(seams.needsYou?.() ?? []),
      team: team(),
      steadOut: seams.stead?.shown() ?? false,
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
    seams.host.onAnswerRequested(({ callId, pick, reason, note, accept, overturn }) => {
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
      void answerHeldAsk(answering, held, pick, "relayed", reason, note).then(said);
    }),
  );
  onCleanup(
    seams.host.onOpenRequested((threadId) => {
      if (threadId !== undefined) seams.openSession(threadId);
      else if (latest?.heldChore !== undefined) seams.openChores?.();
    }),
  );
  onCleanup(seams.host.onSwitchRequested(controller.switchTo));
  const firstConversationWith = async (slug: string): Promise<string | undefined> => {
    const detail = await seams.creature?.(slug);
    return detail === undefined || "refused" in detail ? undefined : detail.conversation;
  };
  const openConversationWith = async (slug: string): Promise<void> => {
    const standing = team().members.find((member) => member.slug === slug)?.threadId;
    const conversation = standing ?? (await firstConversationWith(slug));
    if (conversation !== undefined && conversation !== "") seams.openSession(conversation);
  };
  onCleanup(
    seams.host.onChooseRequested((chosen) => {
      controller.switchTo(chosen);
      void openConversationWith(chosen);
    }),
  );
  onCleanup(seams.host.onHatchRequested(() => seams.hatch?.()));

  const putSteadAway = async (): Promise<void> => {
    const tookTheKeyboard = await seams.stead?.putAway(() => seams.host.takeKeyboardBack());
    seams.host.steadPutAway(tookTheKeyboard === true);
  };
  onCleanup(
    seams.host.onSteadRequested(({ creature, beside }) => {
      if (seams.stead === undefined) return;
      if (seams.stead.shown()) void putSteadAway();
      else void seams.stead.reveal(creature, beside);
    }),
  );
  onCleanup(seams.stead?.onAway(() => void putSteadAway()) ?? (() => undefined));
  onCleanup(controller.bindStead(() => seams.host.askForStead({ creature: resident()?.slug })));
}
