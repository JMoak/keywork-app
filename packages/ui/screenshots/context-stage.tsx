import { emptyProjection } from "@keywork-app/client";
import type { ContextBasis, ContextReport, SessionSummary } from "@keywork-app/protocol";
import type { JSX } from "solid-js";
import { PaneFrame } from "../src/chrome/pane-frame.tsx";
import { reportedContextLevel } from "../src/instruments/context.ts";
import { type ContextSpec, contextPane } from "../src/panes/context/index.tsx";
import type { ShellSeams } from "../src/panes/registry.ts";
import type { Outfit } from "../src/theme/attire.ts";
import { keyworkNight, themeNamed } from "../src/theme/index.ts";

export const contextStage: readonly (() => JSX.Element)[] = [
  () =>
    contextPaneOf({
      title: "explain the page grammar",
      focused: true,
      shape: {
        window: 200_000,
        declared: true,
        conversationBasis: "reported",
        system: 2_900,
        tools: 6_100,
        injected: 2_400,
        conversation: 116_300,
      },
    }),
  () =>
    contextPaneOf({
      title: "fix the flaky trash test",
      outfit: "whiplash",
      shape: {
        window: 200_000,
        declared: false,
        conversationBasis: "estimated",
        system: 6_100,
        tools: 31_200,
        injected: 14_000,
        conversation: 130_700,
      },
    }),
  () =>
    contextPaneOf({
      title: "scan the field for the desk",
      outfit: "rose-pine-dawn",
      shape: {
        window: 1_000_000,
        declared: true,
        conversationBasis: "reported",
        system: 1_800,
        tools: 2_900,
        injected: 1_300,
        conversation: 228_000,
      },
    }),
];

interface StagedContext {
  readonly title: string;
  readonly shape: ReportShape;
  readonly focused?: boolean | undefined;
  readonly outfit?: string | undefined;
}

interface ReportShape {
  readonly window: number;
  readonly declared: boolean;
  readonly conversationBasis: ContextBasis;
  readonly system: number;
  readonly tools: number;
  readonly injected: number;
  readonly conversation: number;
}

function contextPaneOf(staged: StagedContext): JSX.Element {
  const shell = stagedShell(staged.title, stagedReport(staged.shape));
  const spec: ContextSpec = { kind: "context", sessionId: staged.title };
  return (
    <PaneFrame
      name={contextPane.title(spec, shell)}
      state="idle"
      focused={staged.focused ?? false}
      spawnRank={0}
      context={contextPane.adornments?.(spec, shell).context}
      outfit={staged.outfit === undefined ? undefined : wearing(staged.outfit)}
    >
      <contextPane.component
        id={`context-${staged.title}`}
        spec={spec}
        focused={staged.focused ?? false}
        shell={shell}
        onAction={() => {}}
      />
    </PaneFrame>
  );
}

function stagedReport(shape: ReportShape): ContextReport {
  const fixed = shape.system + shape.tools + shape.injected;
  const settler = reportedContextLevel(shape.conversation, shape.window);
  const estimated = (tokens: number) => ({ tokens, basis: "estimated" as const });
  const measured = (tokens: number) => ({ tokens, basis: shape.conversationBasis });
  return {
    used: shape.conversation,
    window: shape.window,
    flushAt: settler.flushAt,
    compactAt: settler.compactAt,
    declared: shape.declared,
    fullness: shape.conversation / shape.window,
    flushDue: shape.conversation > settler.flushAt,
    compactionDue: shape.conversation > settler.compactAt,
    basis: "estimated",
    parts: {
      system: estimated(shape.system),
      tools: estimated(shape.tools),
      injected: estimated(shape.injected),
      conversation: measured(shape.conversation),
      free: measured(Math.max(0, shape.window - fixed - shape.conversation)),
    },
    thresholds: { flushAt: settler.flushAt + fixed, compactAt: settler.compactAt + fixed },
  };
}

function stagedShell(title: string, report: ContextReport): ShellSeams {
  const summary: SessionSummary = {
    id: title,
    title,
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    messageCount: 12,
  };
  const store = {
    summary: () => summary,
    projection: () => emptyProjection,
    controls: {
      readings: () => ({ context: report, cost: undefined }),
      watchReadings: async () => {},
    },
  };
  const shell: Partial<ShellSeams> = {
    store: store as unknown as ShellSeams["store"],
    keys: { chord: (action) => action, leader: () => "" },
    currentSession: () => undefined,
    rebind: () => {},
  };
  return shell as ShellSeams;
}

function wearing(name: string): Outfit {
  return { theme: themeNamed(name) ?? keyworkNight, source: "pane" };
}
