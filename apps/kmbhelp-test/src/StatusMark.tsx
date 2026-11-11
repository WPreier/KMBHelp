import type { RowStatus } from './types';

type StatusMarkProps = {
  status: RowStatus;
  label: string;
};

export function StatusMark({ status, label }: StatusMarkProps) {
  if (status === 'pass') {
    return (
      <svg className="mark mark-pass" viewBox="0 0 24 24" role="img" aria-label={label}>
        <circle cx="12" cy="12" r="9" />
        <path d="M7 12.5 l3.2 3.2 L17 9" />
      </svg>
    );
  }
  if (status === 'fail') {
    return (
      <svg className="mark mark-fail" viewBox="0 0 24 24" role="img" aria-label={label}>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 8 l8 8 M16 8 l-8 8" />
      </svg>
    );
  }
  if (status === 'running') {
    return (
      <svg className="mark mark-running" viewBox="0 0 24 24" role="img" aria-label={label}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7 v5 l3 2" />
      </svg>
    );
  }
  return <span className="mark mark-idle" role="img" aria-label={label} />;
}
