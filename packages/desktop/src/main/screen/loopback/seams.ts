import type { SignalingRouteSeams } from "../routes.ts";

export interface LoopbackMachine {
  readonly stableId: string;
  readonly machine: string;
}

export interface LoopbackHouse {
  readonly listener: string;
  readonly peerListener: string;
  readonly ticket: string;
  readonly pairId: string;
  readonly sharer: LoopbackMachine;
  readonly viewer: LoopbackMachine;
}

export const loopbackHouseEnv = "KEYWORK_LOOPBACK_HOUSE";

export function sharerSeams(house: LoopbackHouse): SignalingRouteSeams {
  return {
    nodeFile: async () => nodeFileOf(house.sharer, house.listener),
    houseFile: async () => houseFileOf(house),
    census: async () => ({ self: house.sharer, peers: [house.viewer] }),
    pairs: async () => ({ pairs: [] }),
  };
}

export function viewerSeams(house: LoopbackHouse): SignalingRouteSeams {
  return {
    nodeFile: async () => nodeFileOf(house.viewer, house.listener),
    houseFile: async () => houseFileOf(house),
    census: async () => ({
      self: house.viewer,
      peers: [{ ...house.sharer, endpoint: house.peerListener }],
    }),
    pairs: async () => ({
      pairs: [
        { id: house.pairId, peerStableId: house.sharer.stableId, endpoint: house.peerListener },
      ],
    }),
  };
}

function nodeFileOf(self: LoopbackMachine, listener: string): string {
  const mesh = Number(new URL(listener).port);
  return JSON.stringify({ state: "running", machine: { name: self.machine }, ports: { mesh } });
}

function houseFileOf(house: LoopbackHouse): string {
  return JSON.stringify({ token: house.ticket, listeners: [house.listener] });
}
