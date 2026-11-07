import { createSignal, Show } from "solid-js";
import { gateFormLabels } from "./copy.ts";
import type { DraftFields } from "./draft.ts";

export interface GateFormProps {
  title: string;
  problem: string | undefined;
  onSubmit(fields: DraftFields): void;
  onCancel(): void;
}

export function GateForm(props: GateFormProps) {
  const [creature, setCreature] = createSignal("");
  const [caps, setCaps] = createSignal("");
  const [expiry, setExpiry] = createSignal<string>(gateFormLabels.expiryInitial);
  return (
    <form
      class="kw-parcels-form"
      aria-label={props.title}
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit({ creature: creature(), caps: caps(), expiry: expiry() });
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") props.onCancel();
      }}
    >
      <span class="kw-parcels-form-title">{props.title}</span>
      <label>
        <span>{gateFormLabels.creature}</span>
        <input
          name="creature"
          value={creature()}
          placeholder={gateFormLabels.creaturePlaceholder}
          ref={(input) => queueMicrotask(() => input.focus())}
          onInput={(event) => setCreature(event.currentTarget.value)}
        />
      </label>
      <label>
        <span>{gateFormLabels.caps}</span>
        <input
          name="caps"
          value={caps()}
          placeholder={gateFormLabels.capsPlaceholder}
          onInput={(event) => setCaps(event.currentTarget.value)}
        />
      </label>
      <label>
        <span>{gateFormLabels.expiry}</span>
        <input
          name="expiry"
          value={expiry()}
          onInput={(event) => setExpiry(event.currentTarget.value)}
        />
      </label>
      <button type="submit" class="kw-ov-new">
        {gateFormLabels.submit}
      </button>
      <Show when={props.problem}>{(problem) => <p class="kw-parcels-problem">{problem()}</p>}</Show>
    </form>
  );
}
