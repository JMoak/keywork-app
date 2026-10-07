import "./empty-state.css";

export interface EmptyStateProps {
  line: string;
}

export function EmptyState(props: EmptyStateProps) {
  return <p class="kw-empty">{props.line}</p>;
}
