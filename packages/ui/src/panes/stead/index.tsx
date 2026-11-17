import { clockWord } from "../../chrome/clock-word.ts";
import { useProductProfile } from "../../chrome/product.ts";
import "../overview/overview.css";
import "./stead.css";
import type { ToolRun } from "@keywork-app/client";
import {
  creatureReading,
  districtCapacity,
  type Gesture,
  type HabitatState,
  isWorkshopFamily,
  type Pointer,
  type PowerTier,
  type StepContext,
  skyAt,
  type Thread,
  threadsOf,
  workshopFamilies,
  workshopFamilyOf,
} from "@keywork-app/habitat";
import { type GardenKind, gardenKinds } from "@keywork-app/habitat/render";
import type { DenyReason } from "@keywork-app/protocol";
import {
  createEffect,
  createMemo,
  createSignal,
  Index,
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
  pendingAsksAmong,
} from "../../shell/needs-you.ts";
import { needsYouCount } from "../../shell/needs-you-ledger.ts";
import { decidedAmong, overturnStanding } from "../../shell/overturn.ts";
import { windowFocus } from "../../shell/window-focus.ts";
import { choresOverFetch } from "../chores/port.ts";
import { EmptyState } from "../empty-state.tsx";
import { definitionOf, parsePaneSpec } from "../index.ts";
import { keepKeyboardHome } from "../keyboard-home.ts";
import { createCursor } from "../overview/rows.tsx";
import {
  definePane,
  type KeyHints,
  type PaneLocalAction,
  type PaneProps,
  type ShellSeams,
} from "../registry.ts";
import {
  acceptHint,
  acceptsOnly,
  bubbleLine,
  choreBoard,
  emptyStateLine,
  headLine,
  noAskHere,
  noPaneYet,
  noThreadYet,
  nothingDecidedHere,
  overturnHint,
  overturnsOnly,
  skinRefusedLine,
  stateLabels,
  steadName,
  steadTitle,
  whatAreYouDoing,
} from "./copy.ts";
import { createCourtyardView } from "./courtyard-view.ts";
import { CourtyardOverview } from "./courtyards/index.tsx";
import { HomeOpening } from "./creature-home.tsx";
import { type PlacedMember, steadDrawer } from "./draw.ts";
import { browserFieldHost, type FieldPicture, steadField } from "./field.ts";
import { createHabitatState, houseOffsetMinutes } from "./habitat.ts";
import {
  figureAt,
  hotspotAt,
  type PlacedFigure,
  pointerOffset,
  type SceneTarget,
  type SteadScene,
} from "./habitat-render.ts";
import { emptyHerd, gatherHerd, type Herd, type Member, stepHerd } from "./herd.ts";
import { type SteadHomeScope, shellForStead } from "./home-scope.ts";
import {
  type CanvasFit,
  forcedColorsQuery,
  reducedMotionActive,
  reducedMotionQuery,
  watchMedia,
  watchSize,
  watchTheme,
} from "./painter.ts";
import { CreatureProjectControls } from "./project-controls.tsx";
import { SettlementControls } from "./settlement-controls.tsx";
import { savedChoice, settlementDistricts } from "./settlement-preferences.ts";

const steadSpec = z.object({
  kind: z.literal(steadName),
  view: z
    .enum(["scene", "courtyards"])
    .optional()
    .describe("Remember whether this habitat opens as a continuous scene or a courtyard overview."),
  courtOrder: z
    .array(z.string().min(1).max(128))
    .max(4096)
    .optional()
    .describe("Keep courtyard addresses stable as creatures arrive, leave, and return."),
  workshopStyles: z
    .record(z.string().min(1).max(128), z.enum(workshopFamilies))
    .refine((styles) => Object.keys(styles).length <= 4096)
    .optional()
    .describe("Remember optional architectural choices without changing workshop capabilities."),
  gardens: z
    .record(z.string().min(1).max(128), z.enum(gardenKinds))
    .refine((gardens) => Object.keys(gardens).length <= 4096)
    .optional()
    .describe(
      "Remember peaceful ornamental plantings; gardens do not simulate work or require care.",
    ),
  alignment: z
    .enum(["roomy", "compact"])
    .optional()
    .describe(
      "Fit courtyard tiles to the available width without changing their permanent addresses.",
    ),
});

export type SteadSpec = z.output<typeof steadSpec>;

export const steadPane = definePane<SteadSpec>({
  kind: "stead",
  heading: "on the stead",
  spec: steadSpec,
  home: "main",
  attire: "house",
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
    "stead.down": steadAction(
      ["j", "down"],
      "next creature",
      "stead-down",
      "move to the next creature",
    ),
    "stead.up": steadAction(
      ["k", "up"],
      "previous creature",
      "stead-up",
      "move to the previous creature",
    ),
    "stead.open": steadAction(
      "enter",
      "open the thread it is on",
      "stead-open",
      "open the highest-priority thread of the creature under the cursor",
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
export const dragThresholdArt = 2;

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

export interface ThreadAtThePorch {
  readonly kind: "thread";
  readonly member: Member;
  readonly thread: Thread;
  readonly callId: string | undefined;
}

export interface ChoreAtThePorch {
  readonly kind: "chore";
  readonly member: Member;
  readonly bubble: NeedsYouBubble;
}

export interface DecidedAtThePorch {
  readonly kind: "decided";
  readonly member: Member;
  readonly bubble: NeedsYouBubble;
  readonly recordId: string;
  readonly threadId: string;
}

export function porchOf(world: HabitatState, herd: Herd, now: number): Porch | undefined {
  for (const member of herd.members) {
    if (member.creature.reading.state !== "porch") continue;
    const standing = standingAtThePorch(world, member, now);
    if (standing !== undefined) return standing;
  }
  return undefined;
}

function standingAtThePorch(world: HabitatState, member: Member, now: number): Porch | undefined {
  const snapshot = creatureSnapshot(world, member, now);
  const shown = bubbleShown(snapshot);
  if (shown?.overturn !== undefined && snapshot.decided !== undefined) {
    return {
      kind: "decided",
      member,
      bubble: shown,
      recordId: snapshot.decided.recordId,
      threadId: snapshot.decided.sessionId,
    };
  }
  if (shown !== undefined && shown.callId === undefined)
    return { kind: "chore", member, bubble: shown };
  const thread = threadAtThePorch(world, member, shown?.callId);
  return thread === undefined
    ? undefined
    : { kind: "thread", member, thread, callId: shown?.callId };
}

function threadAtThePorch(
  world: HabitatState,
  member: Member,
  callId: string | undefined,
): Thread | undefined {
  const id =
    callId === undefined ? member.creature.reading.carrier?.thread : threadOfAsk(world, callId);
  return id === undefined ? undefined : world.threads[id];
}

export function threadFor(world: HabitatState, member: Member): string | undefined {
  return threadForCreature(world, member.slug, member.creature.reading.carrier?.thread);
}

function threadForCreature(
  world: HabitatState,
  slug: string,
  carried: string | undefined,
): string | undefined {
  if (carried !== undefined) return carried;
  const conversation = world.creatures[slug]?.conversation;
  if (conversation !== undefined) return conversation;
  return threadsOf(world, slug).sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))[0]
    ?.id;
}

interface ArtPoint {
  readonly x: number;
  readonly y: number;
}

interface PaintedFrame {
  readonly scene: SteadScene;
  readonly fit: CanvasFit;
  readonly figures: readonly PlacedMember[];
  readonly at: number;
  readonly tier: PowerTier;
  readonly still: boolean;
  readonly wakes: number;
  readonly frames: number;
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
  let stage: HTMLDivElement | undefined;
  let field: HTMLDivElement | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let courtHeading: HTMLSpanElement | undefined;
  keepKeyboardHome(
    () => onboarding.card() ?? root,
    () => props.focused,
  );
  const offsetMinutes = houseOffsetMinutes();
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
    offsetMinutes,
  });
  const [herd, setHerd] = createSignal<Herd>(emptyHerd);
  const [preference, setPreference] = createSignal(props.spec);
  createEffect(on(() => props.spec, setPreference, { defer: true }));
  const remember = (change: Partial<SteadSpec>): void => {
    setPreference((held) => ({ ...held, ...change }));
    props.shell.rebind(props.id, preference());
  };
  const courts = createCourtyardView({
    world,
    preference,
    rememberScene: true,
    save: (next) =>
      remember({
        ...next,
        courtOrder: next.courtOrder === undefined ? undefined : [...next.courtOrder],
      }),
  });
  const districts = createMemo(() =>
    settlementDistricts(courts.order(), Object.keys(world().creatures)),
  );
  const [district, setDistrict] = createSignal(0);
  const districtIndex = () => Math.min(district(), Math.max(0, districts().length - 1));
  const neighborhood = createMemo(() => districts()[districtIndex()]);
  const sceneSlugs = createMemo(
    () => neighborhood()?.slugs ?? Object.keys(world().creatures).sort().slice(0, districtCapacity),
  );
  const families = createMemo(() =>
    Object.fromEntries(
      districts().flatMap((district) =>
        district.slugs.map((slug, offset) => [
          slug,
          workshopFamilyOf(district.start + offset, savedChoice(preference().workshopStyles, slug)),
        ]),
      ),
    ),
  );
  const [appearanceUndo, setAppearanceUndo] =
    createSignal<Pick<SteadSpec, "workshopStyles" | "gardens" | "alignment">>();
  const changeAppearance = (
    change: Pick<SteadSpec, "workshopStyles" | "gardens" | "alignment">,
  ): void => {
    const held = preference();
    setAppearanceUndo({
      workshopStyles: held.workshopStyles,
      gardens: held.gardens,
      alignment: held.alignment,
    });
    remember(change);
  };
  const chooseFamily = (value: string): void => {
    const slug = courts.selected();
    if (slug === undefined || (value !== "auto" && !isWorkshopFamily(value))) return;
    const styles = isWorkshopFamily(value)
      ? { ...preference().workshopStyles, [slug]: value }
      : { ...preference().workshopStyles };
    if (value === "auto") delete styles[slug];
    changeAppearance({ workshopStyles: styles });
  };
  const chooseGarden = (value: string): void => {
    const slug = courts.selected();
    if (slug === undefined || (value !== "none" && !gardenKinds.some((garden) => garden === value)))
      return;
    const gardens =
      value === "none"
        ? { ...preference().gardens }
        : { ...preference().gardens, [slug]: value as GardenKind };
    if (value === "none") delete gardens[slug];
    changeAppearance({ gardens });
  };
  const courtScroll = new Map<string, number>();
  const mountedAt = Date.now();
  const [frame, setFrame] = createSignal<PaintedFrame>();
  const [overviewTime, setOverviewTime] = createSignal(Date.now());
  const [pointer, setPointer] = createSignal<ArtPoint>();
  const [hovered, setHovered] = createSignal<string>();
  const [notice, setNotice] = createSignal<string>();
  const [wording, setWording] = createSignal<string>();
  const queuedGestures = new Map<string, Gesture[]>();
  let downAt: ArtPoint | undefined;
  let lastInputAt = Number.NEGATIVE_INFINITY;
  const drawer = steadDrawer();

  const members = (): readonly Member[] => herd().members;
  const meetsItsCreature = (): boolean =>
    profile.id === "stead" && props.shell.steadHome !== undefined;
  const visibleResidents = createMemo(() =>
    [...sceneSlugs()].sort().flatMap((slug) => {
      const resident = Object.hasOwn(world().creatures, slug) ? world().creatures[slug] : undefined;
      return resident === undefined ? [] : [resident];
    }),
  );
  const cursor = createCursor(() => visibleResidents().length);
  const keys = createMemo(() => steadKeys(props.shell.keys));
  const current = () => visibleResidents()[cursor.index()];
  const porch = createMemo(() =>
    porchOf(world(), herd(), courts.overview() ? overviewTime() : Date.now()),
  );
  const placedFigures = (): readonly PlacedFigure[] =>
    (frame()?.figures ?? []).map((figure) => figure.placed);
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
    if (courts.overview())
      return waitingCount(props.shell) > 0 ? "Open the request to review it." : undefined;
    if (porch()?.kind === "chore") return acceptHint(keys().approve);
    if (porch()?.kind === "decided") {
      return overturnHint(overturnKey(), props.shell.keys.chord("stead.open"));
    }
    if (heldAsk() === undefined || wordingHere()) return undefined;
    return sayingWhy() ? whyLine : answerHint(keys(), props.shell.keys.chord("stead.open"));
  };

  const baseContext = (tier: PowerTier): Omit<StepContext, "pointer" | "gestures"> => ({
    visible: !documentHidden() && !courts.overview(),
    focused: props.focused,
    fullscreen: false,
    doNotDisturb: false,
    tier,
    reducedMotion: reducedMotionActive(),
    quietHours: false,
  });
  const pointerFor = (member: Member): Pointer | undefined => {
    const point = pointer();
    const painted = frame();
    if (point === undefined || painted === undefined) return undefined;
    const figure = painted.figures.find((each) => each.member.slug === member.slug);
    return figure === undefined
      ? undefined
      : pointerOffset(painted.scene, figure.placed, point.x, point.y);
  };
  const takeGestures = (slug: string): Gesture[] => {
    const taken = queuedGestures.get(slug) ?? [];
    queuedGestures.delete(slug);
    return taken;
  };

  const draw = (now: number, tier: PowerTier): FieldPicture => {
    const context = baseContext(tier);
    const drawing = drawer.draw({
      world: world(),
      herd: herd(),
      mountedAt,
      now,
      context,
      memberContext: (member) => ({
        ...context,
        pointer: pointerFor(member),
        gestures: takeGestures(member.slug),
      }),
      stageWidth: stage?.clientWidth ?? 0,
      canvas,
      sceneOptions: {
        courtSlugs: sceneSlugs(),
        workshops: families(),
        gardens: preference().gardens,
      },
    });
    setHerd(drawing.herd);
    setFrame({
      scene: drawing.scene,
      fit: drawing.fit,
      figures: drawing.figures,
      at: now,
      tier: context.tier,
      still: drawing.motionless,
      wakes: loop.wakes(),
      frames: loop.frames(),
    });
    return drawing.picture;
  };
  const windowFocused = windowFocus();
  const loop = steadField(
    browserFieldHost(),
    {
      hidden: () => documentHidden() || courts.overview(),
      resting: () => !props.focused || !windowFocused(),
      lastInputAt: () => lastInputAt,
    },
    draw,
  );
  const requestDraw = loop.request;

  const visitCourt = (slug: string): void => {
    const index = districts().findIndex((district) => district.slugs.includes(slug));
    if (index >= 0) setDistrict(index);
    courts.open(slug);
    setPointer(undefined);
    setHovered(undefined);
    requestDraw();
    queueMicrotask(() => {
      const index = visibleResidents().findIndex((resident) => resident.slug === slug);
      if (index >= 0) cursor.set(index);
      const painted = frame();
      const workshop = painted?.scene.hotspots.find(
        (spot) => spot.target.kind === "workshop" && spot.target.creature === slug,
      );
      if (stage !== undefined && painted !== undefined && workshop !== undefined) {
        stage.scrollLeft =
          courtScroll.get(slug) ??
          Math.max(
            0,
            (workshop.x + workshop.width / 2) * painted.fit.cssPerArt - stage.clientWidth / 2,
          );
      }
      courtHeading?.focus({ preventScroll: true });
    });
  };
  const foldCourt = (): void => {
    const slug = courts.selected();
    if (slug !== undefined && stage !== undefined) courtScroll.set(slug, stage.scrollLeft);
    courts.fold();
    setPointer(undefined);
    setHovered(undefined);
    queueMicrotask(() => {
      const cards = [...(root?.querySelectorAll<HTMLButtonElement>("[data-courtyard]") ?? [])];
      (cards.find((each) => each.dataset.courtyard === slug) ?? cards[0] ?? root)?.focus({
        preventScroll: true,
      });
    });
  };
  const visitDistrict = (index: number): void => {
    if (!Number.isInteger(index) || index < 0 || index >= districts().length) return;
    if (courts.selected() !== undefined) foldCourt();
    setDistrict(index);
    setPointer(undefined);
    setHovered(undefined);
    cursor.set(0);
    if (stage !== undefined) stage.scrollLeft = 0;
  };

  const artPoint = (event: MouseEvent): ArtPoint | undefined => {
    const painted = frame();
    if (field === undefined || painted === undefined) return undefined;
    const rect = field.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / painted.fit.cssPerArt,
      y: (event.clientY - rect.top) / painted.fit.cssPerArt,
    };
  };
  const openThread = (member: Member): void => {
    const thread = threadFor(world(), member);
    if (thread === undefined) {
      setNotice(noThreadYet(member.name));
      return;
    }
    setNotice(undefined);
    props.shell.sessions.openSession(thread);
  };
  const openCreature = (slug: string): void => {
    const resident = world().creatures[slug];
    if (resident === undefined) return;
    const member = members().find((each) => each.slug === slug);
    const index = visibleResidents().findIndex((resident) => resident.slug === slug);
    if (index >= 0) cursor.set(index);
    if (member !== undefined) {
      openThread(member);
      return;
    }
    const carried = creatureReading(world(), slug, Date.now()).carrier?.thread;
    const thread = threadForCreature(world(), slug, carried);
    if (thread === undefined) {
      setNotice(noThreadYet(resident.name));
      return;
    }
    setNotice(undefined);
    props.shell.sessions.openSession(thread);
  };
  const openTarget = (target: SceneTarget): void => {
    switch (target.kind) {
      case "porch":
        props.shell.openPane({ kind: "needs-you" });
        break;
      case "storehouse":
        props.shell.openPane({ kind: "tree" });
        break;
      case "workshop":
        openCreature(target.creature);
        break;
      case "parcel":
        setNotice(noPaneYet("parcels"));
        break;
      case "mill":
        setNotice(noPaneYet("mills"));
        break;
    }
  };
  const onPointerMove = (event: PointerEvent): void => {
    const point = artPoint(event);
    if (point === undefined) return;
    const wasInteracting = loop.tier() === "interact";
    lastInputAt = Date.now();
    setPointer(point);
    const figure = figureAt(placedFigures(), point.x, point.y);
    if (figure?.slug !== hovered()) {
      if (figure !== undefined) {
        queuedGestures.set(figure.slug, [
          ...(queuedGestures.get(figure.slug) ?? []),
          { kind: "hover" },
        ]);
      }
      setHovered(figure?.slug);
    }
    if (!wasInteracting) requestDraw();
  };
  const onPointerLeave = (): void => {
    setPointer(undefined);
    setHovered(undefined);
    requestDraw();
  };
  const onPointerDown = (event: PointerEvent): void => {
    if (insideBubble(event.target)) return;
    downAt = artPoint(event);
  };
  const onClick = (event: MouseEvent): void => {
    if (insideBubble(event.target)) return;
    if (event.detail === 0) {
      const slug = slugOf(event.target);
      if (slug !== undefined) openCreature(slug);
      return;
    }
    const point = artPoint(event);
    if (point === undefined) return;
    const pressed = downAt;
    downAt = undefined;
    if (
      pressed !== undefined &&
      Math.hypot(point.x - pressed.x, point.y - pressed.y) > dragThresholdArt
    ) {
      return;
    }
    const figure = figureAt(placedFigures(), point.x, point.y);
    if (figure !== undefined) {
      openCreature(figure.slug);
      return;
    }
    const painted = frame();
    const spot = painted === undefined ? undefined : hotspotAt(painted.scene, point.x, point.y);
    if (spot !== undefined) openTarget(spot.target);
  };
  const onFieldKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && courts.selected() !== undefined && pointer() === undefined) {
      event.preventDefault();
      foldCourt();
      return;
    }
    if (event.key !== "Escape" || pointer() === undefined) return;
    event.preventDefault();
    onPointerLeave();
  };

  const openPorch = (standing: Porch): void => {
    if (standing.kind === "chore") props.shell.openPane({ kind: "chores" });
    else if (standing.kind === "decided") props.shell.sessions.openSession(standing.threadId);
    else openThread(standing.member);
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
    () => (props.focused && !courts.overview() && !wordingHere() ? heldAsk()?.callId : undefined),
    giveReason,
  );

  props.onAction((action) => {
    if (onboarding.take(action)) return;
    const pick = answerPicks[action];
    if (courts.overview() && (pick !== undefined || action === "stead.overturn")) {
      props.shell.openPane({ kind: "needs-you" });
      return;
    }
    if (pick !== undefined) return answer(pick);
    switch (action) {
      case "stead.overturn":
        return overturn();
      case "stead.down":
        setNotice(undefined);
        return cursor.move(1);
      case "stead.up":
        setNotice(undefined);
        return cursor.move(-1);
      case "stead.open": {
        const resident = current();
        if (resident !== undefined) openCreature(resident.slug);
        return;
      }
    }
  });

  createEffect(
    on(
      [world, courts.overview, overviewTime, sceneSlugs, families, () => preference().gardens],
      ([currentWorld, overview]) => {
        if (overview) {
          const at = Date.now();
          setHerd((previous) =>
            stepHerd(
              gatherHerd(previous, currentWorld, at, undefined, sceneSlugs()),
              currentWorld,
              at,
              () => ({
                ...baseContext("hidden"),
                pointer: undefined,
                gestures: [],
              }),
            ),
          );
        }
        requestDraw();
      },
      { defer: true },
    ),
  );
  createEffect(
    on(courts.overview, (visible) => {
      if (!visible) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const tick = (): void => {
        clearTimeout(timer);
        if (documentHidden()) return;
        const at = Date.now();
        setOverviewTime(at);
        timer = setTimeout(tick, 60_000 - (at % 60_000));
      };
      const stop = listen(document, "visibilitychange", tick);
      tick();
      onCleanup(() => {
        clearTimeout(timer);
        stop();
      });
    }),
  );
  createEffect(on(() => props.focused, requestDraw, { defer: true }));
  createEffect(on(windowFocused, requestDraw, { defer: true }));
  const porchCall = createMemo(() => heldAsk()?.callId);
  createEffect(
    on(porchCall, (callId) => {
      const standing = porch();
      if (callId !== undefined && standing?.kind === "thread") {
        void props.shell.store.open(standing.thread.id);
      }
    }),
  );
  createEffect(() => {
    for (const refused of herd().refused) {
      console.warn(skinRefusedLine(refused.slug, refused.id, refused.faults.join("; ")));
    }
  });
  onMount(() => {
    loop.redraw();
    const stops = [
      watchTheme(requestDraw),
      watchMedia(forcedColorsQuery, requestDraw),
      watchMedia(reducedMotionQuery, requestDraw),
      stage === undefined ? () => undefined : watchSize(stage, requestDraw),
      listen(document, "visibilitychange", requestDraw),
    ];
    onCleanup(() => {
      for (const stop of stops) stop();
    });
  });
  onCleanup(loop.stop);

  const now = (): number => (courts.overview() ? overviewTime() : (frame()?.at ?? Date.now()));
  const needYou = (): number => waitingCount(props.shell);
  const board = createMemo(() => choreBoard(world(), now(), offsetMinutes));
  const residents = () => Object.values(world().creatures);
  const semanticMinute = createMemo(() => Math.floor(now() / 60_000));
  const residentStates = createMemo(
    () =>
      new Map(
        residents().map((resident) => [
          resident.slug,
          creatureSnapshot(
            world(),
            {
              slug: resident.slug,
              name: resident.name,
              hueStop: undefined,
            },
            semanticMinute() * 60_000,
          ).state,
        ]),
      ),
  );
  const working = (): number =>
    [...residentStates().values()].filter((state) => state === "working").length;
  const districtSummaries = createMemo(() =>
    districts().map((district) => ({
      ...district,
      occupied: district.slugs.filter((slug) => world().creatures[slug] !== undefined).length,
      waiting: district.slugs.filter((slug) => residentStates().get(slug) === "porch").length,
    })),
  );
  const condensedInfrastructure = createMemo(() => {
    const shared = frame()?.scene.infrastructure;
    if (
      courts.overview() ||
      shared === undefined ||
      (shared.storehouseWings <= shared.shownStorehouseWings &&
        shared.totalMills <= shared.shownMills &&
        shared.totalParcels <= shared.shownParcels)
    )
      return undefined;
    return `Across the stead: ${shared.storehouseWings} storehouse wings · ${shared.totalMills} mills (${shared.busyMills} running) · ${shared.totalParcels} outlying plots. Shared buildings are shown in miniature here.`;
  });
  const head = (): string =>
    headLine({
      creatures: residents().length,
      needYou: needYou(),
      working: working(),
      phase: skyAt(now(), offsetMinutes).phase,
      clock: clockWord(now(), offsetMinutes),
      floating: members().find((member) => member.slug === props.shell.companion?.floating())?.name,
    });
  const bubbleRun = (): ToolRun | undefined => {
    const held = heldAsk();
    return held === undefined
      ? undefined
      : askingRun(props.shell.store.projection(held.sessionId), held.callId);
  };

  return (
    <section
      class="kw-ov kw-stead"
      aria-label="stead"
      tabIndex={-1}
      ref={root}
      data-hit={hovered() === undefined ? undefined : ""}
    >
      <div class="kw-ov-head">
        <span class="kw-ov-head-lead">{head()}</span>
      </div>
      <CompanionSwitchRow
        switch={props.shell.companion?.toggle()}
        creatures={members().length}
        chord={props.shell.keys.chord("companion.toggle")}
      />
      <fieldset
        class="kw-stead-views"
        aria-label={`${steadName} view`}
        data-native-activation
        onKeyDown={(event) => {
          if (event.key === "Escape" && courts.selected() !== undefined) {
            event.preventDefault();
            foldCourt();
          }
        }}
      >
        <button
          type="button"
          aria-pressed={!courts.configured()}
          onClick={() => courts.choose("scene")}
        >
          Continuous {steadName}
        </button>
        <button
          type="button"
          aria-pressed={courts.configured()}
          onClick={() => courts.choose("courtyards")}
        >
          Courtyards
        </button>
        <Show when={courts.selected() !== undefined}>
          <span ref={courtHeading} tabIndex={-1} data-court-detail>
            {world().creatures[courts.selected() ?? ""]?.name}'s courtyard
          </span>
          <button type="button" onClick={foldCourt}>
            Fold back to courtyards
          </button>
        </Show>
        <Show when={needYou() > 0}>
          <button type="button" onClick={() => props.shell.openPane({ kind: "needs-you" })}>
            {needYou()} needs you
          </button>
        </Show>
      </fieldset>
      <SettlementControls
        districts={districtSummaries()}
        district={districtIndex()}
        onDistrict={visitDistrict}
        selected={courts.selected()}
        family={savedChoice(preference().workshopStyles, courts.selected() ?? "")}
        automaticFamily={workshopFamilyOf(
          (neighborhood()?.start ?? 0) + Math.max(0, sceneSlugs().indexOf(courts.selected() ?? "")),
        )}
        garden={savedChoice(preference().gardens, courts.selected() ?? "")}
        onFamily={chooseFamily}
        onGarden={chooseGarden}
        overview={courts.overview()}
        compact={preference().alignment === "compact"}
        onArrange={() =>
          changeAppearance({
            alignment: preference().alignment === "compact" ? "roomy" : "compact",
          })
        }
        canUndo={appearanceUndo() !== undefined}
        onUndo={() => {
          const previous = appearanceUndo();
          if (previous !== undefined) {
            remember(previous);
            setAppearanceUndo(undefined);
          }
        }}
      />
      <Show when={courts.error()}>{(line) => <p role="status">{line()}</p>}</Show>
      <Show when={condensedInfrastructure()}>
        {(line) => <p class="kw-stead-board">{line()}</p>}
      </Show>
      <Show when={herd().refused.length > 0}>
        <p class="kw-stead-board" role="status">
          Artwork unavailable for{" "}
          {herd()
            .refused.map((refused) => world().creatures[refused.slug]?.name ?? refused.slug)
            .join(", ")}
          .
        </p>
      </Show>
      <Show when={courts.overview()}>
        <CourtyardOverview
          world={world()}
          order={courts.order()}
          range={neighborhood()}
          families={families()}
          gardens={preference().gardens}
          alignment={preference().alignment}
          now={overviewTime()}
          onOpen={visitCourt}
        />
      </Show>
      <div
        class="kw-stead-stage"
        hidden={courts.overview()}
        ref={stage}
        style={{ height: frame() === undefined ? undefined : `${frame()?.fit.cssHeight}px` }}
      >
        <div
          class="kw-stead-field"
          ref={field}
          role="application"
          data-tier={frame()?.tier}
          data-district={districtIndex()}
          data-wakes={frame()?.wakes}
          data-frames={frame()?.frames}
          style={{
            width: frame() === undefined ? undefined : `${frame()?.fit.cssWidth}px`,
            height: frame() === undefined ? undefined : `${frame()?.fit.cssHeight}px`,
          }}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          onPointerDown={onPointerDown}
          onClick={onClick}
          onKeyDown={onFieldKeyDown}
        >
          <canvas class="kw-stead-canvas" ref={canvas} />
          <Index each={frame()?.figures ?? []}>
            {(figure) => (
              <Figure
                figure={figure()}
                fit={frame()?.fit}
                hit={hovered() === figure().member.slug}
                cursor={props.focused && current()?.slug === figure().member.slug}
              />
            )}
          </Index>
          <Show when={porchFigure(porch(), frame())}>
            {(standing) => (
              <Bubble
                placement="porch"
                bubble={porchBubble(standing().porch)}
                style={bubbleStyle(standing())}
                run={bubbleRun()}
                keys={keys()}
                overturnChord={overturnKey()}
                wording={wordingHere()}
                onOpen={() => openPorch(standing().porch)}
                onAnswer={(pick) => answer(pick)}
                onAccept={acceptGrants}
                onOverturn={overturn}
                onReason={(reason) => giveReason(reason, reason === "other")}
                onWords={sendWords}
              />
            )}
          </Show>
        </div>
      </div>
      <OnboardingOnTheStead
        shell={props.shell}
        controller={onboarding}
        automatic={profile.startup === "creature"}
        simple={meetsItsCreature()}
      />
      <Show
        when={residents().length > 0}
        fallback={
          <Show when={!meetsItsCreature() && onboarding.active() === undefined}>
            <EmptyState line={steadPane.emptyState(props.shell.keys)} />
          </Show>
        }
      >
        <p
          class="kw-stead-board"
          role="note"
          aria-label="chore board"
          data-next-at={board().nextAt}
        >
          {board().line}
        </p>
        <ol class="kw-stead-rows">
          <Index each={members()}>
            {(member) => (
              <CreatureRow
                member={member()}
                world={world()}
                now={now()}
                offsetMinutes={offsetMinutes}
                cursor={props.focused && current()?.slug === member().slug}
                onPick={() => openCreature(member().slug)}
              />
            )}
          </Index>
        </ol>
      </Show>
      <Show when={props.shell.steadHome} keyed>
        {(scope) => (
          <Show when={current()?.slug} keyed>
            {(slug) => (
              <CreatureProjectControls
                creature={{
                  slug,
                  get name() {
                    return current()?.name ?? slug;
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

interface StandingFigure {
  readonly porch: Porch;
  readonly figure: PlacedMember;
  readonly fit: CanvasFit;
}

function porchFigure(
  porch: Porch | undefined,
  frame: PaintedFrame | undefined,
): StandingFigure | undefined {
  if (porch === undefined || frame === undefined) return undefined;
  const figure = frame.figures.find((each) => each.member.slug === porch.member.slug);
  return figure === undefined ? undefined : { porch, figure, fit: frame.fit };
}

interface FigureProps {
  figure: PlacedMember;
  fit: CanvasFit | undefined;
  hit: boolean;
  cursor: boolean;
}

function Figure(props: FigureProps) {
  const css = (art: number): string => `${art * (props.fit?.cssPerArt ?? 1)}px`;
  const reading = () => props.figure.member.creature.reading;
  const live = () => reading().lamps + reading().lanterns;
  const label = () =>
    `${props.figure.member.name}, ${stateLabels[reading().state]}, ${live()} active ${live() === 1 ? "thread" : "threads"}`;
  const cell = () => props.figure.member.skin.cell;
  return (
    <>
      <button
        type="button"
        class="kw-stead-creature"
        data-slug={props.figure.member.slug}
        data-state={reading().state}
        data-clip={props.figure.placed.pose.clip}
        data-hit={props.hit ? "" : undefined}
        data-cursor={props.cursor ? "" : undefined}
        aria-label={label()}
        style={{
          left: css(props.figure.placed.left),
          top: css(props.figure.placed.top),
          width: css(cell().width),
          height: css(cell().height),
        }}
      />
      <Show when={live() > 0 || reading().crates > 0}>
        <span
          class="kw-stead-badge"
          data-tone={live() === 0 ? "back" : "live"}
          aria-hidden="true"
          style={{
            left: css(props.figure.placed.left + cell().width - 10),
            top: css(props.figure.placed.top + 12),
          }}
        >
          {live() > 0 ? live() : "✓"}
        </span>
      </Show>
    </>
  );
}

function porchBubble(porch: Porch): NeedsYouBubble {
  if (porch.kind !== "thread") return porch.bubble;
  return {
    title: titleOf(porch.thread),
    line: bubbleLine(porch.thread),
    callId: porch.callId,
    answers: [],
  };
}

function bubbleStyle(standing: StandingFigure): Record<"left" | "bottom" | "width", string> {
  const { figure, fit } = standing;
  const center = (figure.placed.left + figure.member.skin.cell.width / 2) * fit.cssPerArt;
  const left = Math.max(0, Math.min(fit.cssWidth - bubbleWidthPx, center - bubbleWidthPx / 2));
  const bottom = (fit.artHeight - figure.placed.top + 2) * fit.cssPerArt;
  return { left: `${left}px`, bottom: `${bottom}px`, width: `${bubbleWidthPx}px` };
}

interface CreatureRowProps {
  member: Member;
  world: HabitatState;
  now: number;
  offsetMinutes: number;
  cursor: boolean;
  onPick(): void;
}

function CreatureRow(props: CreatureRowProps) {
  const reading = () => props.member.creature.reading;
  const thread = (): Thread | undefined => {
    const id = reading().carrier?.thread;
    return id === undefined ? undefined : props.world.threads[id];
  };
  const telling = (): string =>
    whatAreYouDoing({
      reading: reading(),
      thread: thread(),
      chores: props.world.creatures[props.member.slug]?.chores ?? [],
      parcelFogged: foggedParcelOf(props.world, props.member.slug),
      now: props.now,
      offsetMinutes: props.offsetMinutes,
      asOf: props.world.asOf,
      lastEvent: undefined,
    });
  return (
    <li
      class="kw-stead-row"
      data-state={reading().state}
      data-cursor={props.cursor ? "" : undefined}
      style={{ "--kw-arc-hue": `var(--kw-ramp-${props.member.hueStop})` }}
    >
      <button type="button" class="kw-stead-row-head" onClick={() => props.onPick()}>
        <span class="kw-ov-chip" aria-hidden="true" />
        <span class="kw-stead-name">{props.member.name}</span>
        <span class="kw-stead-state">{stateLabels[reading().state]}</span>
        <span class="kw-stead-telling">{telling()}</span>
      </button>
    </li>
  );
}

function foggedParcelOf(world: HabitatState, slug: string): string | undefined {
  const parcel = world.creatures[slug]?.workshop.parcel;
  if (parcel === undefined) return undefined;
  const known = world.parcels[parcel];
  return known !== undefined && !known.online ? known.name : undefined;
}

async function acceptHeldChore(shell: ShellSeams, accept: ChoreAccept): Promise<string> {
  const chores = choresOverFetch(hostFetch(shell.host, shell.workspace));
  const answer = await chores.accept(accept.creature, accept.routineId, accept.digest);
  return answer.ok ? choreAcceptedLine(accept.routineId) : answer.error;
}

function titleOf(thread: Thread): string {
  return thread.title === "" ? thread.id : thread.title;
}

function insideBubble(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(".kw-stead-bubble") !== null;
}

function slugOf(target: EventTarget | null): string | undefined {
  if (!(target instanceof Element)) return undefined;
  return target.closest<HTMLElement>("[data-slug]")?.dataset.slug;
}

function documentHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

function listen(target: Document, type: string, react: () => void): () => void {
  target.addEventListener(type, react);
  return () => target.removeEventListener(type, react);
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
