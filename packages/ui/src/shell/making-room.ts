import type { MotionPrefs } from "@keywork-app/habitat";
import { type Accessor, createEffect, createSignal, on, onCleanup } from "solid-js";
import { z } from "zod";
import { travelBetween } from "../surfaces/feel/arrange.ts";
import { glideMs, motionStyle } from "../surfaces/feel/choreography.ts";
import { hubOutline, standsAsTheHub, standsNear } from "../surfaces/outside/hub.ts";
import type { RoomAsked } from "../surfaces/outside/panes-outside.tsx";
import type {
  ConsoleMoved,
  ConsoleStand,
  Desk,
  ScreenRect,
  SurfacesPort,
} from "../surfaces/port.ts";

export interface RoomMakerSeams {
  readonly port: SurfacesPort | undefined;
  readonly storage: Pick<Storage, "getItem" | "setItem"> | undefined;
  readonly storageKey: string;
  motion(): MotionPrefs;
  panesOutside(): number;
  say(line: string): void;
}

export interface RoomMaker {
  readonly standsAsHub: Accessor<boolean>;
  readonly thread: Accessor<string | undefined>;
  makeRoom(asked: RoomAsked): Promise<Desk>;
  toggle(): void;
  restored(): Promise<void>;
}

export const roomNotices = {
  makesRoom: "the console makes room for panes outside the window",
  staysPut: "the console stays as it is when panes go outside the window",
  arrangesItself: (insideChord: string | undefined) =>
    insideChord === undefined
      ? "the console is making room for the panes outside the window"
      : `the console is making room for the panes outside the window · ${insideChord} brings them inside`,
} as const;

export function createRoomMaker(seams: RoomMakerSeams): RoomMaker {
  const { port } = seams;
  const [held, setHeld] = createSignal(rememberedBy(seams));
  let watchingTheKeeper = false;
  let restoring = true;
  let lastStep: Promise<unknown> = Promise.resolve();

  const keep = (next: Standing): void => {
    setHeld(next);
    seams.storage?.setItem(seams.storageKey, JSON.stringify(next));
  };

  const inTurn = <Outcome>(step: () => Promise<Outcome>): Promise<Outcome> => {
    const taken = lastStep.then(step);
    lastStep = taken.catch(() => undefined);
    return taken;
  };

  const moved = async (to: ConsoleStand, from: ScreenRect): Promise<ConsoleMoved | undefined> => {
    if (port?.moveConsole === undefined) return undefined;
    const glides = motionStyle(seams.motion()) === "glide";
    const durationMs = glides ? glideMs(travelBetween(from, to.bounds)) : 0;
    watchingTheKeeper = false;
    try {
      return await port.moveConsole({ ...to, durationMs });
    } catch {
      return undefined;
    } finally {
      watchingTheKeeper = true;
    }
  };

  const becomeTheHub = async (company: string | undefined, desk: Desk): Promise<Desk> => {
    const outline = hubOutline(desk);
    const standing: ConsoleStand = { bounds: desk.console, maximized: desk.consoleMaximized };
    const spell: Spell = { home: standing, stood: outline, thread: company, keepers: false };
    keep({ ...held(), spell });
    const move = await moved({ bounds: outline, maximized: false }, desk.console);
    if (move === undefined) {
      keep({ on: held().on });
      return desk;
    }
    keep({ ...held(), spell: { ...spell, home: move.from, stood: move.to.bounds } });
    void returnWhenNoneIsOutside();
    return { ...desk, console: move.to.bounds, consoleMaximized: move.to.maximized };
  };

  const roomFor = async (asked: RoomAsked): Promise<Desk> => {
    const desk = (await port?.desk().catch(() => undefined)) ?? asked.desk;
    const { on: makesRoom, spell } = held();
    if (spell !== undefined && asked.company !== undefined) {
      keep({ ...held(), spell: { ...spell, thread: asked.company } });
    }
    const staysAsItIs = spell !== undefined || !makesRoom || port?.moveConsole === undefined;
    return staysAsItIs || standsAsTheHub(desk) ? desk : becomeTheHub(asked.company, desk);
  };

  const goHome = async (): Promise<void> => {
    const { spell } = held();
    if (spell === undefined) return;
    if (!spell.keepers) await moved(spell.home, spell.stood);
    keep({ on: held().on });
  };

  const returnWhenNoneIsOutside = (): Promise<void> =>
    inTurn(async () => {
      if (seams.panesOutside() === 0) await goHome();
    });

  const standAgainAsTheHub = async (spell: Spell): Promise<void> => {
    const desk = await port?.desk().catch(() => undefined);
    if (desk === undefined || standsNear(desk.console, spell.stood)) return;
    const move = await moved({ bounds: hubOutline(desk), maximized: false }, desk.console);
    if (move !== undefined) keep({ ...held(), spell: { ...spell, stood: move.to.bounds } });
  };

  const settleIn = async (): Promise<void> => {
    const { spell } = held();
    const nothingToHub = port === undefined || seams.panesOutside() === 0;
    if (spell !== undefined && nothingToHub) await goHome();
    else if (spell !== undefined && !spell.keepers) await standAgainAsTheHub(spell);
    watchingTheKeeper = true;
    restoring = false;
  };

  const theKeeperMovedIt = (desk: Desk): void => {
    const { spell } = held();
    if (!watchingTheKeeper || spell === undefined || spell.keepers) return;
    if (!desk.consoleMaximized && standsNear(desk.console, spell.stood)) return;
    keep({ ...held(), spell: { ...spell, keepers: true } });
  };

  const stopWatching = port?.onDeskChanged(theKeeperMovedIt);
  onCleanup(() => stopWatching?.());

  createEffect(
    on(
      () => seams.panesOutside() === 0,
      (noneOutside) => {
        if (noneOutside && !restoring) void returnWhenNoneIsOutside();
      },
      { defer: true },
    ),
  );

  return {
    standsAsHub: () => held().spell !== undefined,
    thread: () => held().spell?.thread,
    makeRoom: (asked) => inTurn(() => roomFor(asked)),
    toggle: () => {
      const makesRoom = !held().on;
      keep({ ...held(), on: makesRoom });
      seams.say(makesRoom ? roomNotices.makesRoom : roomNotices.staysPut);
      if (!makesRoom) void inTurn(goHome);
    },
    restored: () => inTurn(settleIn),
  };
}

const screenRect = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

const standingSchema = z
  .object({
    on: z.boolean(),
    spell: z
      .object({
        home: z.object({ bounds: screenRect, maximized: z.boolean() }),
        stood: screenRect,
        thread: z.string().optional(),
        keepers: z.boolean(),
      })
      .optional(),
  })
  .describe(
    "Whether the console makes room for panes outside the window and, while it stands as their hub, where it stood before, where it stands now, whose conversation it shows and whether the keeper has moved it since; exists so a restart finds the console still the hub and can return it where it was.",
  );

type Standing = z.infer<typeof standingSchema>;

type Spell = NonNullable<Standing["spell"]>;

const makingRoom: Standing = { on: true };

function rememberedBy(seams: RoomMakerSeams): Standing {
  try {
    const kept = JSON.parse(seams.storage?.getItem(seams.storageKey) ?? "null");
    const parsed = standingSchema.safeParse(kept);
    return parsed.success ? parsed.data : makingRoom;
  } catch {
    return makingRoom;
  }
}
