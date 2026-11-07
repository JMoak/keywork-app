import type { IpcRenderer } from "electron";
import {
  type AnswerRequest,
  type CompanionSnapshot,
  companionChannels,
  type Presence,
} from "../main/companion/channels.ts";
import type { CompanionPreferences, PreferencePatch } from "../main/companion/preferences.ts";

export type CompanionIpc = Pick<IpcRenderer, "invoke" | "send" | "on" | "removeListener">;

export interface CompanionHost {
  publish(snapshot: CompanionSnapshot): void;
  preferences(): Promise<CompanionPreferences>;
  setPreferences(patch: PreferencePatch): Promise<CompanionPreferences>;
  presence(): Promise<Presence>;
  show(): Promise<void>;
  hide(): Promise<void>;
  onPresenceChanged(listener: (presence: Presence) => void): () => void;
  onAnswerRequested(listener: (request: AnswerRequest) => void): () => void;
  onOpenRequested(listener: (threadId: string | undefined) => void): () => void;
  onSettingsRequested(listener: () => void): () => void;
  onSwitchRequested(listener: (creature: string) => void): () => void;
}

export function companionHostPort(ipc: CompanionIpc): CompanionHost {
  const subscribe =
    <Payload>(channel: string) =>
    (listener: (payload: Payload) => void): (() => void) => {
      const relay = (_event: unknown, payload: Payload): void => listener(payload);
      ipc.on(channel, relay);
      return () => ipc.removeListener(channel, relay);
    };
  return {
    publish: (snapshot) => ipc.send(companionChannels.publish, snapshot),
    preferences: () => ipc.invoke(companionChannels.preferences) as Promise<CompanionPreferences>,
    setPreferences: (patch) =>
      ipc.invoke(companionChannels.setPreferences, patch) as Promise<CompanionPreferences>,
    presence: () => ipc.invoke(companionChannels.presence) as Promise<Presence>,
    show: () => ipc.invoke(companionChannels.show) as Promise<void>,
    hide: () => ipc.invoke(companionChannels.hide) as Promise<void>,
    onPresenceChanged: subscribe<Presence>(companionChannels.presenceChanged),
    onAnswerRequested: subscribe<AnswerRequest>(companionChannels.answerRequested),
    onOpenRequested: subscribe<string | undefined>(companionChannels.openRequested),
    onSettingsRequested: subscribe<void>(companionChannels.settingsRequested),
    onSwitchRequested: subscribe<string>(companionChannels.switchRequested),
  };
}
