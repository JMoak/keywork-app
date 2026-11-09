import { hour, minute } from "../clock/clock.ts";
import { scoreAt, sizable } from "./attention.ts";
import { cooldownsOf, nextUnfoldFreeAt, unfoldBudget, unfoldsSpent } from "./gate.ts";
import { yardIds } from "./place.ts";
import {
  type Size,
  sizeOf,
  type YardDecision,
  type YardOwner,
  type YardSetting,
  type YardState,
} from "./types.ts";

export interface YardCard {
  readonly id: typeof yardIds.card;
  readonly used: number;
  readonly limit: number;
  readonly windowMs: number;
  readonly nextFreeAt: number;
  readonly cooldowns: readonly YardCooldown[];
  readonly decisions: readonly YardDecision[];
  readonly attended: readonly YardAttended[];
}

export interface YardCooldown {
  readonly owner: YardOwner;
  readonly until: number;
}

export interface YardAttended {
  readonly id: string;
  readonly size: Size;
  readonly score: number;
  readonly reason: string;
}

export function yardCard(state: YardState, at: number): YardCard {
  const { budget } = state;
  return {
    id: yardIds.card,
    used: unfoldsSpent(budget, at),
    limit: unfoldBudget.unfolds,
    windowMs: unfoldBudget.windowMs,
    nextFreeAt: nextUnfoldFreeAt(budget, at),
    cooldowns: cooldownsOf(budget, at).map(({ owner, at: last }) => ({
      owner,
      until: last + unfoldBudget.cooldownMs,
    })),
    decisions: state.decisions,
    attended: attendedIn(state, at),
  };
}

export function attentionReason(lastAt: number, inside: boolean, at: number): string {
  if (inside) return "you are in it";
  const ago = Math.max(0, at - lastAt);
  if (ago < minute) return "you worked here just now";
  if (ago < 2 * minute) return "you worked here about a minute ago";
  if (ago < hour) return `you worked here about ${Math.floor(ago / minute)} minutes ago`;
  return "you worked here over an hour ago";
}

function attendedIn(state: YardState, at: number): YardAttended[] {
  const inside = state.visit?.id;
  return Object.values(state.settings)
    .flatMap((setting) => {
      const { attention } = setting;
      if (attention === undefined && setting.id !== inside) return [];
      return [
        {
          id: setting.id,
          size: shownSize(setting),
          score: Math.round(scoreAt(attention, at) * 100) / 100,
          reason: attentionReason(attention?.lastAt ?? at, setting.id === inside, at),
        },
      ];
    })
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function shownSize(setting: YardSetting): Size {
  return sizable(setting) ? sizeOf(setting) : "card";
}
