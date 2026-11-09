import { CreatureProjectRefusal, type ServerFeed } from "@keywork-app/client";
import { createResource, createSignal, For, onCleanup, Show } from "solid-js";
import type {
  CreatureDiscussionDraft,
  CreatureProjectActivity,
  CreatureProjectBinding,
  CreatureProjectDraft,
  SteadHomeScope,
  SteadProjectContext,
} from "./home-scope.ts";
import "./project-controls.css";

export interface CreatureProjectControlsProps {
  readonly creature: { readonly slug: string; readonly name: string };
  readonly scope: Pick<
    SteadHomeScope,
    "activeProject" | "openMemory" | "openProject" | "openSession" | "projects" | "workspace"
  >;
  readonly feed: Pick<ServerFeed, "subscribe">;
  conversation(slug: string): Promise<string | undefined>;
}

export function CreatureProjectControls(props: CreatureProjectControlsProps) {
  const scope = props.scope;
  const [projects, { refetch }] = createResource(
    () => props.creature.slug,
    async (slug) => {
      try {
        return await scope.projects.list(slug);
      } catch {
        return undefined;
      }
    },
  );
  const [text, setText] = createSignal("");
  const [notice, setNotice] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const [retry, setRetry] = createSignal<ProjectRequest>();
  const active = () => scope.activeProject();
  const binding = () => projects()?.find((project) => project.project === active()?.workspace);
  const source = () => {
    const project = active();
    return project?.ideSession?.workspace === project?.workspace ? project?.ideSession : undefined;
  };

  onCleanup(
    props.feed.subscribe((batch) => {
      if (
        batch.some(
          (event) =>
            event.type === "creature.changed" && event.payload.slug === props.creature.slug,
        )
      )
        void refetch();
    }),
  );

  const openHome = async (): Promise<void> => {
    await perform(async () => {
      const session = await props.conversation(props.creature.slug);
      if (session === undefined) {
        setNotice("This creature has no conversation yet.");
        return;
      }
      scope.openSession({ workspace: scope.workspace, session });
    }, "Could not open the creature’s conversation.");
  };

  const changeBinding = async (project: SteadProjectContext, bound: boolean): Promise<void> => {
    const slug = props.creature.slug;
    await perform(
      async () => {
        if (bound) await scope.projects.unbind(slug, project.workspace);
        else await scope.projects.bind(slug, project.workspace);
        await refetch();
      },
      bound
        ? "Could not disconnect the project."
        : "Could not connect this project. Open it and check its permissions.",
    );
  };

  const perform = async (operation: () => Promise<void>, failure: string): Promise<void> => {
    if (busy()) return;
    setBusy(true);
    setNotice(undefined);
    try {
      await operation();
    } catch (cause) {
      setNotice(projectFailure(cause, failure));
    } finally {
      setBusy(false);
    }
  };

  const send = async (request: ProjectRequest): Promise<void> => {
    if (active()?.workspace !== request.workspace) return;
    setRetry(request);
    await perform(async () => {
      const { slug, workspace, draft } = request;
      const session =
        request.kind === "thread"
          ? await scope.projects.start(slug, workspace, draft)
          : await scope.projects.discuss(slug, workspace, request.draft);
      setRetry(undefined);
      setText("");
      scope.openSession(session);
      void refetch();
    }, "Could not send the message. Retry to use the same request.");
  };

  const start = (kind: ProjectRequest["kind"]): void => {
    const project = active();
    const message = text().trim();
    if (
      project === undefined ||
      binding() === undefined ||
      message === "" ||
      busy() ||
      retry() !== undefined
    )
      return;
    const frame = { slug: props.creature.slug, workspace: project.workspace };
    const input = { requestId: crypto.randomUUID(), text: message };
    const selected = source();
    if (kind === "discussion") {
      if (selected !== undefined)
        void send({ kind, ...frame, draft: { ...input, source: selected } });
      return;
    }
    void send({
      kind,
      ...frame,
      draft: { ...input, ...(selected !== undefined && { source: selected }) },
    });
  };

  return (
    <section class="kw-stead-projects" aria-label="creature and project" data-native-activation>
      <div class="kw-stead-project-actions">
        <button type="button" disabled={busy()} onClick={() => void openHome()}>
          Open {props.creature.name}’s conversation
        </button>
        <Show when={scope.openMemory !== undefined}>
          <button type="button" onClick={() => scope.openMemory?.()}>
            Open home memory
          </button>
        </Show>
      </div>
      <Show
        when={active()}
        fallback={
          <div class="kw-stead-project-actions">
            <p>Open a project when you want to send work to it.</p>
            <Show when={scope.openProject !== undefined}>
              <button type="button" onClick={() => scope.openProject?.()}>
                Open project
              </button>
            </Show>
          </div>
        }
      >
        {(project) => (
          <Show
            when={projects() !== undefined}
            fallback={
              <p>
                {projects.loading ? "Reading linked projects…" : "Could not read linked projects."}
              </p>
            }
          >
            <div class="kw-stead-project-actions">
              <strong>{project().label}</strong>
              <Show
                when={binding()}
                fallback={
                  <button
                    type="button"
                    disabled={busy()}
                    onClick={() => void changeBinding(project(), false)}
                  >
                    Connect project
                  </button>
                }
              >
                <button
                  type="button"
                  disabled={busy() || retry() !== undefined}
                  onClick={() => void changeBinding(project(), true)}
                >
                  Disconnect project
                </button>
              </Show>
            </div>
            <Show when={binding()}>
              {(linked) => (
                <>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      start("thread");
                    }}
                  >
                    <label>
                      Instructions or excerpt
                      <textarea
                        value={text()}
                        disabled={busy() || retry() !== undefined}
                        onInput={(event) => setText(event.currentTarget.value)}
                      />
                    </label>
                    <div class="kw-stead-project-actions">
                      <button
                        type="submit"
                        disabled={busy() || retry() !== undefined || text().trim() === ""}
                      >
                        Start project task
                      </button>
                      <Show when={source()}>
                        <button
                          type="button"
                          disabled={busy() || retry() !== undefined || text().trim() === ""}
                          onClick={() => start("discussion")}
                        >
                          Discuss in creature conversation
                        </button>
                      </Show>
                    </div>
                  </form>
                  <Show when={busy() ? undefined : retry()}>
                    {(request) => (
                      <div class="kw-stead-project-actions">
                        <button
                          type="button"
                          disabled={busy() || project().workspace !== request().workspace}
                          onClick={() => void send(request())}
                        >
                          Retry message
                        </button>
                        <button type="button" disabled={busy()} onClick={() => setRetry(undefined)}>
                          Discard retry
                        </button>
                      </div>
                    )}
                  </Show>
                  <ProjectActivity
                    binding={linked()}
                    project={project()}
                    openSession={scope.openSession}
                  />
                </>
              )}
            </Show>
          </Show>
        )}
      </Show>
      <Show when={notice()}>{(line) => <p role="status">{line()}</p>}</Show>
    </section>
  );
}

type ProjectRequest =
  | {
      readonly kind: "thread";
      readonly slug: string;
      readonly workspace: string;
      readonly draft: CreatureProjectDraft;
    }
  | {
      readonly kind: "discussion";
      readonly slug: string;
      readonly workspace: string;
      readonly draft: CreatureDiscussionDraft;
    };

function projectFailure(cause: unknown, fallback: string): string {
  if (!(cause instanceof CreatureProjectRefusal)) return fallback;
  switch (cause.code) {
    case "untrusted-project":
      return "This project must be open and trusted before your creature can work there.";
    case "unbound-project":
      return "Connect this project before sending work to it.";
    case "missing-session":
      return "The selected project session is no longer available.";
    case "request-conflict":
      return "This request is already tied to different work. Discard it to start a new request.";
    default:
      return fallback;
  }
}

function ProjectActivity(props: {
  readonly binding: CreatureProjectBinding;
  readonly project: SteadProjectContext;
  readonly openSession: SteadHomeScope["openSession"];
}) {
  const taskName = (task: CreatureProjectActivity): string =>
    props.project.session?.(task.session)?.label ?? task.session.session;
  return (
    <div class="kw-stead-project-activity">
      <Show when={props.binding.threads.length > 0}>
        <ol aria-label="project tasks">
          <For each={props.binding.threads}>
            {(task) => (
              <li>
                <button type="button" onClick={() => props.openSession(task.session)}>
                  {taskName(task)}
                </button>
                <Show when={props.project.session?.(task.session)?.status}>
                  {(status) => <span>{status()}</span>}
                </Show>
              </li>
            )}
          </For>
        </ol>
      </Show>
      <Show when={props.binding.discussions.length > 0}>
        <ol aria-label="creature discussions">
          <For each={props.binding.discussions}>
            {(discussion) => (
              <li>
                <button type="button" onClick={() => props.openSession(discussion.session)}>
                  Open discussion
                </button>
              </li>
            )}
          </For>
        </ol>
      </Show>
    </div>
  );
}
