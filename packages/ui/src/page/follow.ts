export interface TailFollow {
  resume(): void;
  dispose(): void;
}

export const tailSlackPx = 48;

export function followTail(
  scroller: HTMLElement,
  content: HTMLElement,
  onFollowing: (following: boolean) => void = () => {},
): TailFollow {
  let following = true;
  const follow = (now: boolean): void => {
    if (now === following) return;
    following = now;
    onFollowing(now);
  };
  const atTail = (): boolean =>
    scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= tailSlackPx;
  const toTail = (): void => {
    scroller.scrollTop = scroller.scrollHeight;
  };
  const onScroll = (): void => follow(atTail());
  scroller.addEventListener("scroll", onScroll, { passive: true });
  const observer =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => {
          if (following) toTail();
        })
      : undefined;
  observer?.observe(content);
  return {
    resume: () => {
      follow(true);
      toTail();
    },
    dispose: () => {
      scroller.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    },
  };
}
