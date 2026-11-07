import { Show } from "solid-js";
import {
  cancelWord,
  cardKeysLine,
  deleteButtonWord,
  deleteTitle,
  doesNotUndoLine,
  goesLine,
  keepWorkshopWord,
  staysLine,
} from "./copy.ts";
import type { CreatureRemoval } from "./wire.ts";

export const confirmKey = "y";
export const keepKey = "k";

export interface DeleteCardProps {
  name: string;
  removal: CreatureRemoval;
  keep: boolean;
  onKeep(keep: boolean): void;
  onDelete(): void;
  onCancel(): void;
}

export function workshopOf(removal: CreatureRemoval): string | undefined {
  return removal.goes.workshop ?? removal.stays.workshop ?? undefined;
}

export function threadsGoing(removal: CreatureRemoval): number {
  return removal.goes.threads.length + (removal.goes.conversation === null ? 0 : 1);
}

export function DeleteCard(props: DeleteCardProps) {
  const workshop = () => workshopOf(props.removal);
  const onKeyDown = (event: KeyboardEvent): void => {
    event.preventDefault();
    if (event.key === keepKey && workshop() !== undefined) {
      props.onKeep(!props.keep);
      return;
    }
    if (event.key === confirmKey || event.key === "Enter") {
      props.onDelete();
      return;
    }
    props.onCancel();
  };
  return (
    <fieldset
      class="kw-creature-card"
      aria-label={deleteTitle(props.name)}
      tabIndex={-1}
      ref={(card) => queueMicrotask(() => card.focus())}
      onKeyDown={onKeyDown}
    >
      <legend class="kw-creature-card-title">{deleteTitle(props.name)}</legend>
      <p class="kw-creature-card-line" data-part="goes">
        {goesLine({
          name: props.name,
          threads: threadsGoing(props.removal),
          notes: props.removal.goes.notes,
          chores: props.removal.goes.routines,
          workshop: workshop(),
        })}
      </p>
      <p class="kw-creature-card-line" data-part="stays">
        {staysLine}
      </p>
      <p class="kw-creature-card-line" data-part="undo">
        {doesNotUndoLine(props.name)}
      </p>
      <Show when={workshop()}>
        <label class="kw-creature-card-keep">
          <input
            type="checkbox"
            checked={props.keep}
            onChange={(event) => props.onKeep(event.currentTarget.checked)}
          />
          <span>{keepWorkshopWord}</span>
          <kbd>{keepKey}</kbd>
        </label>
      </Show>
      <div class="kw-creature-card-buttons">
        <button
          type="button"
          class="kw-creature-card-button"
          data-tone="deny"
          onClick={() => props.onDelete()}
        >
          {deleteButtonWord(props.name)}
        </button>
        <button type="button" class="kw-creature-card-button" onClick={() => props.onCancel()}>
          {cancelWord}
        </button>
      </div>
      <p class="kw-creature-card-keys">
        {cardKeysLine({
          confirm: confirmKey,
          keep: workshop() === undefined ? undefined : keepKey,
        })}
      </p>
    </fieldset>
  );
}
