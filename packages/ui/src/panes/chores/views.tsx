import { For, type JSX, Match, Show, Switch } from "solid-js";
import { EmptyState } from "../empty-state.tsx";
import { ConfirmLine, keepInView } from "../overview/rows.tsx";
import {
  acceptHeading,
  acceptQuestion,
  acceptTerms,
  awaitingLine,
  budgetWords,
  choreFacts,
  costWords,
  creatureAside,
  destinationWords,
  disabledLine,
  factLabels,
  grantsHeading,
  minutesWords,
  noGrantsDeclared,
  notifyWords,
  parkedLine,
  problemLine,
  runColumns,
  runNotes,
  runsHeading,
  settingsLine,
  settingsPointer,
  settingsUnservedLine,
  toolsWords,
  triggerWords,
  wakeWords,
  whenWords,
} from "./copy.ts";
import { runMarks, runOutcome } from "./outcome.ts";
import { type ChoresListRow, choreMark, titleOf } from "./rows.ts";
import {
  awaitsAcceptance,
  type ChoreFile,
  type ChoreGrant,
  type ChoreNeed,
  type ChoreRow,
  type GrantsView,
  heldOnGrants,
  isOn,
  type NotificationSettings,
  type RunRow,
} from "./wire.ts";

export interface ChoreHints {
  readonly accept: string;
  readonly toggle: string;
  readonly run: string;
  needs(row: ChoreRow): readonly ChoreNeed[];
}

export interface ListRowViewProps {
  readonly row: ChoresListRow;
  readonly cursor: boolean;
  readonly next: (row: ChoreRow) => string;
  readonly hints: ChoreHints;
  onClick(): void;
}

export function ListRowView(props: ListRowViewProps) {
  return (
    <Switch>
      <Match when={props.row.kind === "creature" ? props.row : undefined}>
        {(row) => (
          <RowShell
            cursor={props.cursor}
            onClick={() => props.onClick()}
            below={
              <Show when={row().refusal}>
                {(text) => (
                  <p class="kw-ov-sub" data-tone="error">
                    {text()}
                  </p>
                )}
              </Show>
            }
          >
            <span class="kw-ov-mark" aria-hidden="true" data-density="light">
              {row().folded ? "▸" : "▾"}
            </span>
            <span class="kw-ov-name">{row().creature.name}</span>
            <span class="kw-ov-aside">{creatureAside(row().count)}</span>
          </RowShell>
        )}
      </Match>
      <Match when={props.row.kind === "chore" ? props.row.row : undefined}>
        {(chore) => (
          <RowShell
            cursor={props.cursor}
            indent
            muted={!isOn(chore())}
            onClick={() => props.onClick()}
            below={<ChoreLines row={chore()} hints={props.hints} />}
          >
            <span class="kw-ov-mark" aria-hidden="true" data-density={choreMark(chore()).density}>
              {choreMark(chore()).glyph}
            </span>
            <span class="kw-ov-name">{titleOf(chore())}</span>
            <span class="kw-ov-aside">{props.next(chore())}</span>
          </RowShell>
        )}
      </Match>
    </Switch>
  );
}

export interface ChoreDetailProps {
  readonly row: ChoreRow;
  readonly runs: readonly RunRow[];
  readonly runsRefusal: string | undefined;
  readonly cursor: number;
  readonly zone: string;
  readonly next: string;
  readonly hints: ChoreHints;
  readonly noRuns: string;
  onPickRun(index: number): void;
}

export function ChoreDetail(props: ChoreDetailProps) {
  return (
    <div class="kw-chores-detail">
      <Show when={props.row.routine} fallback={<ProblemLine row={props.row} />}>
        {(routine) => (
          <>
            <ChoreFacts
              routine={routine()}
              grants={props.row.grants}
              file={props.row.file}
              next={props.next}
            />
            <ChoreWarnings row={props.row} hints={props.hints} />
            <GrantsList
              grants={routine().grants}
              shown={routine().tools !== "read-only"}
              heading={grantsHeading}
            />
            <p class="kw-chores-heading">{runsHeading}</p>
            <Switch>
              <Match when={props.runsRefusal}>
                {(text) => (
                  <p class="kw-ov-line" data-tone="error">
                    {text()}
                  </p>
                )}
              </Match>
              <Match when={props.runs.length === 0}>
                <EmptyState line={props.noRuns} />
              </Match>
              <Match when={props.runs.length > 0}>
                <RunsTable
                  runs={props.runs}
                  cursor={props.cursor}
                  zone={props.zone}
                  onPick={(index) => props.onPickRun(index)}
                />
              </Match>
            </Switch>
          </>
        )}
      </Show>
    </div>
  );
}

export interface AcceptCardProps {
  readonly row: ChoreRow;
  onConfirm(): void;
  onCancel(): void;
}

export function AcceptCard(props: AcceptCardProps) {
  const grants = (): readonly ChoreGrant[] => props.row.routine?.grants ?? [];
  return (
    <Show when={props.row.grants}>
      {(view) => (
        <section
          class="kw-chores-accept"
          aria-label={acceptHeading(titleOf(props.row), view().posture, grants().length)}
        >
          <p class="kw-chores-heading">
            {acceptHeading(titleOf(props.row), view().posture, grants().length)}
          </p>
          <Show when={grants().length > 0} fallback={<p class="kw-ov-sub">{noGrantsDeclared}</p>}>
            <GrantsList grants={grants()} shown />
          </Show>
          <p class="kw-ov-sub">{acceptTerms(view().digest)}</p>
          <ConfirmLine
            question={acceptQuestion(grants().length)}
            onConfirm={() => props.onConfirm()}
            onCancel={() => props.onCancel()}
          />
        </section>
      )}
    </Show>
  );
}

export interface SettingsFooterProps {
  readonly settings: NotificationSettings | undefined;
}

export function SettingsFooter(props: SettingsFooterProps) {
  return (
    <footer class="kw-chores-settings">
      <p>{props.settings === undefined ? settingsUnservedLine : settingsLine(props.settings)}</p>
      <p>{settingsPointer}</p>
    </footer>
  );
}

interface RowShellProps {
  readonly cursor: boolean;
  readonly indent?: boolean | undefined;
  readonly muted?: boolean | undefined;
  readonly below?: JSX.Element;
  onClick(): void;
  readonly children: JSX.Element;
}

function RowShell(props: RowShellProps) {
  return (
    <li
      ref={(row) => keepInView(row, () => props.cursor)}
      class="kw-ov-row kw-chores-row"
      data-cursor={props.cursor ? "" : undefined}
      data-indent={props.indent ? "" : undefined}
      data-muted={props.muted ? "" : undefined}
    >
      <button type="button" class="kw-ov-button" onClick={() => props.onClick()}>
        {props.children}
      </button>
      {props.below}
    </li>
  );
}

function ChoreLines(props: { readonly row: ChoreRow; readonly hints: ChoreHints }) {
  return (
    <Show when={props.row.routine} fallback={<ProblemLine row={props.row} />}>
      {(routine) => (
        <>
          <p class="kw-ov-sub kw-chores-facts-line">
            {choreFacts(routine())} · <ToolsMark grants={props.row.grants} routine={routine()} />
          </p>
          <ChoreWarnings row={props.row} hints={props.hints} />
        </>
      )}
    </Show>
  );
}

function ChoreWarnings(props: { readonly row: ChoreRow; readonly hints: ChoreHints }) {
  return (
    <>
      <Show when={props.row.schedule.disabled}>
        {(disabled) => (
          <p class="kw-ov-sub" data-tone="error">
            {disabledLine(disabled().reason, props.hints.toggle)}
          </p>
        )}
      </Show>
      <Show when={heldOnGrants(props.hints.needs(props.row))}>
        <p class="kw-ov-sub kw-chores-needs-you" data-tone="error">
          {parkedLine(props.hints.accept)}
        </p>
      </Show>
      <Show when={awaitsAcceptance(props.row) ? props.row.grants : undefined}>
        {(grants) => (
          <p class="kw-ov-sub kw-chores-awaiting">
            {awaitingLine(grants().posture, props.hints.accept)}
          </p>
        )}
      </Show>
    </>
  );
}

function ProblemLine(props: { readonly row: ChoreRow }) {
  return (
    <p class="kw-ov-sub" data-tone="error">
      {problemLine(props.row.file, props.row.problem ?? "")}
    </p>
  );
}

function ToolsMark(props: { readonly grants: GrantsView | null; readonly routine: ChoreFile }) {
  return (
    <Show when={props.grants}>
      {(grants) => (
        <span
          class="kw-chores-tools"
          data-posture={grants().posture}
          data-accepted={grants().needsAcceptance ? String(grants().accepted) : undefined}
        >
          {toolsWords(grants(), props.routine.grants.length)}
        </span>
      )}
    </Show>
  );
}

function ChoreFacts(props: {
  readonly routine: ChoreFile;
  readonly grants: GrantsView | null;
  readonly file: string;
  readonly next: string;
}) {
  return (
    <dl class="kw-chores-facts">
      <dt>{factLabels.trigger}</dt>
      <dd>{triggerWords(props.routine.trigger)}</dd>
      <Show when={props.routine.wake}>
        {(wake) => (
          <>
            <dt>{factLabels.wake}</dt>
            <dd data-wake="">{wakeWords(wake().requestedAt)}</dd>
          </>
        )}
      </Show>
      <dt>{factLabels.next}</dt>
      <dd>{props.next}</dd>
      <dt>{factLabels.destination}</dt>
      <dd>{destinationWords(props.routine.destination)}</dd>
      <dt>{factLabels.notify}</dt>
      <dd>{notifyWords[props.routine.notify]}</dd>
      <dt>{factLabels.tools}</dt>
      <dd>
        <ToolsMark grants={props.grants} routine={props.routine} />
      </dd>
      <dt>{factLabels.budget}</dt>
      <dd>{budgetWords(props.routine.budget)}</dd>
      <dt>{factLabels.file}</dt>
      <dd>{props.file}</dd>
      <dt>{factLabels.instructions}</dt>
      <dd class="kw-chores-instructions">{props.routine.instructions}</dd>
    </dl>
  );
}

function GrantsList(props: {
  readonly grants: readonly ChoreGrant[];
  readonly shown: boolean;
  readonly heading?: string | undefined;
}) {
  return (
    <Show when={props.shown && props.grants.length > 0}>
      <Show when={props.heading}>{(heading) => <p class="kw-chores-heading">{heading()}</p>}</Show>
      <ul class="kw-chores-grants">
        <For each={props.grants}>
          {(grant) => (
            <li>
              <span class="kw-chores-action">{grant.action}</span> {grant.resource}
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
}

function RunsTable(props: {
  readonly runs: readonly RunRow[];
  readonly cursor: number;
  readonly zone: string;
  onPick(index: number): void;
}) {
  return (
    <table class="kw-chores-runs">
      <thead>
        <tr>
          <For each={runColumns}>{(column) => <th scope="col">{column}</th>}</For>
        </tr>
      </thead>
      <tbody>
        <For each={props.runs}>
          {(run, index) => (
            <RunRows
              run={run}
              cursor={index() === props.cursor}
              zone={props.zone}
              onPick={() => props.onPick(index())}
            />
          )}
        </For>
      </tbody>
    </table>
  );
}

function RunRows(props: {
  readonly run: RunRow;
  readonly cursor: boolean;
  readonly zone: string;
  onPick(): void;
}) {
  const outcome = () => runOutcome(props.run);
  const marks = () => runMarks(props.run);
  const notes = () => runNotes(props.run, props.zone);
  return (
    <>
      <tr
        ref={(row) => keepInView(row, () => props.cursor)}
        class="kw-chores-run"
        data-cursor={props.cursor ? "" : undefined}
        onClick={() => props.onPick()}
      >
        <td>{whenWords(props.run.firedAt, props.zone)}</td>
        <td data-outcome={outcome().word}>{outcome().word}</td>
        <td data-fact="process" data-mark={marks().process}>
          {marks().process}
        </td>
        <td data-fact="delivery" data-mark={marks().delivery}>
          {marks().delivery}
        </td>
        <td data-fact="verified" data-mark={marks().verified}>
          {marks().verified}
        </td>
        <td class="kw-chores-number">{costWords(props.run)}</td>
        <td class="kw-chores-number">{minutesWords(props.run)}</td>
      </tr>
      <Show when={notes() !== ""}>
        <tr class="kw-chores-note">
          <td colSpan={runColumns.length}>{notes()}</td>
        </tr>
      </Show>
    </>
  );
}
