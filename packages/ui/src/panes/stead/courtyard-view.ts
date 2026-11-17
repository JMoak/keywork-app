import {
  CourtyardCapacityError,
  type HabitatState,
  reconcileCourtyardOrder,
} from "@keywork-app/habitat";
import { type Accessor, createEffect, createMemo, createSignal, on } from "solid-js";

export interface CourtyardPreference {
  readonly view?: "scene" | "courtyards" | undefined;
  readonly courtOrder?: readonly string[] | undefined;
}

export function createCourtyardView(options: {
  readonly world: Accessor<HabitatState>;
  readonly preference: Accessor<CourtyardPreference>;
  readonly save: (preference: CourtyardPreference) => void;
  readonly rememberScene?: boolean;
}) {
  const [mode, setMode] = createSignal(options.preference().view ?? "scene");
  const [order, setOrder] = createSignal<readonly string[]>(options.preference().courtOrder ?? []);
  const [selected, select] = createSignal<string>();
  const layout = createMemo(() => {
    try {
      return { order: reconcileCourtyardOrder(options.world(), order()), error: undefined };
    } catch (error) {
      if (!(error instanceof CourtyardCapacityError)) throw error;
      return {
        order: order(),
        error:
          "Saved courtyard addresses are full. Your creatures are all available on the stead in additional neighborhoods.",
      };
    }
  });
  const error = () => layout().error;
  const configured = () => mode() === "courtyards";
  const overview = () => configured() && selected() === undefined && error() === undefined;
  const preference = (): CourtyardPreference => ({ view: mode(), courtOrder: order() });

  createEffect(
    on(
      options.preference,
      (next) => {
        setMode(next.view ?? "scene");
        setOrder(next.courtOrder ?? []);
        if (next.view !== "courtyards") select(undefined);
      },
      { defer: true },
    ),
  );

  createEffect(
    on([options.world, mode, layout], ([world, view, current]) => {
      const prior = order();
      if (view !== "courtyards" && prior.length === 0 && options.rememberScene !== true) return;
      if (current.error === undefined && current.order !== prior) {
        setOrder(current.order);
        options.save({ view, courtOrder: current.order });
      }
      if (selected() !== undefined && world.creatures[selected() ?? ""] === undefined)
        select(undefined);
    }),
  );

  return {
    configured,
    overview,
    order,
    selected,
    error,
    choose(view: "scene" | "courtyards") {
      select(undefined);
      setMode(view);
      options.save(preference());
    },
    open(slug: string) {
      if (options.world().creatures[slug] !== undefined) select(slug);
    },
    fold: () => select(undefined),
  };
}
