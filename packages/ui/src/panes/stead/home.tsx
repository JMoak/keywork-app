import {
  type Courtyard,
  type CourtyardRange,
  type CreatureOnTheStead,
  courtyardAt,
  districtCapacity,
  type HabitatState,
  type VacantCourtyard,
} from "@keywork-app/habitat";
import { createMemo, Index, Show } from "solid-js";
import clearing from "../../creatures/assets/illustrations/clearing.png?url";
import { IllustratedPortrait } from "../../creatures/illustrated-portrait.tsx";
import type { NeedsYouItem } from "../../shell/needs-you.ts";
import { stateLabels, steadName } from "./copy.ts";
import { coatOf } from "./herd.ts";
import "./home.css";

export interface SteadHomeProps {
  readonly world: HabitatState;
  readonly order: readonly string[];
  readonly range?: (CourtyardRange & { readonly slugs?: readonly string[] }) | undefined;
  readonly selected?: string | undefined;
  readonly waiting: readonly NeedsYouItem[];
  readonly needsYou: number;
  readonly now: number;
  onTalk(slug: string): void;
  onCourt(slug: string): void;
  onExplore(): void;
  onRequests(): void;
  onCreate(): void;
}

export function SteadHome(props: SteadHomeProps) {
  const featured = createMemo(() =>
    homeResident(props.world, props.order, props.waiting, props.selected),
  );
  const reading = () => {
    const resident = featured();
    if (resident === undefined) return undefined;
    const court = courtyardAt(props.world, resident.slug, 0, props.now);
    return court.kind === "occupied" ? court.reading : undefined;
  };
  const ranks = createMemo(
    () =>
      new Map(
        Object.keys(props.world.creatures)
          .sort()
          .map((slug, index) => [slug, index]),
      ),
  );
  const rank = (slug: string) => ranks().get(slug) ?? 0;
  const courts = createMemo(() => {
    const start = props.range?.start ?? 0;
    const slugs =
      props.range?.slugs ?? props.order.slice(start, props.range?.end ?? districtCapacity);
    return slugs
      .slice(0, districtCapacity)
      .map((slug, offset) => courtyardAt(props.world, slug, start + offset, props.now));
  });
  return (
    <section class="kw-illustrated-home" aria-label={`Your ${steadName}`} data-native-activation>
      <header class="kw-home-heading">
        <div>
          <p class="kw-home-eyebrow">A little place of your own</p>
          <h2>Your {steadName}</h2>
        </div>
        <button type="button" class="kw-home-text-button" onClick={props.onExplore}>
          Explore the {steadName} <span aria-hidden="true">↗</span>
        </button>
      </header>
      <Show when={featured()}>
        {(resident) => (
          <div class="kw-home-encounter">
            <figure class="kw-home-landscape" aria-label={`${resident().name} at home`}>
              <img class="kw-home-scenery" src={clearing} alt="" decoding="async" />
              <div class="kw-home-resident">
                <IllustratedPortrait
                  skin={resident().skin ?? "kid"}
                  name={resident().name}
                  hueStop={coatOf(resident(), rank(resident().slug))}
                  size={3.5}
                  class="kw-home-portrait"
                />
              </div>
            </figure>
            <div class="kw-home-greeting">
              <span class="kw-home-state" data-state={reading()?.state}>
                {stateLabels[reading()?.state ?? "idle"]}
              </span>
              <h3>{resident().name}</h3>
              <p>{homeTelling(reading()?.state ?? "idle", resident().name)}</p>
              <div class="kw-home-actions">
                <Show
                  when={props.needsYou > 0}
                  fallback={
                    <button
                      type="button"
                      class="kw-home-primary"
                      onClick={() => props.onTalk(resident().slug)}
                    >
                      Talk to {resident().name}
                    </button>
                  }
                >
                  <button type="button" class="kw-home-primary" onClick={props.onRequests}>
                    Review {props.needsYou === 1 ? "request" : `${props.needsYou} requests`}
                  </button>
                  <button
                    type="button"
                    class="kw-home-text-button"
                    onClick={() => props.onTalk(resident().slug)}
                  >
                    Talk to {resident().name}
                  </button>
                </Show>
                <button
                  type="button"
                  class="kw-home-text-button"
                  onClick={() => props.onCourt(resident().slug)}
                >
                  Visit courtyard
                </button>
              </div>
              <Show when={props.needsYou > 0}>
                <p class="kw-home-request-note">
                  {props.needsYou === 1
                    ? "One item across your home needs a look."
                    : `${props.needsYou} items across your home need a look.`}
                </p>
              </Show>
            </div>
          </div>
        )}
      </Show>
      <div class="kw-home-neighbors-heading">
        <h3>Around the {steadName}</h3>
        <button type="button" class="kw-home-text-button" onClick={props.onCreate}>
          Meet another creature
        </button>
      </div>
      <ol
        class="kw-home-neighbors"
        aria-label="Your neighbors"
        start={(props.range?.start ?? 0) + 1}
      >
        <Index each={courts()}>
          {(court) => (
            <li>
              <Show
                when={occupiedCourt(court())}
                fallback={
                  <div class="kw-home-vacancy">
                    <span>{court().address}</span>
                    <p>A place kept for later</p>
                  </div>
                }
              >
                {(occupied) => (
                  <button
                    type="button"
                    class="kw-home-neighbor"
                    onClick={() => props.onCourt(occupied().slug)}
                    aria-label={`Visit ${occupied().creature.name}'s courtyard, ${stateLabels[occupied().reading.state]}, ${occupied().address}`}
                  >
                    <span class="kw-home-neighbor-portrait" aria-hidden="true">
                      <IllustratedPortrait
                        skin={occupied().creature.skin ?? "kid"}
                        name={occupied().creature.name}
                        hueStop={coatOf(occupied().creature, rank(occupied().slug))}
                        size={0.7}
                      />
                    </span>
                    <span class="kw-home-neighbor-copy">
                      <strong>{occupied().creature.name}</strong>
                      <span>{stateLabels[occupied().reading.state]}</span>
                      <small>{occupied().address}</small>
                    </span>
                    <span aria-hidden="true">↗</span>
                  </button>
                )}
              </Show>
            </li>
          )}
        </Index>
      </ol>
    </section>
  );
}

export function homeResident(
  world: HabitatState,
  order: readonly string[],
  waiting: readonly NeedsYouItem[],
  selected?: string,
): CreatureOnTheStead | undefined {
  const resident = (slug: string | undefined) =>
    slug !== undefined && Object.hasOwn(world.creatures, slug) ? world.creatures[slug] : undefined;
  for (const item of waiting) {
    const slug =
      ("creature" in item ? item.creature : undefined) ??
      ("sessionId" in item ? world.threads[item.sessionId]?.creature : undefined);
    const found = resident(slug);
    if (found !== undefined) return found;
  }
  return (
    resident(selected) ??
    order.map(resident).find((item) => item !== undefined) ??
    Object.values(world.creatures)[0]
  );
}

function homeTelling(state: keyof typeof stateLabels, name: string): string {
  switch (state) {
    case "working":
      return `${name} is working. You can check in without interrupting.`;
    case "porch":
      return `${name} has something for you to look at.`;
    case "blocked":
      return `${name} has run into a problem. Visit the courtyard to check on their work.`;
    case "paused":
      return `${name} is paused. Your conversation is still here.`;
    case "back":
      return `${name} has returned from a task. Visit the courtyard to explore their work.`;
    case "idle":
      return `A quiet moment with ${name}. What would you like to make, find or figure out?`;
  }
}

function occupiedCourt(court: Courtyard | VacantCourtyard): Courtyard | undefined {
  return court.kind === "occupied" ? court : undefined;
}
