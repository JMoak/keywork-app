import { fireEvent, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { describe, expect, it } from "vitest";
import { CommandRegistry } from "../palette/commands.ts";
import { Composer, intentOf } from "./composer.tsx";
import type { DraftMemory, KeptDraft } from "./kept-draft.ts";

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
    expect(key({ ctrlKey: true })).toBe("now");
    expect(key({ metaKey: true })).toBe("now");
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

describe("the composer's seed", () => {
  function seeded() {
    const [seed, setSeed] = createSignal<{ text: string } | undefined>();
    const { container } = render(() => (
      <Composer
        queue={[]}
        seed={seed()}
        onSteer={() => {}}
        onQueue={() => {}}
        onInterrupt={() => {}}
      />
    ));
    return { input: container.querySelector("textarea") as HTMLTextAreaElement, setSeed };
  }

  it("takes back an untouched seed when it is withdrawn, so a redo never leaves a duplicate", () => {
    const { input, setSeed } = seeded();
    setSeed({ text: "write hello.txt" });
    expect(input.value).toBe("write hello.txt");
    setSeed(undefined);
    expect(input.value).toBe("");
  });

  it("keeps whatever the user wrote over a seed", () => {
    const { input, setSeed } = seeded();
    setSeed({ text: "write hello.txt" });
    input.value = "write hello.txt twice";
    fireEvent.input(input);
    setSeed(undefined);
    expect(input.value).toBe("write hello.txt twice");
  });

  it("plants a seed once, so a later read of the same seed never overwrites the new draft", () => {
    const [seed, setSeed] = createSignal<{ text: string } | undefined>();
    const [layout, setLayout] = createSignal(0);
    const { container } = render(() => (
      <Composer
        queue={[]}
        seed={layout() >= 0 ? seed() : undefined}
        onSteer={() => {}}
        onQueue={() => {}}
        onInterrupt={() => {}}
      />
    ));
    const input = container.querySelector("textarea") as HTMLTextAreaElement;
    setSeed({ text: "write notes/second.txt hello from turn two" });
    input.value = "my own new idea";
    fireEvent.input(input);
    setLayout(1);
    setLayout(2);
    expect(input.value).toBe("my own new idea");
    setSeed({ text: "write notes/second.txt hello from turn two" });
    expect(input.value).toBe("write notes/second.txt hello from turn two");
  });
});

describe("escape on a slash draft", () => {
  it("closes the menu and keeps the text, then stops the turn on the next press", () => {
    const commands = new CommandRegistry();
    commands.register({ name: "model", description: "switch the model", run: () => {} });
    let interrupts = 0;
    const { container } = render(() => (
      <Composer
        queue={[]}
        commands={commands}
        onSteer={() => {}}
        onQueue={() => {}}
        onInterrupt={() => {
          interrupts += 1;
        }}
      />
    ));
    const input = container.querySelector("textarea") as HTMLTextAreaElement;
    input.value = "/etc/hosts has a stale entry for localhost";
    fireEvent.input(input);
    expect(container.querySelector(".kw-slash-empty")).not.toBeNull();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("/etc/hosts has a stale entry for localhost");
    expect(container.querySelector(".kw-slash-empty")).toBeNull();
    expect(interrupts).toBe(0);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(interrupts).toBe(1);
    expect(input.value).toBe("/etc/hosts has a stale entry for localhost");
  });

  it("shows the menu again once the draft leaves the slash and comes back", () => {
    const commands = new CommandRegistry();
    commands.register({ name: "model", description: "switch the model", run: () => {} });
    const { container } = render(() => (
      <Composer
        queue={[]}
        commands={commands}
        onSteer={() => {}}
        onQueue={() => {}}
        onInterrupt={() => {}}
      />
    ));
    const input = container.querySelector("textarea") as HTMLTextAreaElement;
    const type = (text: string): void => {
      input.value = text;
      fireEvent.input(input);
    };
    type("/mo");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(container.querySelector(".kw-slash")).toBeNull();
    type("");
    type("/mo");
    expect(container.querySelector(".kw-slash")).not.toBeNull();
  });
});

describe("prompt history", () => {
  function sentThree() {
    const composer = mount();
    for (const prompt of ["first", "second\nwith a second line", "third"]) {
      composer.type(prompt);
      fireEvent.keyDown(composer.input, { key: "Enter" });
    }
    const press = (key: string, init: KeyboardEventInit = {}): boolean =>
      fireEvent.keyDown(composer.input, { key, ...init });
    return { ...composer, press };
  }

  it("recalls this composer's prompts newest first on up from an empty draft, and back down to empty", () => {
    const { input, press } = sentThree();
    press("ArrowUp");
    expect(input.value).toBe("third");
    input.setSelectionRange(0, 0);
    press("ArrowUp");
    expect(input.value).toBe("second\nwith a second line");
    input.setSelectionRange(0, 0);
    press("ArrowUp");
    expect(input.value).toBe("first");
    press("ArrowDown");
    expect(input.value).toBe("second\nwith a second line");
    input.setSelectionRange(input.value.length, input.value.length);
    press("ArrowDown");
    expect(input.value).toBe("third");
    press("ArrowDown");
    expect(input.value).toBe("");
  });

  it("leaves up and down to the caret inside a multi-line prompt", () => {
    const { input, press } = sentThree();
    press("ArrowUp");
    input.setSelectionRange(0, 0);
    press("ArrowUp");
    input.setSelectionRange(input.value.length, input.value.length);
    expect(press("ArrowUp")).toBe(true);
    expect(input.value).toBe("second\nwith a second line");
    input.setSelectionRange(0, 0);
    expect(press("ArrowDown")).toBe(true);
    expect(input.value).toBe("second\nwith a second line");
  });

  it("never replaces a draft the person is writing, and lets modified arrows through", () => {
    const { input, type, press } = sentThree();
    type("a new thought");
    expect(press("ArrowUp")).toBe(true);
    expect(input.value).toBe("a new thought");
    type("");
    expect(press("ArrowUp", { altKey: true })).toBe(true);
    expect(input.value).toBe("");
  });

  it("stops browsing once a recalled prompt is edited, keeping the edit", () => {
    const { input, type, press } = sentThree();
    press("ArrowUp");
    type("third, but louder");
    press("ArrowDown");
    expect(input.value).toBe("third, but louder");
  });
});

describe("a remembered draft", () => {
  function remembering(stored?: KeptDraft) {
    const kept: KeptDraft[] = [];
    const memory: DraftMemory = { recall: () => stored, keep: (draft) => kept.push(draft) };
    const queued: string[] = [];
    const view = render(() => (
      <Composer
        queue={[]}
        memory={memory}
        onSteer={() => {}}
        onQueue={(text) => queued.push(text)}
        onInterrupt={() => {}}
      />
    ));
    const input = view.container.querySelector("textarea") as HTMLTextAreaElement;
    return { ...view, input, kept, queued };
  }

  it("comes back from memory with the pastes its placeholders hold", () => {
    const flood = Array.from({ length: 9 }, (_, line) => `line ${line}`).join("\n");
    const placeholder = "[pasted #3, 9 lines, 62 B]";
    const { input, queued } = remembering({
      text: `look: ${placeholder}`,
      pastes: [[3, flood]],
    });
    expect(input.value).toBe(`look: ${placeholder}`);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(queued).toEqual([`look: ${flood}`]);
  });

  it("keeps every change and forgets the draft once it is sent", () => {
    const { input, kept } = remembering();
    expect(kept).toEqual([]);
    input.value = "an unsent draft that matters";
    fireEvent.input(input);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(kept).toEqual([
      { text: "an unsent draft that matters", pastes: [] },
      { text: "", pastes: [] },
    ]);
  });

  it("lets a remembered draft win over a standing seed when a composer mounts again", () => {
    const seed = { text: "write notes/second.txt hello from turn two" };
    const mountWith = (memory?: DraftMemory) =>
      render(() => (
        <Composer
          queue={[]}
          seed={seed}
          memory={memory}
          onSteer={() => {}}
          onQueue={() => {}}
          onInterrupt={() => {}}
        />
      ));
    const forgetful = mountWith();
    expect(forgetful.container.querySelector("textarea")?.value).toBe(seed.text);
    forgetful.unmount();
    const remembering = mountWith({
      recall: () => ({ text: "my own new idea", pastes: [] }),
      keep: () => {},
    });
    expect(remembering.container.querySelector("textarea")?.value).toBe("my own new idea");
  });
});

describe("a held composer", () => {
  it("keeps the draft and says why until the hold lifts", () => {
    const [hold, setHold] = createSignal<string | undefined>("the child is still working");
    const queued: string[] = [];
    const { container } = render(() => (
      <Composer
        queue={[]}
        hold={hold()}
        onSteer={(text) => queued.push(`steer ${text}`)}
        onQueue={(text) => queued.push(text)}
        onInterrupt={() => {}}
      />
    ));
    const input = container.querySelector("textarea") as HTMLTextAreaElement;
    input.value = "and the callers too";
    fireEvent.input(input);
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter", altKey: true });
    expect(queued).toEqual([]);
    expect(input.value).toBe("and the callers too");
    expect(container.querySelector(".kw-composer-hold")?.textContent).toBe(
      "the child is still working",
    );
    setHold(undefined);
    expect(container.querySelector(".kw-composer-hold")).toBeNull();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(queued).toEqual(["and the callers too"]);
  });
});
