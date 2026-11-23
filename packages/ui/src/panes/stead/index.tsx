import { clockWord } from "../../chrome/clock-word.ts";
import { useProductProfile } from "../../chrome/product.ts";
import "../overview/overview.css";
import "./stead.css";
import type { ToolRun } from "@keywork-app/client";
import {
  CourtyardCapacityError,
  creatureReading,
  type HabitatState,
  heldAtThePorch,
  reconcileCourtyardOrder,
  skyAt,
  type Thread,
} from "@keywork-app/habitat";
import {
  type Appearance,
  firstKit,
  type Hit,
  type Kit,
  kitNamed,
  kits,
  levelEye,
  placeKey,
  raisedEye,
  samePlace,
} from "@keywork-app/habitat/block";
import type { DenyReason, SteadPlace } from "@keywork-app/protocol";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import { z } from "zod";
import { NeedsYouBubble as Bubble } from "../../companion/bubble.tsx";
import { creatureSnapshot, threadOfAsk } from "../../companion/feed.ts";
import type { ChoreAccept, NeedsYouBubble } from "../../companion/port.ts";
import { bubbleShown } from "../../companion/snapshot.ts";
import { CompanionSwitchRow } from "../../companion/switch.tsx";
import { hostFetch } from "../../host/transport.ts";
import type { BindingSpec } from "../../keys/keymap.ts";
import type { Rect } from "../../layout/index.ts";
import { createOnboardingController } from "../../onboarding/controller.ts";
import { OnboardingOnTheStead, onboardingActionId } from "../../onboarding/index.tsx";
import { type AskChords, type AskPick, denialFor } from "../../page/ask-card.tsx";
import { askingWhy, readWhyKeys, whyLine } from "../../page/ask-card-why.ts";
import { answerHeldAsk, askingRun, type HeldAsk } from "../../shell/answer-ask.ts";
import { useKeyboardScope } from "../../shell/keyboard-claim.ts";
import {
  choreAcceptedLine,
  heldChoresAmong,
  type NeedsYouItem,
  needYouCount,
  pendingAsksAmong,
} from "../../shell/needs-you.ts";
import { needsYouCount } from "../../shell/needs-you-ledger.ts";
import { decidedAmong, overturnStanding } from "../../shell/overturn.ts";
import { choresOverFetch } from "../chores/port.ts";
import { EmptyState } from "../empty-state.tsx";
import { definitionOf, parsePaneSpec } from "../index.ts";
import { keepKeyboardHome } from "../keyboard-home.ts";
import {
  definePane,
  type KeyHints,
  type PaneLocalAction,
  type PaneProps,
  type ShellSeams,
} from "../registry.ts";
import { BlockWorld, type BlockWorldControls } from "./block/block-world.tsx";
import { createPartnerships, handoffSeamsOf } from "./block/handoffs.ts";
import { createProjectSites, placeSeamsOf } from "./block/places.ts";
import { type Face, type Opening, openingAt, type Pressed, pressedOn } from "./block/press.ts";
import {
  acceptHint,
  acceptsOnly,
  bubbleLine,
  emptyStateLine,
  headLine,
  noAskHere,
  nothingDecidedHere,
  overturnHint,
  overturnsOnly,
  stateLabels,
  steadName,
  steadTitle,
  whatAreYouDoing,
} from "./copy.ts";
import { HomeOpening } from "./creature-home.tsx";
import { clockOffsetMinutes, createHabitatState, houseOffsetMinutes } from "./habitat.ts";
import { resolveSkinId } from "./habitat-render.ts";
import { coatOf } from "./herd.ts";
import { type SteadHomeScope, shellForStead } from "./home-scope.ts";
import { CourtyardPortrait } from "./portrait.tsx";
import { CreatureProjectControls } from "./project-controls.tsx";

const steadSpec = z.object({
  kind: z.literal(steadName),
  courtOrder: z
    .array(z.string().min(1).max(128))
    .max(4096)
    .optional()
    .describe("Keep each creature's plot where it was first raised as creatures leave and return."),
  kit: z
    .string()
    .min(1)
    .max(32)
    .optional()
    .describe("The building style and colours the keeper chose for the town."),
  light: z
    .enum(["night", "day", "clock"])
    .optional()
    .describe(
      "Draw the town by night, by day or by the house clock; unset, it follows the app theme.",
    ),
  eye: z
    .enum(["level", "raised"])
    .optional()
    .describe("Where the keeper wants the eye to rest; unset, it rises once a street forms."),
  corners: z
    .boolean()
    .optional()
    .describe("Rest the turned town on its corners, two sides at once, instead of square on."),
});

export type SteadSpec = z.output<typeof steadSpec>;

export const steadPane = definePane<SteadSpec>({
  kind: "stead",
  heading: "on the stead",
  spec: steadSpec,
  home: "main",
  attire: "house",
  subject: () => steadName,
  title: (_spec, shell) => steadTitle(waitingCount(shell.steadHome?.shell ?? shell)),
  emptyState: (keys) => emptyStateLine(keys.chord(onboardingActionId)),
  component: SteadPane,
  summon: {
    action: "stead.summon",
    chords: ["leader 0", "leader home"],
    help: "the stead: the ranch, every creature at a glance",
    command: {
      name: "stead",
      description: "open the stead, the ranch where the creatures work",
      aliases: ["ranch", "habitat"],
    },
    spec: () => ({ kind: "stead" }),
  },
  localActions: {
    "stead.down": steadAction(["j", "down"], "next place", "stead-down", "move to the next place"),
    "stead.up": steadAction(
      ["k", "up"],
      "previous place",
      "stead-up",
      "move to the previous place",
    ),
    "stead.open": steadAction(
      "enter",
      "open what the place holds",
      "stead-open",
      "open what the place under the cursor holds: a creature's thread, the porch's asks, the parcels or the mills",
    ),
    "stead.turn-left": steadAction(
      "left",
      "turn the stead a quarter to the left",
      "stead-turn-left",
      "turn the stead a quarter turn to the left to see its next side",
    ),
    "stead.turn-right": steadAction(
      "right",
      "turn the stead a quarter to the right",
      "stead-turn-right",
      "turn the stead a quarter turn to the right to see its next side",
    ),
    "stead.style": steadAction(
      "t",
      "the town's next building style",
      "stead-style",
      "build the town in its next style: Neon, Lantern, Terrace or Deco",
    ),
    "stead.light": steadAction(
      "l",
      "the town by night, by day, by the clock or as the app is themed",
      "stead-light",
      "draw the town by night, by day, by the house clock, or as the app theme has it",
    ),
    "stead.approve": steadAction(
      "y",
      "approve the porch ask once",
      "stead-approve",
      "approve the ask at the porch this one time",
    ),
    "stead.once": steadAction(
      "o",
      "approve the porch ask once",
      "stead-approve-once",
      "approve the ask at the porch this one time",
    ),
    "stead.session": steadAction(
      "s",
      "approve the porch ask for its session",
      "stead-approve-session",
      "approve the ask at the porch and its rules for the session",
    ),
    "stead.workspace": steadAction(
      "w",
      "approve the porch ask for this workspace",
      "stead-approve-workspace",
      "approve the ask at the porch and its rules for this workspace",
    ),
    "stead.deny": steadAction(
      "n",
      "deny the porch ask · then u unsafe, n not now, o other",
      "stead-deny",
      "deny the ask at the porch; the next key says why: unsafe, not now or other",
    ),
    "stead.overturn": steadAction(
      "x",
      "overturn the decision made for you at the porch",
      "stead-overturn",
      "overturn the call a promoted class decided in your name; the class waits for you again",
    ),
  },
  lifecycle: (_view, shell) =>
    waitingCount(shell) > 0 ? "needs-you" : anyWorking(shell) ? "working" : "idle",
});

export const bubbleWidthPx = 240;
export const steadAt = "stead.at";

export const faceWords: Readonly<Record<Face, string>> = {
  door: "Conversation",
  bench: "Running thread",
  shelf: "Delivered",
  board: "Chores",
};

export const lights = [undefined, "night", "day", "clock"] as const;

export function lightAt(
  chosen: SteadSpec["light"],
  now: number,
  offsetMinutes: number,
): Appearance | undefined {
  if (chosen !== "clock") return chosen;
  const phase = skyAt(now, offsetMinutes).phase;
  return phase === "day" || phase === "dawn" ? "day" : "night";
}

export function steadKeys(keys: KeyHints): AskChords {
  return {
    approve: keys.chord("stead.approve"),
    once: keys.chord("stead.once"),
    session: keys.chord("stead.session"),
    workspace: keys.chord("stead.workspace"),
    deny: keys.chord("stead.deny"),
  };
}

export function answerHint(keys: AskChords, open: string): string {
  return `${keys.approve} once · ${keys.session} session · ${keys.workspace} workspace · ${keys.deny} deny · ${open} opens`;
}

export type Porch = ThreadAtThePorch | ChoreAtThePorch | DecidedAtThePorch;

export interface Waiter {
  readonly slug: string;
  readonly name: string;
}

export interface ThreadAtThePorch {
  readonly kind: "thread";
  readonly waiter: Waiter;
  readonly thread: Thread;
  readonly callId: string | undefined;
}

export interface ChoreAtThePorch {
  readonly kind: "chore";
  readonly waiter: Waiter;
  readonly bubble: NeedsYouBubble;
}

export interface DecidedAtThePorch {
  readonly kind: "decided";
  readonly waiter: Waiter;
  readonly bubble: NeedsYouBubble;
  readonly recordId: string;
  readonly threadId: string;
}

export function porchOf(world: HabitatState, now: number): Porch | undefined {
  for (const slug of Object.keys(world.creatures).sort()) {
    const reading = heldAtThePorch(creatureReading(world, slug, now), world, slug);
    if (reading.state !== "porch") continue;
    const waiter = { slug, name: world.creatures[slug]?.name ?? slug };
    const standing = standingAtThePorch(world, waiter, reading.carrier?.thread, now);
    if (standing !== undefined) return standing;
  }
  return undefined;
}

export function placesInOrder(
  world: HabitatState,
  order: readonly string[],
  projects: Readonly<Record<string, readonly { readonly id: string }[]>>,
): SteadPlace[] {
  const workshops = order.flatMap((slug): SteadPlace[] => {
    const creature = world.creatures[slug];
    if (creature === undefined || creature.workshop.boardedAt !== undefined) return [];
    return [
      { kind: "workshop", creature: slug },
      ...(projects[slug] ?? []).map(
        (site): SteadPlace => ({ kind: "project", creature: slug, directory: site.id }),
      ),
    ];
  });
  const mill: SteadPlace[] = Object.keys(world.mills).length > 0 ? [{ kind: "mill" }] : [];
  return [...workshops, { kind: "porch" }, { kind: "store" }, ...mill];
}

const answerPicks: Readonly<Record<string, AskPick>> = {
  "stead.approve": "approve",
  "stead.once": "once",
  "stead.session": "session",
  "stead.workspace": "workspace",
  "stead.deny": "deny",
};

function SteadPane(props: PaneProps<SteadSpec>) {
  onMount(() => props.shell.prepareSteadHome?.());
  return (
    <Show
      when={props.shell.steadHome}
      keyed
      fallback={
        <Show when={props.shell.prepareSteadHome !== undefined} fallback={<Stead {...props} />}>
          <HomeOpening shell={props.shell} class="kw-ov kw-stead" />
        </Show>
      }
    >
      {(scope) => <ConnectedStead {...props} scope={scope} />}
    </Show>
  );
}

function ConnectedStead(props: PaneProps<SteadSpec> & { readonly scope: SteadHomeScope }) {
  const shell = { ...shellForStead(props.shell, props.scope), rebind: props.shell.rebind };
  const pane = createMemo(() => parsePaneSpec(props.scope.presentedPane?.()));
  return (
    <Show when={pane()} keyed fallback={<Stead {...props} shell={shell} />}>
      {(spec) => (
        <div class="kw-stead-presented" data-keywork-pane-kind={spec.kind} data-native-activation>
          <button type="button" class="kw-stead-back" onClick={() => props.scope.dismissPane?.()}>
            <span aria-hidden="true">‹ </span>Back to creatures
          </button>
          <Dynamic
            component={definitionOf(spec.kind).component}
            id={props.id}
            spec={spec}
            focused={props.focused}
            shell={shell}
            onAction={props.onAction}
          />
        </div>
      )}
    </Show>
  );
}

function Stead(props: PaneProps<SteadSpec>) {
  const keyboard = useKeyboardScope();
  const profile = useProductProfile();
  const onboarding = props.shell.onboarding ?? createOnboardingController();
  let root: HTMLElement | undefined;
  keepKeyboardHome(
    () => onboarding.card() ?? root,
    () => props.focused,
  );
  const houseOffset = houseOffsetMinutes();
  const offsetMinutes = clockOffsetMinutes();
  const world = createHabitatState({
    rows: () => props.shell.store.state.summaries,
    bots: () => props.shell.store.surfaces.state.bots,
    currentSession: () => props.shell.currentSession(),
    asks: () => pendingAsksAmong(waitingIn(props.shell)),
    chores: () => heldChoresAmong(waitingIn(props.shell)),
    decided: () => decidedAmong(waitingIn(props.shell)),
    routines: (creature) => props.shell.client.routines(creature),
    creatures: () => props.shell.client.creatures(),
    feed: props.shell.feed,
    now: Date.now,
    offsetMinutes: houseOffset,
  });
  const [preference, setPreference] = createSignal(props.spec);
  createEffect(
    on(
      () => props.spec,
      (bound) => {
        const kept = { ...preference(), ...bound };
        setPreference(kept);
        if (!samePreferences(kept, bound)) props.shell.rebind(props.id, kept);
      },
      { defer: true },
    ),
  );
  const remember = (change: Partial<SteadSpec>): void => {
    setPreference((held) => ({ ...held, ...change }));
    props.shell.rebind(props.id, preference());
  };
  const order = createMemo(() => storedOrder(world(), preference().courtOrder ?? []));
  createEffect(
    on(order, (held) => {
      const stored = preference().courtOrder ?? [];
      if (held !== stored && held.length > 0) remember({ courtOrder: [...held] });
    }),
  );
  const sites = createProjectSites(placeSeamsOf(props.shell), world);
  const partnerships = createPartnerships(handoffSeamsOf(props.shell));
  const kit = createMemo((): Kit => kitNamed(preference().kit ?? "") ?? firstKit);
  const [controls, setControls] = createSignal<BlockWorldControls>();
  const [cursor, setCursor] = createSignal<SteadPlace>();
  const [hovered, setHovered] = createSignal(false);
  const [notice, setNotice] = createSignal<string>();
  const [wording, setWording] = createSignal<string>();

  const places = createMemo(() => placesInOrder(world(), order(), sites()));
  const pointed = (): SteadPlace | undefined => cursor() ?? places()[0];
  const meetsItsCreature = (): boolean =>
    profile.id === "stead" && props.shell.steadHome !== undefined;
  const residents = () => Object.values(world().creatures);
  const keys = createMemo(() => steadKeys(props.shell.keys));
  const now = minuteClock();
  const porch = createMemo(() => porchOf(world(), now()));
  const heldAsk = (): HeldAsk | undefined => {
    const standing = porch();
    return standing?.kind !== "thread" || standing.callId === undefined
      ? undefined
      : { sessionId: standing.thread.id, callId: standing.callId };
  };
  const sayingWhy = (): boolean => {
    const callId = heldAsk()?.callId;
    return callId !== undefined && askingWhy(callId);
  };
  const wordingHere = (): boolean => wording() !== undefined && wording() === heldAsk()?.callId;
  const overturnKey = (): string => props.shell.keys.chord("stead.overturn");
  const footLine = (): string | undefined => {
    if (notice() !== undefined) return notice();
    if (porch()?.kind === "chore") return acceptHint(keys().approve);
    if (porch()?.kind === "decided") {
      return overturnHint(overturnKey(), props.shell.keys.chord("stead.open"));
    }
    if (heldAsk() === undefined || wordingHere()) return undefined;
    return sayingWhy() ? whyLine : answerHint(keys(), props.shell.keys.chord("stead.open"));
  };

  const setOut = (opening: Opening, place: SteadPlace): void => {
    if (opening.kind === "notice") {
      setNotice(opening.line);
      return;
    }
    setNotice(undefined);
    const spec = opening.spec;
    if (props.shell.setOut !== undefined) props.shell.setOut(spec, place);
    else if (spec.kind === "conversation" && spec.sessionId !== undefined)
      props.shell.sessions.openSession(spec.sessionId);
    else props.shell.openPane(spec);
  };
  const press = (pressed: Pressed): void => {
    setCursor(pressed.place);
    setOut(openingAt(pressed, world(), props.shell.workspace), pressed.place);
  };
  const pick = (hit: Hit): void => {
    const pressed = pressedOn(hit);
    if (pressed !== undefined) press(pressed);
  };
  const step = (by: number): void => {
    const all = places();
    if (all.length === 0) return;
    const held = cursor();
    const at = held === undefined ? -1 : all.findIndex((place) => samePlace(place, held));
    const next = at < 0 ? (by > 0 ? 0 : all.length - 1) : (at + by + all.length) % all.length;
    setNotice(undefined);
    setCursor(all[next]);
  };

  const openPorch = (standing: Porch): void => {
    const place: SteadPlace = { kind: "porch" };
    if (standing.kind === "chore") setOut({ kind: "pane", spec: { kind: "chores" } }, place);
    else if (standing.kind === "decided") setOut(conversation(standing.threadId), place);
    else setOut(conversation(standing.thread.id), place);
  };
  const overturn = (): void => {
    const standing = porch();
    if (standing?.kind !== "decided") {
      setNotice(nothingDecidedHere);
      return;
    }
    void overturnStanding(props.shell.client, props.shell.needsYou?.queue, standing.recordId).then(
      (line) => setNotice(line),
    );
  };
  const acceptGrants = (accept: ChoreAccept): void => {
    void acceptHeldChore(props.shell, accept).then((line) => setNotice(line));
  };
  const answer = (pick: AskPick, reason?: DenyReason, note?: string): void => {
    const standing = porch();
    if (standing?.kind === "decided") {
      setNotice(overturnsOnly(overturnKey()));
      return;
    }
    if (standing?.kind === "chore") {
      const accept = standing.bubble.accept;
      if (accept !== undefined && (pick === "approve" || pick === "once")) acceptGrants(accept);
      else setNotice(acceptsOnly(keys().approve));
      return;
    }
    const held = heldAsk();
    if (held === undefined) {
      setNotice(noAskHere);
      return;
    }
    const answering = { store: props.shell.store, approveKey: keys().approve };
    void answerHeldAsk(answering, held, pick, reason, note).then((line) => setNotice(line));
  };
  const giveReason = (reason: DenyReason, words: boolean): void => {
    if (words) setWording(heldAsk()?.callId);
    else answer("deny", reason);
  };
  const sendWords = (note: string): void => {
    setWording(undefined);
    const denial = denialFor("other", note);
    answer("deny", denial.reason, denial.note);
    keyboard?.returnHome();
  };
  readWhyKeys(
    () => root,
    () => (props.focused && !wordingHere() ? heldAsk()?.callId : undefined),
    giveReason,
  );

  const at = (slug: string | undefined): void => {
    if (slug === undefined || slug === "") return void setCursor(undefined);
    const creature = world().creatures[slug];
    if (creature === undefined || creature.workshop.boardedAt !== undefined) return;
    const place: SteadPlace = { kind: "workshop", creature: slug };
    setNotice(undefined);
    setCursor(place);
    controls()?.face(place);
  };

  props.onAction((action, argument) => {
    if (onboarding.take(action)) return;
    if (action === steadAt) return at(argument);
    const asked = answerPicks[action];
    if (asked !== undefined) return answer(asked);
    switch (action) {
      case "stead.overturn":
        return overturn();
      case "stead.turn-left":
        return controls()?.turn(-1);
      case "stead.turn-right":
        return controls()?.turn(1);
      case "stead.style":
        return remember({ kit: after(kits, kit()).id });
      case "stead.light":
        return remember({ light: after(lights, preference().light) });
      case "stead.down":
        return step(1);
      case "stead.up":
        return step(-1);
      case "stead.open": {
        const place = pointed();
        if (place !== undefined) press({ place, face: undefined });
        return;
      }
    }
  });
  const porchCall = createMemo(() => heldAsk()?.callId);
  createEffect(
    on(porchCall, (callId) => {
      const standing = porch();
      if (callId !== undefined && standing?.kind === "thread") {
        void props.shell.store.open(standing.thread.id);
      }
    }),
  );

  const needYou = (): number => waitingCount(props.shell);
  const working = createMemo(
    () =>
      residents().filter(
        (resident) =>
          creatureSnapshot(
            world(),
            { slug: resident.slug, name: resident.name, hueStop: undefined },
            now(),
          ).state === "working",
      ).length,
  );
  const head = (): string =>
    headLine({
      creatures: residents().length,
      needYou: needYou(),
      working: working(),
      phase: skyAt(now(), houseOffset).phase,
      clock: clockWord(now(), offsetMinutes),
      floating: residents().find((resident) => resident.slug === props.shell.companion?.floating())
        ?.name,
    });
  const bubbleRun = (): ToolRun | undefined => {
    const held = heldAsk();
    return held === undefined
      ? undefined
      : askingRun(props.shell.store.projection(held.sessionId), held.callId);
  };
  const workshopCreature = (): string | undefined => {
    const place = pointed();
    return place?.kind === "workshop" || place?.kind === "project" ? place.creature : undefined;
  };
  const currentCreature = () => world().creatures[workshopCreature() ?? ""] ?? residents()[0];
  const cursorRect = (): Rect | undefined => {
    const place = cursor();
    return place === undefined || !props.focused ? undefined : controls()?.onStage(place);
  };

  return (
    <section
      class="kw-ov kw-stead"
      aria-label="stead"
      tabIndex={-1}
      ref={root}
      data-hit={hovered() ? "" : undefined}
    >
      <div class="kw-ov-head">
        <span class="kw-ov-head-lead">{head()}</span>
      </div>
      <CompanionSwitchRow
        switch={props.shell.companion?.toggle()}
        creatures={residents().length}
        chord={props.shell.keys.chord("companion.toggle")}
      />
      <BlockWorld
        world={world()}
        focused={props.focused}
        hidden={false}
        kit={kit()}
        holding={onboarding.active() !== undefined}
        light={lightAt(preference().light, now(), houseOffset)}
        eye={eyeOf(preference().eye)}
        corners={preference().corners}
        order={order()}
        projects={sites()}
        partnerships={partnerships()}
        board={props.shell.steadPlaces}
        onPick={pick}
        onHover={(hit) => setHovered(hit !== undefined)}
        onControls={setControls}
      >
        <Show when={cursorRect()}>
          {(rect) => (
            <span
              class="kw-stead-cursor"
              data-place={keyOf(cursor())}
              aria-hidden="true"
              style={{
                left: `${rect().x - 3}px`,
                top: `${rect().y - 3}px`,
                width: `${rect().width + 6}px`,
                height: `${rect().height + 6}px`,
                ...inkOf(cursor(), world()),
              }}
            />
          )}
        </Show>
        <Show when={porch()}>
          {(standing) => (
            <Bubble
              placement="porch"
              bubble={porchBubble(standing())}
              style={bubbleStyle(controls()?.onStage({ kind: "porch" }))}
              run={bubbleRun()}
              keys={keys()}
              overturnChord={overturnKey()}
              wording={wordingHere()}
              onOpen={() => openPorch(standing())}
              onAnswer={(pick) => answer(pick)}
              onAccept={acceptGrants}
              onOverturn={overturn}
              onReason={(reason) => giveReason(reason, reason === "other")}
              onWords={sendWords}
            />
          )}
        </Show>
        <Show when={cursor()}>
          {(place) => (
            <PlaceBar
              place={place()}
              world={world()}
              offsetMinutes={offsetMinutes}
              waiting={needYou()}
              onPress={(face) => press({ place: place(), face })}
            />
          )}
        </Show>
      </BlockWorld>
      <TownControls
        kit={kit()}
        light={preference().light}
        eye={preference().eye}
        corners={preference().corners === true}
        side={controls()?.side() ?? "front"}
        onKit={(chosen) => remember({ kit: chosen })}
        onLight={(chosen) => remember({ light: chosen })}
        onEye={(chosen) => remember({ eye: chosen })}
        onCorners={(on) => remember({ corners: on })}
        onTurn={(steps) => controls()?.turn(steps)}
      />
      <OnboardingOnTheStead
        shell={props.shell}
        controller={onboarding}
        automatic={profile.startup === "creature"}
      />
      <Show
        when={residents().length === 0 && !meetsItsCreature() && onboarding.active() === undefined}
      >
        <EmptyState line={steadPane.emptyState(props.shell.keys)} />
      </Show>
      <Show when={props.shell.steadHome} keyed>
        {(scope) => (
          <Show when={currentCreature()?.slug} keyed>
            {(slug) => (
              <CreatureProjectControls
                creature={{
                  slug,
                  get name() {
                    return world().creatures[slug]?.name ?? slug;
                  },
                }}
                scope={scope}
                feed={props.shell.feed}
                conversation={async (slug) => {
                  const creature = await props.shell.client.creature(slug);
                  return "refused" in creature ? undefined : creature.conversation || undefined;
                }}
              />
            )}
          </Show>
        )}
      </Show>
      <Show when={footLine()}>{(line) => <p class="kw-ov-line">{line()}</p>}</Show>
    </section>
  );
}

interface PlaceBarProps {
  readonly place: SteadPlace;
  readonly world: HabitatState;
  readonly offsetMinutes: number;
  readonly waiting: number;
  onPress(face: Face | undefined): void;
}

function PlaceBar(props: PlaceBarProps) {
  const creature = () =>
    props.place.kind === "workshop" ? props.world.creatures[props.place.creature] : undefined;
  const ranks = createMemo(() => Object.keys(props.world.creatures).sort());
  return (
    <section
      class="kw-stead-place"
      aria-label={placeName(props.place, props.world)}
      data-native-activation
    >
      <Show when={creature()}>
        {(resident) => (
          <span class="kw-stead-place-portrait" aria-hidden="true">
            <CourtyardPortrait
              skin={resolveSkinId(resident().skin, resident().seed ?? 0)}
              hueStop={coatOf(resident(), ranks().indexOf(resident().slug))}
              appearance={0}
            />
          </span>
        )}
      </Show>
      <span class="kw-stead-place-name">{placeName(props.place, props.world)}</span>
      <span>{placeTelling(props.place, props.world, props.offsetMinutes, props.waiting)}</span>
      <span class="kw-stead-place-faces">
        <For each={facesOf(props.place)}>
          {(face) => (
            <button type="button" data-face={face ?? "whole"} onClick={() => props.onPress(face)}>
              {face === undefined ? wholeWords[props.place.kind] : faceWords[face]}
            </button>
          )}
        </For>
      </span>
    </section>
  );
}

interface TownControlsProps {
  readonly kit: Kit;
  readonly light: SteadSpec["light"];
  readonly eye: SteadSpec["eye"];
  readonly corners: boolean;
  readonly side: string;
  onKit(id: string): void;
  onLight(light: SteadSpec["light"]): void;
  onEye(eye: SteadSpec["eye"]): void;
  onCorners(on: boolean): void;
  onTurn(steps: number): void;
}

function TownControls(props: TownControlsProps) {
  return (
    <div class="kw-stead-controls" data-native-activation>
      <fieldset aria-label="turn the stead">
        <button type="button" onClick={() => props.onTurn(-1)}>
          ◀ Turn
        </button>
        <button type="button" onClick={() => props.onTurn(1)}>
          Turn ▶
        </button>
      </fieldset>
      <span class="kw-stead-side">from the {props.side}</span>
      <fieldset aria-label="building style">
        <For each={kits}>
          {(each) => (
            <button
              type="button"
              aria-pressed={props.kit.id === each.id}
              onClick={() => props.onKit(each.id)}
            >
              {each.name}
            </button>
          )}
        </For>
      </fieldset>
      <fieldset aria-label="night or day">
        <For each={lights.slice(1)}>
          {(each) => (
            <button
              type="button"
              aria-pressed={props.light === each}
              onClick={() => props.onLight(props.light === each ? undefined : each)}
            >
              {lightWords[each ?? "clock"]}
            </button>
          )}
        </For>
      </fieldset>
      <fieldset aria-label="where the eye rests">
        <button
          type="button"
          aria-pressed={props.eye === "level"}
          onClick={() => props.onEye(props.eye === "level" ? undefined : "level")}
        >
          Level eye
        </button>
        <button
          type="button"
          aria-pressed={props.eye === "raised"}
          onClick={() => props.onEye(props.eye === "raised" ? undefined : "raised")}
        >
          Raised eye
        </button>
        <button
          type="button"
          aria-pressed={props.corners}
          onClick={() => props.onCorners(!props.corners)}
        >
          Rest on corners
        </button>
      </fieldset>
    </div>
  );
}

const lightWords: Readonly<Record<NonNullable<SteadSpec["light"]>, string>> = {
  night: "Night",
  day: "Day",
  clock: "By the clock",
};

function samePreferences(one: SteadSpec, other: SteadSpec): boolean {
  const keys = new Set([...Object.keys(one), ...Object.keys(other)]) as Set<keyof SteadSpec>;
  return [...keys].every((key) => JSON.stringify(one[key]) === JSON.stringify(other[key]));
}

function after<T>(all: readonly T[], held: T): T {
  return all[(all.indexOf(held) + 1) % all.length] as T;
}

const wholeWords: Readonly<Record<SteadPlace["kind"], string>> = {
  workshop: "Its thread",
  porch: "What needs you",
  store: "Parcels",
  mill: "Mills",
  project: "Files",
};

function facesOf(place: SteadPlace): readonly (Face | undefined)[] {
  return place.kind === "workshop" ? ["door", "bench", "shelf", "board"] : [undefined];
}

function placeName(place: SteadPlace, world: HabitatState): string {
  switch (place.kind) {
    case "workshop":
      return `${world.creatures[place.creature]?.name ?? place.creature}'s workshop`;
    case "project":
      return `${lastPart(place.directory)} · ${world.creatures[place.creature]?.name ?? place.creature}'s project`;
    case "porch":
      return "the porch";
    case "store":
      return "the storehouse";
    case "mill":
      return "the mill";
  }
}

function placeTelling(
  place: SteadPlace,
  world: HabitatState,
  offsetMinutes: number,
  waiting: number,
): string {
  if (place.kind === "porch") return waiting === 0 ? "nothing waits on you" : needYouCount(waiting);
  if (place.kind !== "workshop") return "";
  const creature = world.creatures[place.creature];
  const now = Date.now();
  const reading = creatureReading(world, place.creature, now);
  const carried = reading.carrier?.thread;
  return `${stateLabels[reading.state]} · ${whatAreYouDoing({
    reading,
    thread: carried === undefined ? undefined : world.threads[carried],
    chores: creature?.chores ?? [],
    parcelFogged: undefined,
    now,
    offsetMinutes,
    asOf: world.asOf,
    lastEvent: undefined,
  })}`;
}

function inkOf(place: SteadPlace | undefined, world: HabitatState): Record<string, string> {
  if (place?.kind !== "workshop" && place?.kind !== "project") return {};
  const creature = world.creatures[place.creature];
  if (creature === undefined) return {};
  const rank = Object.keys(world.creatures).sort().indexOf(creature.slug);
  return { "--kw-cursor-ink": `var(--kw-ramp-${coatOf(creature, rank)})` };
}

function keyOf(place: SteadPlace | undefined): string | undefined {
  return place === undefined ? undefined : placeKey(place);
}

function eyeOf(eye: SteadSpec["eye"]): number | undefined {
  return eye === "level" ? levelEye : eye === "raised" ? raisedEye : undefined;
}

function storedOrder(world: HabitatState, prior: readonly string[]): readonly string[] {
  try {
    return reconcileCourtyardOrder(world, prior);
  } catch (error) {
    if (error instanceof CourtyardCapacityError) return prior;
    throw error;
  }
}

function standingAtThePorch(
  world: HabitatState,
  waiter: Waiter,
  carried: string | undefined,
  now: number,
): Porch | undefined {
  const snapshot = creatureSnapshot(world, { ...waiter, hueStop: undefined }, now);
  const shown = bubbleShown(snapshot);
  if (shown?.overturn !== undefined && snapshot.decided !== undefined) {
    return {
      kind: "decided",
      waiter,
      bubble: shown,
      recordId: snapshot.decided.recordId,
      threadId: snapshot.decided.sessionId,
    };
  }
  if (shown !== undefined && shown.callId === undefined)
    return { kind: "chore", waiter, bubble: shown };
  const id = shown?.callId === undefined ? carried : threadOfAsk(world, shown.callId);
  const thread = id === undefined ? undefined : world.threads[id];
  return thread === undefined
    ? undefined
    : { kind: "thread", waiter, thread, callId: shown?.callId };
}

function porchBubble(porch: Porch): NeedsYouBubble {
  if (porch.kind !== "thread") return porch.bubble;
  return {
    title: porch.thread.title === "" ? porch.thread.id : porch.thread.title,
    line: bubbleLine(porch.thread),
    callId: porch.callId,
    answers: [],
  };
}

function bubbleStyle(porch: Rect | undefined): Record<string, string> {
  if (porch === undefined) return { left: "8px", top: "8px", width: `${bubbleWidthPx}px` };
  const left = Math.max(0, porch.x + porch.width / 2 - bubbleWidthPx / 2);
  return {
    left: `${Math.round(left)}px`,
    top: `${Math.max(0, porch.y - 4)}px`,
    width: `${bubbleWidthPx}px`,
    transform: "translateY(-100%)",
  };
}

function minuteClock(): () => number {
  const [now, setNow] = createSignal(Date.now());
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = (): void => {
    const at = Date.now();
    setNow(at);
    timer = setTimeout(tick, 60_000 - (at % 60_000));
  };
  timer = setTimeout(tick, 60_000 - (Date.now() % 60_000));
  onCleanup(() => clearTimeout(timer));
  return now;
}

function conversation(sessionId: string): Opening {
  return { kind: "pane", spec: { kind: "conversation", sessionId } };
}

function lastPart(directory: string): string {
  return (
    directory
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .at(-1) ?? directory
  );
}

async function acceptHeldChore(shell: ShellSeams, accept: ChoreAccept): Promise<string> {
  const chores = choresOverFetch(hostFetch(shell.host, shell.workspace));
  const answer = await chores.accept(accept.creature, accept.routineId, accept.digest);
  return answer.ok ? choreAcceptedLine(accept.routineId) : answer.error;
}

function steadAction(
  chords: BindingSpec,
  help: string,
  name: string,
  description: string,
): PaneLocalAction {
  return { chords, help, command: { name, description } };
}

function waitingIn(shell: ShellSeams): readonly NeedsYouItem[] {
  return shell.needsYou?.queue.items().filter((item) => item.workspace === shell.workspace) ?? [];
}

function waitingCount(shell: ShellSeams): number {
  return needsYouCount(waitingIn(shell));
}

function anyWorking(shell: ShellSeams): boolean {
  return shell.store.state.summaries.some((row) => row.working === true);
}
