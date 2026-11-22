export function LazyPane(props: { onPicked: () => void }) {
  return (
    <button type="button" class="lazy" onDblClick={() => props.onPicked()}>
      pick
    </button>
  );
}
