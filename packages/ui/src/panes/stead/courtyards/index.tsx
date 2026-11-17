import {
  type Courtyard,
  type CourtyardRange,
  courtyardsInRange,
  courtyardsOf,
  type HabitatState,
  type WorkshopFamily,
  workshopFamilyOf,
} from "@keywork-app/habitat";
import type { GardenKind } from "@keywork-app/habitat/render";
import { createMemo, createSignal, Index, onCleanup, onMount, Show } from "solid-js";
import { stateLabels } from "../copy.ts";
import { defaultSkinId } from "../habitat-render.ts";
import { coatOf } from "../herd.ts";
import { devicePixelRatioOf, forcedColorsQuery, watchMedia, watchTheme } from "../painter.ts";
import { savedChoice } from "../settlement-preferences.ts";
import { CourtyardPortrait } from "./portrait.tsx";
import { CourtyardWorkshop } from "./workshop.tsx";
import "./courtyards.css";

export interface CourtyardOverviewProps {
  readonly world: HabitatState;
  readonly order: readonly string[];
  readonly now: number;
  readonly selected?: string | undefined;
  readonly range?: CourtyardRange | undefined;
  readonly families?: Readonly<Record<string, WorkshopFamily>> | undefined;
  readonly gardens?: Readonly<Record<string, GardenKind>> | undefined;
  readonly alignment?: "roomy" | "compact" | undefined;
  readonly onOpen: (slug: string) => void;
}

export function CourtyardOverview(props: CourtyardOverviewProps) {
  const courts = createMemo(() =>
    props.range === undefined
      ? courtyardsOf(props.world, props.order, props.now)
      : courtyardsInRange(props.world, props.order, props.now, props.range),
  );
  const ranks = createMemo(
    () =>
      new Map(
        Object.keys(props.world.creatures)
          .sort()
          .map((slug, rank) => [slug, rank]),
      ),
  );
  const [appearance, setAppearance] = createSignal(0);

  onMount(() => {
    const repaint = (): void => void setAppearance((version) => version + 1);
    const stops = [
      watchTheme(repaint),
      watchMedia(forcedColorsQuery, repaint),
      watchPixelRatio(repaint),
    ];
    onCleanup(() => {
      for (const stop of stops) stop();
    });
  });

  return (
    <section
      class="kw-courtyards"
      aria-label="Courtyard overview"
      data-alignment={props.alignment ?? "roomy"}
      data-native-activation
    >
      <p class="kw-courtyards-intro">A place for each creature. Open a courtyard to step inside.</p>
      <Show when={courts().length > 0} fallback={<p>No courtyards yet.</p>}>
        <ol
          class="kw-courtyard-grid"
          aria-label="Creature courtyards"
          start={(props.range?.start ?? 0) + 1}
        >
          <Index each={courts()}>
            {(court) => (
              <li class="kw-courtyard-cell" data-address={court().address}>
                <Show
                  when={occupied(court())}
                  fallback={
                    <div class="kw-courtyard-vacant">
                      <span class="kw-courtyard-address">{court().address}</span>
                      <span>Reserved place</span>
                    </div>
                  }
                >
                  {(resident) => (
                    <button
                      type="button"
                      class="kw-courtyard"
                      data-courtyard={resident().slug}
                      data-state={resident().reading.state}
                      aria-current={props.selected === resident().slug ? "location" : undefined}
                      aria-label={`Open ${resident().creature.name}'s courtyard · ${stateLabels[resident().reading.state]} · ${resident().address}`}
                      onClick={() => props.onOpen(resident().slug)}
                    >
                      <span class="kw-courtyard-address">{resident().address}</span>
                      <span class="kw-courtyard-art" aria-hidden="true">
                        <CourtyardPortrait
                          skin={resident().creature.skin ?? defaultSkinId}
                          hueStop={coatOf(resident().creature, ranks().get(resident().slug) ?? 0)}
                          appearance={appearance()}
                        />
                        <CourtyardWorkshop
                          court={resident()}
                          family={workshopFamilyOf(
                            resident().index,
                            savedChoice(props.families, resident().slug),
                          )}
                          garden={savedChoice(props.gardens, resident().slug)}
                          appearance={appearance()}
                        />
                      </span>
                      <span class="kw-courtyard-name">{resident().creature.name}</span>
                      <span class="kw-courtyard-state">
                        {stateLabels[resident().reading.state]}
                      </span>
                    </button>
                  )}
                </Show>
              </li>
            )}
          </Index>
        </ol>
      </Show>
    </section>
  );
}

function watchPixelRatio(repaint: () => void): () => void {
  let stop = (): void => undefined;
  const changed = (): void => {
    stop();
    stop = watchMedia(`(resolution: ${devicePixelRatioOf()}dppx)`, changed);
    repaint();
  };
  changed();
  window.addEventListener("resize", changed);
  return () => {
    stop();
    window.removeEventListener("resize", changed);
  };
}

function occupied(court: ReturnType<typeof courtyardsOf>[number]): Courtyard | undefined {
  return court.kind === "occupied" ? court : undefined;
}
