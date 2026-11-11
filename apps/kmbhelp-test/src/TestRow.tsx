import { StatusMark } from './StatusMark';
import type { Lang, Localized, RowStatus } from './types';

type TestRowProps = {
  name: string;
  status: RowStatus;
  error?: Localized;
  report?: Localized;
  lang: Lang;
  busy: boolean;
  statusLabel: string;
  onRun: () => void;
};

export function TestRow({ name, status, error, report, lang, busy, statusLabel, onRun }: TestRowProps) {
  const errorText = status === 'fail' ? error?.[lang] : undefined;
  const reportText = status === 'pass' ? report?.[lang] : undefined;
  return (
    <li className="test">
      <button type="button" className="run-one" aria-describedby="run-one-desc" onClick={onRun} disabled={busy}>
        T
      </button>
      <StatusMark status={status} label={statusLabel} />
      <span className="test-name">{name}</span>
      {errorText ? <p className="detail">{errorText}</p> : null}
      {reportText ? <p className="report">{reportText}</p> : null}
    </li>
  );
}
