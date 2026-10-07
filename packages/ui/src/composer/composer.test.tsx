import { fireEvent, render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { Composer, intentOf } from "./composer.tsx";

function mount() {
  const sent: string[] = [];
  const queued: string[] = [];
  let interrupts = 0;
  const { container } = render(() => (
    <Composer
      queue={[{ id: "q1", text: "later", behavior: "queue" }]}
      onSteer={(text) => sent.push(text)}
      onQueue={(text) => queued.push(text)}
      onInterrupt={() => {
        interrupts += 1;
      }}
    />
  ));
  const input = container.querySelector("textarea") as HTMLTextAreaElement;
  const type = (text: string): void => {
    input.value = text;
    fireEvent.input(input);
  };
  return { container, input, type, sent, queued, interrupts: () => interrupts };
}

describe("intentOf", () => {
  it("maps the hot-path keys", () => {
    const key = (overrides: Partial<Parameters<typeof intentOf>[0]>) =>
      intentOf({
        key: "Enter",
        altKey: false,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        isComposing: false,
        ...overrides,
      });
    expect(key({})).toBe("queue");
    expect(key({ altKey: true })).toBe("steer");
    expect(key({ ctrlKey: true })).toBe("queue");
    expect(key({ shiftKey: true })).toBe("newline");
    expect(key({ key: "Escape" })).toBe("interrupt");
    expect(key({ key: "a" })).toBe("none");
    expect(key({ isComposing: true })).toBe("none");
  });
});

describe("Composer", () => {
  it("queues on enter and clears, ignoring an empty draft", () => {
    const composer = mount();
    fireEvent.keyDown(composer.input, { key: "Enter" });
    expect(composer.queued).toEqual([]);
    composer.type("  fix the tests  ");
    fireEvent.keyDown(composer.input, { key: "Enter" });
    expect(composer.queued).toEqual(["fix the tests"]);
    expect(composer.sent).toEqual([]);
    expect(composer.input.value).toBe("");
  });

  it("steers on alt+enter and interrupts on escape without touching the draft", () => {
    const composer = mount();
    composer.type("after that");
    fireEvent.keyDown(composer.input, { key: "Enter", altKey: true });
    expect(composer.sent).toEqual(["after that"]);
    expect(composer.queued).toEqual([]);
    composer.type("still typing");
    fireEvent.keyDown(composer.input, { key: "Escape" });
    expect(composer.interrupts()).toBe(1);
    expect(composer.input.value).toBe("still typing");
  });

  it("keeps shift+enter as a newline and never submits a multi-line paste", () => {
    const composer = mount();
    composer.type("line one");
    const shifted = fireEvent.keyDown(composer.input, { key: "Enter", shiftKey: true });
    expect(shifted).toBe(true);
    composer.type("line one\nline two\nline three");
    fireEvent.paste(composer.input);
    expect(composer.sent).toEqual([]);
    expect(composer.queued).toEqual([]);
    expect(composer.input.value.split("\n")).toHaveLength(3);
  });

  it("renders the queue as quiet rows", () => {
    const composer = mount();
    expect(composer.container.querySelector(".kw-queue-item")?.textContent).toBe("░later");
  });

  it("tags a queued prompt another client injected", () => {
    const { container } = render(() => (
      <Composer
        queue={[
          {
            id: "q1",
            text: "dictated",
            behavior: "queue",
            origin: { kind: "external", client: "wispr-flow" },
          },
        ]}
        onSteer={() => undefined}
        onQueue={() => undefined}
        onInterrupt={() => undefined}
      />
    ));
    expect(container.querySelector(".kw-queue-origin")?.textContent).toBe("via wispr-flow");
  });
});
