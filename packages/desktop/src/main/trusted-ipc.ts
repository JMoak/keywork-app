export interface FramedEvent {
  readonly senderFrame: { readonly url: string } | null;
}

export type SenderTrust = (event: FramedEvent) => boolean;

type Listener<Event, Args extends unknown[], Answer> = (event: Event, ...args: Args) => Answer;

export interface IpcSeam<Event extends FramedEvent = FramedEvent> {
  handle(channel: string, listener: Listener<Event, unknown[], unknown>): void;
  on(channel: string, listener: Listener<Event, unknown[], void>): void;
  removeListener(channel: string, listener: Listener<Event, unknown[], void>): void;
}

export interface GuardedIpc<Event extends FramedEvent = FramedEvent> {
  handle<Args extends unknown[]>(channel: string, listener: Listener<Event, Args, unknown>): void;
  on<Args extends unknown[]>(channel: string, listener: Listener<Event, Args, void>): void;
  removeListener<Args extends unknown[]>(
    channel: string,
    listener: Listener<Event, Args, void>,
  ): void;
}

export function sentFrom(isTrustedPage: (url: string) => boolean): SenderTrust {
  return (event) => {
    const url = frameUrlOf(event);
    return url !== undefined && isTrustedPage(url);
  };
}

export function guardedIpc<Event extends FramedEvent>(
  ipc: IpcSeam<Event>,
  trusts: SenderTrust,
): GuardedIpc<Event> {
  const guards = new Map<unknown, Listener<Event, unknown[], void>>();

  function handle<Args extends unknown[]>(
    channel: string,
    listener: Listener<Event, Args, unknown>,
  ): void {
    ipc.handle(channel, (event, ...args) =>
      trusts(event) ? listener(event, ...(args as Args)) : Promise.reject(refusal(channel)),
    );
  }

  function on<Args extends unknown[]>(
    channel: string,
    listener: Listener<Event, Args, void>,
  ): void {
    const guard: Listener<Event, unknown[], void> = (event, ...args) => {
      if (trusts(event)) listener(event, ...(args as Args));
    };
    guards.set(listener, guard);
    ipc.on(channel, guard);
  }

  function removeListener<Args extends unknown[]>(
    channel: string,
    listener: Listener<Event, Args, void>,
  ): void {
    const guard = guards.get(listener);
    if (guard === undefined) return;
    guards.delete(listener);
    ipc.removeListener(channel, guard);
  }

  return { handle, on, removeListener };
}

function frameUrlOf(event: FramedEvent): string | undefined {
  try {
    return event.senderFrame?.url;
  } catch {
    return undefined;
  }
}

function refusal(channel: string): Error {
  return new Error(`${channel} answers only the app's own page`);
}
