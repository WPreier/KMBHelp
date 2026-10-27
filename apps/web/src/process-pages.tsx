import { processCreatedSchema } from '@kmbhelp/shared';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { getJson, postJson, RequestFailed } from './api.js';
import { useLocale } from './locale.js';

type ProcessList = {
  policy: { directBelow: number; tokenUntil: number };
  suppliers: { id: string; name: string; status: string }[];
};

function t(lang: 'de' | 'en', de: string, en: string): string {
  return lang === 'de' ? de : en;
}

export function ProcessPage() {
  const { lang, copy } = useLocale();
  const [notice, setNotice] = useState('');
  const [list, setList] = useState<ProcessList | null>(null);

  useEffect(() => {
    let cancelled = false;
    getJson('/api/v1/staff/processes', parseList)
      .then((body) => {
        if (!cancelled) setList(body);
      })
      .catch(() => {
        if (!cancelled) setList(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function show(text: string) {
    setNotice(text);
  }

  return (
    <>
      <h2>{copy.processesTitle}</h2>
      <p>{copy.processesLead}</p>
      {notice ? <p>{notice}</p> : null}
      <ProcessForm
        title={copy.changeTitle}
        onSubmit={(data) =>
          postJson(
            '/api/v1/staff/changes',
            {
              summary: text(data, 'summary'),
              scheduledFor: text(data, 'scheduledFor'),
              fallbackText: text(data, 'fallbackText'),
              systems: text(data, 'systems'),
              exceptionReason: text(data, 'exceptionReason'),
            },
            processCreatedSchema.parse,
          )
        }
        onDone={(body) => show(String(body.number))}
        onError={(text) => show(text)}
      >
        <label>
          {copy.subject}
          <input name="summary" required maxLength={200} />
        </label>
        <label>
          {t(lang, 'Termin', 'Date')}
          <input name="scheduledFor" required placeholder="dd.MM.yyyy" />
        </label>
        <label>
          {copy.description}
          <textarea name="fallbackText" maxLength={4000} />
        </label>
        <label>
          {t(lang, 'Systeme', 'Systems')}
          <input name="systems" maxLength={500} />
        </label>
        <label>
          {t(lang, 'Ausnahme', 'Exception')}
          <input name="exceptionReason" maxLength={2000} />
        </label>
      </ProcessForm>
      <ProcessForm
        title={copy.procurementTitle}
        onSubmit={(data) =>
          postJson(
            '/api/v1/staff/procurement',
            {
              article: text(data, 'article'),
              reason: text(data, 'reason'),
              amountNet: Number(text(data, 'amountNet')),
              supervisorEmail: text(data, 'supervisorEmail'),
              wantedOn: text(data, 'wantedOn'),
            },
            processCreatedSchema.parse,
          )
        }
        onDone={(body) => show(`${body.number} ${body.route ?? ''} ${body.decisionPath ?? ''}`)}
        onError={(text) => show(text)}
      >
        <p>
          {copy.limitsTitle}:{' '}
          {list ? `${list.policy.directBelow} / ${list.policy.tokenUntil} EUR` : '100 / 500 EUR'}
        </p>
        <label>
          {t(lang, 'Artikel', 'Article')}
          <input name="article" required maxLength={200} />
        </label>
        <label>
          {copy.description}
          <textarea name="reason" required maxLength={4000} />
        </label>
        <label>
          {t(lang, 'Netto', 'Net')}
          <input name="amountNet" required inputMode="decimal" />
        </label>
        <label>
          {t(lang, 'Vorgesetzter', 'Supervisor')}
          <input name="supervisorEmail" type="email" maxLength={200} />
        </label>
        <label>
          {t(lang, 'Termin', 'Date')}
          <input name="wantedOn" placeholder="dd.MM.yyyy" />
        </label>
      </ProcessForm>
      <ProcessForm
        title={copy.supplierTitle}
        onSubmit={async (data) => {
          const created = await postJson(
            '/api/v1/staff/suppliers',
            {
              name: text(data, 'name'),
              purpose: text(data, 'purpose'),
              countryCode: text(data, 'countryCode'),
              avvOn: text(data, 'avvOn'),
              confidentialityOn: text(data, 'confidentialityOn'),
              subprocessorsKnown: data.get('subprocessorsKnown') === 'on',
              subprocessorsText: text(data, 'subprocessorsText'),
            },
            (value) => value as { id: string },
          );
          return { number: 0, status: created.id };
        }}
        onDone={(body) => show(body.status)}
        onError={(text) => show(text)}
      >
        <label>
          {t(lang, 'Name', 'Name')}
          <input name="name" required maxLength={200} />
        </label>
        <label>
          {t(lang, 'Zweck', 'Purpose')}
          <input name="purpose" required maxLength={500} />
        </label>
        <label>
          {t(lang, 'Land', 'Country')}
          <input name="countryCode" required maxLength={2} />
        </label>
        <label>
          AVV
          <input name="avvOn" placeholder="dd.MM.yyyy" />
        </label>
        <label>
          {t(lang, 'Verschwiegenheit', 'Confidentiality')}
          <input name="confidentialityOn" placeholder="dd.MM.yyyy" />
        </label>
        <label>
          {t(lang, 'Unterauftragnehmer bekannt', 'Subprocessors known')}
          <input name="subprocessorsKnown" type="checkbox" />
        </label>
        <label>
          {t(lang, 'Liste', 'List')}
          <textarea name="subprocessorsText" maxLength={4000} />
        </label>
      </ProcessForm>
      <ProcessForm
        title={copy.remoteTitle}
        onSubmit={(data) =>
          postJson(
            '/api/v1/staff/remote-support',
            {
              supplierId: text(data, 'supplierId'),
              windowStart: new Date(text(data, 'windowStart')).toISOString(),
              windowEnd: new Date(text(data, 'windowEnd')).toISOString(),
              accountName: text(data, 'accountName'),
            },
            processCreatedSchema.parse,
          )
        }
        onDone={(body) => show(String(body.number))}
        onError={(text) => show(text)}
      >
        <label>
          {t(lang, 'Lieferant', 'Supplier')}
          <select name="supplierId" required>
            <option value=""> </option>
            {(list?.suppliers ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.status})
              </option>
            ))}
          </select>
        </label>
        <label>
          {t(lang, 'Von', 'From')}
          <input name="windowStart" type="datetime-local" required />
        </label>
        <label>
          {t(lang, 'Bis', 'Until')}
          <input name="windowEnd" type="datetime-local" required />
        </label>
        <label>
          {t(lang, 'Account', 'Account')}
          <input name="accountName" required maxLength={200} />
        </label>
      </ProcessForm>
      <ProcessForm
        title={copy.backupTitle}
        onSubmit={(data) =>
          postJson(
            '/api/v1/staff/backup-tests',
            { systemName: text(data, 'systemName'), backupTakenOn: text(data, 'backupTakenOn') },
            processCreatedSchema.parse,
          )
        }
        onDone={(body) => show(String(body.number))}
        onError={(text) => show(text)}
      >
        <label>
          {t(lang, 'System', 'System')}
          <input name="systemName" required maxLength={200} />
        </label>
        <label>
          {t(lang, 'Stand', 'Backup date')}
          <input name="backupTakenOn" required placeholder="dd.MM.yyyy" />
        </label>
      </ProcessForm>
      <ProcessForm
        title={copy.securityTitle}
        onSubmit={(data) =>
          postJson(
            '/api/v1/staff/security-incidents',
            {
              detectedAt: new Date(text(data, 'detectedAt')).toISOString(),
              affected: text(data, 'affected'),
              isolated: data.get('isolated') === 'on',
              clientNotice: 'open',
            },
            (value) => value as { number: number; deadlineAt: string },
          )
        }
        onDone={(body) => show(`${body.number} ${body.deadlineAt}`)}
        onError={(text) => show(text)}
      >
        <label>
          {t(lang, 'Entdeckt', 'Detected')}
          <input name="detectedAt" type="datetime-local" required />
        </label>
        <label>
          {t(lang, 'Betroffen', 'Affected')}
          <textarea name="affected" required maxLength={2000} />
        </label>
        <label>
          {t(lang, 'Isoliert', 'Isolated')}
          <input name="isolated" type="checkbox" />
        </label>
      </ProcessForm>
      <ProcessForm
        title={copy.offboardingTitle}
        onSubmit={(data) =>
          postJson(
            '/api/v1/staff/offboarding',
            {
              subject: text(data, 'subject'),
              body: text(data, 'body'),
              dueOn: text(data, 'dueOn'),
            },
            (value) => value as { number: number },
          )
        }
        onDone={(body) => show(String(body.number))}
        onError={(text) => show(text)}
      >
        <label>
          {copy.subject}
          <input name="subject" required maxLength={200} />
        </label>
        <label>
          {copy.description}
          <textarea name="body" required maxLength={4000} />
        </label>
        <label>
          {t(lang, 'Letzter Arbeitstag', 'Last working day')}
          <input name="dueOn" required placeholder="dd.MM.yyyy" />
        </label>
      </ProcessForm>
      <ProcessForm
        title={copy.certificateTitle}
        onSubmit={(data) =>
          postJson(
            '/api/v1/staff/certificates',
            { systemName: text(data, 'systemName'), expiresOn: text(data, 'expiresOn') },
            (value) => value as { id: string },
          )
        }
        onDone={() => show(copy.valueSaved)}
        onError={(text) => show(text)}
      >
        <label>
          {t(lang, 'System', 'System')}
          <input name="systemName" required maxLength={200} />
        </label>
        <label>
          {t(lang, 'Ablauf', 'Expiry')}
          <input name="expiresOn" required placeholder="dd.MM.yyyy" />
        </label>
      </ProcessForm>
      <p>
        <button
          type="button"
          onClick={() => {
            postJson(
              '/api/v1/staff/certificates/remind',
              {},
              (value) => value as { numbers: number[] },
            )
              .then((body) => show(body.numbers.join(', ') || copy.valueSaved))
              .catch((error: unknown) => show(errorText(error, lang)));
          }}
        >
          {copy.runReminders}
        </button>
      </p>
      <p>
        <button
          type="button"
          onClick={() => {
            postJson('/api/v1/staff/reviews/run', {}, (value) => value as { numbers: number[] })
              .then((body) => show(body.numbers.join(', ') || copy.valueSaved))
              .catch((error: unknown) => show(errorText(error, lang)));
          }}
        >
          {copy.runReviews}
        </button>
      </p>
      <ProcessForm
        title={copy.limitsTitle}
        onSubmit={(data) =>
          postJson(
            '/api/v1/admin/procurement-policy',
            {
              directBelow: Number(text(data, 'directBelow')),
              tokenUntil: Number(text(data, 'tokenUntil')),
            },
            (value) => value as { ok: boolean },
          )
        }
        onDone={() => show(copy.valueSaved)}
        onError={(text) => show(text)}
      >
        <label>
          {t(lang, 'Direkt unter', 'Direct below')}
          <input name="directBelow" required defaultValue={list?.policy.directBelow ?? 100} />
        </label>
        <label>
          {t(lang, 'Token bis', 'Token until')}
          <input name="tokenUntil" required defaultValue={list?.policy.tokenUntil ?? 500} />
        </label>
      </ProcessForm>
      <ProcessForm
        title={copy.freezeTitle}
        onSubmit={(data) =>
          postJson(
            '/api/v1/admin/freezes',
            {
              code: text(data, 'code'),
              label: text(data, 'label'),
              onDate: text(data, 'onDate'),
            },
            (value) => value as { ok: boolean },
          )
        }
        onDone={() => show(copy.valueSaved)}
        onError={(text) => show(text)}
      >
        <label>
          {t(lang, 'Code', 'Code')}
          <input name="code" required maxLength={64} />
        </label>
        <label>
          {copy.subject}
          <input name="label" required maxLength={200} />
        </label>
        <label>
          {t(lang, 'Datum', 'Date')}
          <input name="onDate" required placeholder="dd.MM.yyyy" />
        </label>
      </ProcessForm>
    </>
  );
}

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

function ProcessForm<T>({
  title,
  children,
  onSubmit,
  onDone,
  onError,
}: {
  title: string;
  children: ReactNode;
  onSubmit: (data: FormData) => Promise<T>;
  onDone: (body: T) => void;
  onError: (text: string) => void;
}) {
  const { lang, copy } = useLocale();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    try {
      onDone(await onSubmit(new FormData(form)));
      form.reset();
    } catch (error) {
      onError(errorText(error, lang));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)}>
      <h3>{title}</h3>
      {children}
      <div className="form-actions">
        <button type="submit" disabled={pending}>
          {copy.saveProcess}
        </button>
      </div>
    </form>
  );
}

function text(data: FormData, key: string): string {
  return String(data.get(key) ?? '').trim();
}

function errorText(error: unknown, lang: 'de' | 'en'): string {
  if (error instanceof RequestFailed && error.text) return error.text[lang];
  return lang === 'de' ? 'Die Eingabe ist ungültig.' : 'The input is invalid.';
}

function parseList(value: unknown): ProcessList {
  if (!value || typeof value !== 'object') throw new Error('invalid');
  const body = value as {
    policy?: { directBelow?: number; tokenUntil?: number };
    suppliers?: { id: string; name: string; status: string }[];
  };
  return {
    policy: {
      directBelow: body.policy?.directBelow ?? 100,
      tokenUntil: body.policy?.tokenUntil ?? 500,
    },
    suppliers: body.suppliers ?? [],
  };
}
