export interface TailFollow {
  resume(): void;
  dispose(): void;
}

export const tailSlackPx = 48;

export function followTail(scroller: HTMLElement, content: HTMLElement): TailFollow {
  let following = true;
  const atTail = (): boolean =>
    scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= tailSlackPx;
  const toTail = (): void => {
    scroller.scrollTop = scroller.scrollHeight;
  };
  const onScroll = (): void => {
    following = atTail();
  };
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
      following = true;
      toTail();
    },
    dispose: () => {
      scroller.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    },
  };
}
