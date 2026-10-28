import { publicErrors, vocabularySchema, type Vocabulary } from '@kmbhelp/shared';
import { useEffect, useState } from 'react';
import { deleteJson, getJson, postJson, RequestFailed } from './api.js';
import { useLocale } from './locale.js';

const termMax = 80;

export function TermPage(props: { kind: 'skill' | 'category' }) {
  const { lang, copy } = useLocale();
  const [data, setData] = useState<Vocabulary | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const title = props.kind === 'skill' ? copy.skills : copy.categories;
  const items = props.kind === 'skill' ? (data?.skills ?? []) : (data?.categories ?? []);
  const path = props.kind === 'skill' ? '/api/v1/admin/skills' : '/api/v1/admin/categories';

  useEffect(() => {
    let cancelled = false;
    getJson('/api/v1/admin/staff', vocabularySchema.parse)
      .then((loaded) => {
        if (!cancelled) setData(loaded);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(failureText(caught, lang, copy.loadFailed));
      });
    return () => {
      cancelled = true;
    };
  }, [copy.loadFailed, lang]);

  async function add() {
    const text = draft.trim();
    const names = items.flatMap((item) => [item.labelDe, item.labelEn, item.code]);
    if (!sensible(text) || names.some((name) => name.toLowerCase() === text.toLowerCase())) {
      setError(!sensible(text) ? publicErrors.invalidTerm[lang] : publicErrors.duplicateTerm[lang]);
      return;
    }
    setError('');
    document.body.classList.add('wait');
    try {
      setData(await postJson(path, { text }, vocabularySchema.parse));
      setDraft('');
    } catch (caught) {
      setError(failureText(caught, lang, copy.loadFailed));
    } finally {
      document.body.classList.remove('wait');
    }
  }

  async function remove(code: string) {
    setError('');
    try {
      setData(await deleteJson(`${path}/${encodeURIComponent(code)}`, vocabularySchema.parse));
    } catch (caught) {
      setError(failureText(caught, lang, copy.loadFailed));
    }
  }

  return (
    <section>
      <h2>{title}</h2>
      {items.map((item) => (
        <div className="term-row" key={item.code}>
          <input readOnly value={lang === 'de' ? item.labelDe : item.labelEn} />
          <button type="button" onClick={() => void remove(item.code)}>
            {copy.deleteTerm}
          </button>
        </div>
      ))}
      <div className="term-row">
        <input
          value={draft}
          maxLength={termMax}
          aria-label={title}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="button" onClick={() => void add()}>
          +
        </button>
      </div>
      {error ? (
        <p className="term-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function sensible(text: string): boolean {
  return text.length > 0 && text.length <= termMax && /\p{L}/u.test(text) && !/[\r\n]/u.test(text);
}

function failureText(caught: unknown, lang: 'de' | 'en', fallback: string): string {
  if (caught instanceof RequestFailed && caught.text) return caught.text[lang];
  return fallback;
}
