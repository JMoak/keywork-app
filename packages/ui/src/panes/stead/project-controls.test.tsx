import type { BusEnvelope } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CreatureProjectBinding,
  CreatureProjectsPort,
  SteadProjectContext,
  SteadSessionReference,
} from "./home-scope.ts";
import { CreatureProjectControls } from "./project-controls.tsx";

afterEach(cleanup);

const home = { workspace: "home-workspace", session: "wren-conversation" };
const ide = { workspace: "project-workspace", session: "selected-ide-session" };
const task = { workspace: ide.workspace, session: "new-project-task" };
const project = { workspace: ide.workspace, label: "Workbench", ideSession: ide };
const linked = { project: ide.workspace, threads: [], discussions: [] };

function harness(options: { active?: SteadProjectContext; linked?: boolean } = {}) {
  let bindings: readonly CreatureProjectBinding[] = options.linked ? [linked] : [];
  let listener: ((batch: readonly BusEnvelope[]) => void) | undefined;
  const [activeProject, setActiveProject] = createSignal(options.active);
  const list = vi.fn<CreatureProjectsPort["list"]>(async () => bindings);
  const bind = vi.fn<CreatureProjectsPort["bind"]>(async () => {
    bindings = [linked];
  });
  const unbind = vi.fn<CreatureProjectsPort["unbind"]>(async () => {
    bindings = [];
  });
  const start = vi.fn<CreatureProjectsPort["start"]>(async () => task);
  const discuss = vi.fn<CreatureProjectsPort["discuss"]>(async () => home);
  const opened: SteadSessionReference[] = [];
  const scope = {
    workspace: home.workspace,
    activeProject,
    openSession: (reference: SteadSessionReference) => {
      opened.push(reference);
    },
    projects: { list, bind, unbind, start, discuss },
  };
  render(() => (
    <CreatureProjectControls
      scope={scope}
      creature={{ slug: "wren", name: "Wren" }}
      conversation={async () => home.session}
      feed={{
        subscribe: (receive) => {
          listener = receive;
          return () => {
            listener = undefined;
          };
        },
      }}
    />
  ));
  return {
    opened,
    list,
    bind,
    unbind,
    start,
    discuss,
    setActiveProject,
    note: (next: CreatureProjectBinding) => {
      bindings = [next];
      listener?.([
        { type: "creature.changed", payload: { slug: "wren", change: "threads" } } as BusEnvelope,
      ]);
    },
  };
}

function fill(text: string): void {
  fireEvent.input(screen.getByLabelText("Instructions or excerpt"), { target: { value: text } });
}

const button = (name: string) => screen.getByRole("button", { name });

describe("the creature’s home and project controls", () => {
  it("opens the shared home conversation without selecting or binding a project", async () => {
    const h = harness();
    expect(screen.getByText("Open a project when you want to send work to it.")).toBeTruthy();
    fireEvent.click(button("Open Wren’s conversation"));
    await waitFor(() => expect(h.opened).toEqual([home]));
    expect(h.bind).not.toHaveBeenCalled();
  });

  it("only binds an active project after the keeper requests it", async () => {
    const h = harness({ active: project });
    fireEvent.click(await screen.findByRole("button", { name: "Connect project" }));
    await screen.findByRole("button", { name: "Disconnect project" });
    expect(h.bind).toHaveBeenCalledExactlyOnceWith("wren", ide.workspace);
    await waitFor(() => expect(button("Disconnect project")).toHaveProperty("disabled", false));
    fireEvent.click(button("Disconnect project"));
    await screen.findByRole("button", { name: "Connect project" });
    expect(h.unbind).toHaveBeenCalledExactlyOnceWith("wren", ide.workspace);
  });

  it("reuses a request ID after failure and opens the returned qualified project task", async () => {
    const h = harness({ active: project, linked: true });
    h.start.mockRejectedValueOnce(new Error("reply lost"));
    await screen.findByLabelText("Instructions or excerpt");
    fill("Check the linked function");
    fireEvent.submit(button("Start project task").closest("form") as HTMLFormElement);
    fireEvent.click(await screen.findByRole("button", { name: "Retry message" }));
    await waitFor(() => expect(h.opened).toEqual([task]));
    expect(h.start).toHaveBeenCalledTimes(2);
    expect(h.start.mock.calls[0]).toEqual(h.start.mock.calls[1]);
    expect(h.start.mock.calls[0]).toEqual([
      "wren",
      ide.workspace,
      {
        requestId: expect.any(String),
        text: "Check the linked function",
        source: ide,
      },
    ]);
  });

  it("discusses only the supplied excerpt from the selected project session", async () => {
    const h = harness({ active: project, linked: true });
    await screen.findByLabelText("Instructions or excerpt");
    fill("Why did this return an empty result?");
    fireEvent.click(button("Discuss in creature conversation"));
    await waitFor(() => expect(h.opened).toEqual([home]));
    expect(h.discuss).toHaveBeenCalledExactlyOnceWith("wren", ide.workspace, {
      requestId: expect.any(String),
      text: "Why did this return an empty result?",
      source: ide,
    });
    h.setActiveProject({ ...project, ideSession: { ...ide, workspace: "unrelated" } });
    expect(screen.queryByRole("button", { name: "Discuss in creature conversation" })).toBeNull();
  });

  it("updates linked work from the shared home feed and shows the active project session status", async () => {
    const active = { ...project, session: () => ({ label: "Inspect output", status: "Working" }) };
    const h = harness({ active, linked: true });
    await screen.findByLabelText("Instructions or excerpt");
    h.note({ ...linked, threads: [{ requestId: "r1", session: task }] });
    fireEvent.click(await screen.findByRole("button", { name: "Inspect output" }));
    expect(screen.getByText("Working")).toBeTruthy();
    expect(h.opened).toEqual([task]);
  });
});
