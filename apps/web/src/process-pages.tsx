import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { postJson, RequestFailed } from './api.js';
import { useLocale } from './locale.js';

export function ProcurementDecisionPage() {
  const { token = '' } = useParams();
  const { lang, copy } = useLocale();
  const [view, setView] = useState<{ article: string; amountNet: string; currency: string } | null>(
    null,
  );
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    postJson(
      '/api/v1/procurement/decision',
      { token },
      (value) => value as { article: string; amountNet: string; currency: string },
    )
      .then((body) => {
        if (!cancelled) setView(body);
      })
      .catch((error: unknown) => {
        if (!cancelled) setNotice(errorText(error, lang));
      });
    return () => {
      cancelled = true;
    };
  }, [token, lang]);

  async function decide(decision: 'approved' | 'rejected') {
    try {
      await postJson('/api/v1/procurement/decision', { token, decision }, (value) => value);
      setNotice(copy.valueSaved);
      setView(null);
    } catch (error) {
      setNotice(errorText(error, lang));
    }
  }

  return (
    <>
      <h2>{copy.decisionTitle}</h2>
      <p>{copy.decisionLead}</p>
      {view ? (
        <>
          <p>
            {view.article} — {view.amountNet} {view.currency}
          </p>
          <div className="form-actions">
            <button type="button" onClick={() => void decide('approved')}>
              {copy.approve}
            </button>
            <button type="button" onClick={() => void decide('rejected')}>
              {copy.reject}
            </button>
          </div>
        </>
      ) : null}
      {notice ? <p>{notice}</p> : null}
    </>
  );
}

function errorText(error: unknown, lang: 'de' | 'en'): string {
  if (error instanceof RequestFailed && error.text) return error.text[lang];
  return lang === 'de' ? 'Die Eingabe ist ungültig.' : 'The input is invalid.';
}
