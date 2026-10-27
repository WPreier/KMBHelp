import {
  adminStaffSchema,
  loginResultSchema,
  messages,
  totpSetupSchema,
  type AdminStaffList,
  type LoginResult,
} from '@kmbhelp/shared';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { useEffect, useState, type FormEvent } from 'react';
import { getJson, postJson, RequestFailed } from './api.js';
import { AdminLinks } from './operations-pages.js';
import { useLocale } from './locale.js';

type CopyText = { de: string; en: string };

function bilingual(caught: unknown): CopyText {
  if (caught instanceof RequestFailed && caught.text) return caught.text;
  return { de: messages.de.loadFailed, en: messages.en.loadFailed };
}

export function SignInPage() {
  const { lang, copy } = useLocale();
  const [step, setStep] = useState<LoginResult['step'] | 'start'>('start');
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<CopyText | null>(null);
  const [pending, setPending] = useState(false);

  async function onLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const result = await postJson(
        '/api/v1/auth/login',
        {
          email: String(data.get('email') ?? ''),
          password: String(data.get('password') ?? ''),
          code: String(data.get('code') ?? ''),
        },
        loginResultSchema.parse,
      );
      setStep(result.step);
    } catch (caught) {
      setError(bilingual(caught));
    } finally {
      setPending(false);
    }
  }

  async function onSetup() {
    setPending(true);
    setError(null);
    try {
      const setup = await postJson('/api/v1/auth/totp/setup', {}, totpSetupSchema.parse);
      setSecret(setup.secret);
      setStep('enroll');
    } catch (caught) {
      setError(bilingual(caught));
    } finally {
      setPending(false);
    }
  }

  async function onConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get('code') ?? '');
    setPending(true);
    setError(null);
    try {
      const result = await postJson('/api/v1/auth/totp/confirm', { code }, loginResultSchema.parse);
      setStep(result.step);
      setSecret(null);
    } catch (caught) {
      setError(bilingual(caught));
    } finally {
      setPending(false);
    }
  }

  async function onPasskeyRegister() {
    setPending(true);
    setError(null);
    try {
      const options = await postJson(
        '/api/v1/auth/webauthn/register/options',
        {},
        (value) => value,
      );
      const credential = await startRegistration({ optionsJSON: options as never });
      const result = await postJson(
        '/api/v1/auth/webauthn/register/verify',
        credential,
        loginResultSchema.parse,
      );
      setStep(result.step);
    } catch (caught) {
      setError(bilingual(caught));
    } finally {
      setPending(false);
    }
  }

  async function onPasskey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get('email') ?? '');
    setPending(true);
    setError(null);
    try {
      const options = await postJson(
        '/api/v1/auth/webauthn/login/options',
        { email },
        (value) => value,
      );
      const credential = await startAuthentication({ optionsJSON: options as never });
      const result = await postJson(
        '/api/v1/auth/webauthn/login/verify',
        credential,
        loginResultSchema.parse,
      );
      setStep(result.step);
    } catch (caught) {
      setError(bilingual(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <section>
      <h2>{copy.signIn}</h2>
      <p>{copy.signInLead}</p>
      {step === 'staff' ? <p role="status">{copy.signedIn}</p> : null}
      {step === 'enroll' ? (
        <>
          <p>{copy.enrollLead}</p>
          <button type="button" onClick={() => void onSetup()} disabled={pending}>
            {copy.enrollTotp}
          </button>
          {secret ? <p>{secret}</p> : null}
          <form className="form" onSubmit={(event) => void onConfirm(event)}>
            <label>
              {copy.oneTimeCode}
              <input name="code" inputMode="numeric" autoComplete="one-time-code" required />
            </label>
            <div className="form-actions">
              <button type="submit" disabled={pending}>
                {copy.confirmCode}
              </button>
            </div>
          </form>
          <button type="button" onClick={() => void onPasskeyRegister()} disabled={pending}>
            {copy.passkeyRegister}
          </button>
        </>
      ) : null}
      {step !== 'staff' && step !== 'enroll' ? (
        <form className="form" onSubmit={(event) => void onLogin(event)}>
          <label>
            {copy.identifier}
            <input name="email" autoComplete="username" required />
          </label>
          <label>
            {copy.password}
            <input name="password" type="password" autoComplete="current-password" />
          </label>
          {step === 'mfa' ? (
            <label>
              {copy.oneTimeCode}
              <input name="code" inputMode="numeric" autoComplete="one-time-code" />
            </label>
          ) : null}
          <div className="form-actions">
            <button type="submit" disabled={pending}>
              {copy.signInSubmit}
            </button>
          </div>
        </form>
      ) : null}
      {step !== 'staff' ? (
        <form className="form" onSubmit={(event) => void onPasskey(event)}>
          <label>
            {copy.identifier}
            <input name="email" autoComplete="username" required />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={pending}>
              {copy.passkeySignIn}
            </button>
          </div>
        </form>
      ) : null}
      {error ? <p role="alert">{error[lang]}</p> : null}
    </section>
  );
}

export function AdminPage() {
  const { lang, copy } = useLocale();
  const [data, setData] = useState<AdminStaffList | null>(null);
  const [error, setError] = useState<CopyText | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getJson('/api/v1/admin/staff', adminStaffSchema.parse)
      .then((loaded) => {
        if (!cancelled) setData(loaded);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(bilingual(caught));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    try {
      await postJson(
        '/api/v1/admin/password',
        {
          currentPassword: String(form.get('current') ?? ''),
          newPassword: String(form.get('next') ?? ''),
        },
        (value) => value,
      );
      setNotice(copy.signedIn);
      event.currentTarget.reset();
    } catch (caught) {
      setError(bilingual(caught));
    }
  }

  async function readDirectory() {
    setBusy(true);
    setError(null);
    try {
      setData(await postJson('/api/v1/admin/directory/read', {}, adminStaffSchema.parse));
    } catch (caught) {
      setError(bilingual(caught));
    } finally {
      setBusy(false);
    }
  }

  async function deactivateMissing() {
    if (!data || data.missing.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      setData(
        await postJson(
          '/api/v1/admin/directory/deactivate',
          { ids: data.missing.map((person) => person.id) },
          adminStaffSchema.parse,
        ),
      );
    } catch (caught) {
      setError(bilingual(caught));
    } finally {
      setBusy(false);
    }
  }

  async function resetMfa(id: string) {
    setError(null);
    try {
      await postJson(`/api/v1/admin/staff/${id}/mfa/reset`, {}, (value) => value);
      setData(await getJson('/api/v1/admin/staff', adminStaffSchema.parse));
    } catch (caught) {
      setError(bilingual(caught));
    }
  }

  async function saveAccess(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    try {
      await postJson(
        `/api/v1/admin/staff/${id}/access`,
        {
          skillCodes: form.getAll('skill').map(String),
          categoryCodes: form.getAll('category').map(String),
        },
        (value) => value,
      );
      setNotice(copy.signedIn);
    } catch (caught) {
      setError(bilingual(caught));
    }
  }

  return (
    <section>
      <AdminLinks />
      <h2>{copy.adminTitle}</h2>
      <p>{copy.adminLead}</p>
      {error ? <p role="alert">{error[lang]}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      <h3>{copy.helpdeskStaff}</h3>
      <div className="form-actions">
        <button type="button" disabled={busy} onClick={() => void readDirectory()}>
          {copy.readDirectory}
        </button>
      </div>
      {data?.directory === 'unavailable' ? <p role="alert">{copy.directoryReadFailed}</p> : null}
      {data && data.added.length > 0 ? (
        <p role="status">
          {copy.addedStaff}{' '}
          {data.added.map((person) => `${person.displayName} (${person.email})`).join(', ')}
        </p>
      ) : null}
      {data && data.missing.length > 0 ? (
        <div role="alert">
          <p>{copy.missingLead}</p>
          <ul>
            {data.missing.map((person) => (
              <li key={person.id}>
                {person.displayName} ({person.email})
              </li>
            ))}
          </ul>
          <button type="button" disabled={busy} onClick={() => void deactivateMissing()}>
            {copy.deactivateMissing}
          </button>
        </div>
      ) : null}
      <form className="form" onSubmit={(event) => void changePassword(event)}>
        <label>
          {copy.currentPassword}
          <input name="current" type="password" autoComplete="current-password" required />
        </label>
        <label>
          {copy.newPassword}
          <input name="next" type="password" autoComplete="new-password" minLength={12} required />
        </label>
        <div className="form-actions">
          <button type="submit">{copy.changePassword}</button>
        </div>
      </form>
      {data?.staff
        .filter((person) => !person.isLocalAdmin && person.active)
        .map((person) => (
          <form
            key={person.id}
            className="form"
            onSubmit={(event) => void saveAccess(event, person.id)}
          >
            <h3>{person.displayName}</h3>
            <p>{person.email}</p>
            <fieldset className="check-list">
              <legend>{copy.skills}</legend>
              {data.skills.map((item) => (
                <label key={item.code}>
                  <input
                    type="checkbox"
                    name="skill"
                    value={item.code}
                    defaultChecked={person.skillCodes.includes(item.code)}
                  />
                  {lang === 'de' ? item.labelDe : item.labelEn}
                </label>
              ))}
            </fieldset>
            <fieldset className="check-list">
              <legend>{copy.categories}</legend>
              {data.categories.map((item) => (
                <label key={item.code}>
                  <input
                    type="checkbox"
                    name="category"
                    value={item.code}
                    defaultChecked={person.categoryCodes.includes(item.code)}
                  />
                  {lang === 'de' ? item.labelDe : item.labelEn}
                </label>
              ))}
            </fieldset>
            <div className="form-actions">
              <button type="submit">{copy.saveAccess}</button>
              <button type="button" onClick={() => void resetMfa(person.id)}>
                {copy.resetMfa}
              </button>
            </div>
          </form>
        ))}
      <h3>{copy.inactiveStaff}</h3>
      <ul>
        {data?.staff
          .filter((person) => !person.isLocalAdmin && !person.active)
          .map((person) => (
            <li key={person.id}>
              {person.displayName} ({person.email})
            </li>
          ))}
      </ul>
    </section>
  );
}
