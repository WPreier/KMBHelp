import {
  adminStaffSchema,
  loginResultSchema,
  messages,
  sessionViewSchema,
  totpCheckSchema,
  totpSetupSchema,
  type AdminStaffList,
  type LoginResult,
} from '@kmbhelp/shared';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getJson, postJson, RequestFailed } from './api.js';
import { useLocale } from './locale.js';

type CopyText = { de: string; en: string };

function bilingual(caught: unknown): CopyText {
  if (caught instanceof RequestFailed && caught.text) return caught.text;
  return { de: messages.de.loadFailed, en: messages.en.loadFailed };
}

export function SignInPage() {
  const { lang, copy } = useLocale();
  const navigate = useNavigate();
  const [step, setStep] = useState<LoginResult['step'] | 'start'>('start');
  const [presentTotp, setPresentTotp] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauth, setOtpauth] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [account, setAccount] = useState<{ role: string; email: string } | null>(null);
  const [passkeyResult, setPasskeyResult] = useState<'ok' | 'bad' | null>(null);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<CopyText | null>(null);
  const [pending, setPending] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');

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
      finish(result);
      if (result.step === 'enroll' && result.presentTotp) await onSetup();
    } catch (caught) {
      setError(bilingual(caught));
    } finally {
      setPending(false);
    }
  }

  function finish(result: LoginResult) {
    setStep(result.step);
    if (result.step === 'enroll') setPresentTotp(result.presentTotp);
    if (result.step !== 'staff') return;
    window.dispatchEvent(new Event('kmbhelp-session'));
    if (result.isLocalAdmin) navigate('/verwaltung');
  }

  useEffect(() => {
    let cancelled = false;
    void getJson('/api/v1/auth/session', sessionViewSchema.parse)
      .then((session) => {
        if (cancelled || !session.signedIn || session.internalAdmin || session.isLocalAdmin) return;
        setStep('staff');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (step !== 'staff' || preview) return;
    let cancelled = false;
    void (async () => {
      try {
        const session = await getJson('/api/v1/auth/session', sessionViewSchema.parse);
        if (cancelled || !session.signedIn || session.internalAdmin || session.isLocalAdmin) return;
        setAccount({
          role: session.audience === 'user' ? copy.roleUser : copy.roleAdministrator,
          email: session.email || session.displayName || '',
        });
        const setup = await postJson('/api/v1/auth/totp/setup', {}, totpSetupSchema.parse);
        if (cancelled) return;
        setSecret(setup.secret);
        setOtpauth(setup.otpauth);
      } catch (caught) {
        if (!cancelled) setError(bilingual(caught));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [copy.roleAdministrator, copy.roleUser, preview, step]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('vorschau') !== '1') return;
    setPreview(true);
    setStep('enroll');
    setSecret('JBSWY3DPEHPK3PXP');
    setOtpauth(
      'otpauth://totp/KMBHelp:vorschau?secret=JBSWY3DPEHPK3PXP&issuer=KMBHelp&algorithm=SHA1&digits=6&period=30',
    );
  }, []);

  useEffect(() => {
    if (!otpauth) {
      setQr(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(otpauth, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    }).then((url) => {
      if (!cancelled) setQr(url);
    });
    return () => {
      cancelled = true;
    };
  }, [otpauth]);

  async function onSetup() {
    setPending(true);
    setError(null);
    try {
      const setup = await postJson('/api/v1/auth/totp/setup', {}, totpSetupSchema.parse);
      setSecret(setup.secret);
      setOtpauth(setup.otpauth);
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
      setSecret(null);
      finish(result);
    } catch (caught) {
      setError(bilingual(caught));
    } finally {
      setPending(false);
    }
  }

  async function onTestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get('code') ?? '');
    setPending(true);
    setPasskeyResult(null);
    setError(null);
    try {
      const result = await postJson('/api/v1/auth/totp/check', { code }, totpCheckSchema.parse);
      setPasskeyResult(result.ok ? 'ok' : 'bad');
    } catch {
      setPasskeyResult('bad');
    } finally {
      setPending(false);
    }
  }

  async function onSignOut() {
    setPending(true);
    setError(null);
    try {
      await postJson('/api/v1/auth/logout', {}, (value) => value);
      setStep('start');
      setSecret(null);
      setOtpauth(null);
      setAccount(null);
      setPasskeyResult(null);
      window.dispatchEvent(new Event('kmbhelp-session'));
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
      finish(result);
    } catch (caught) {
      setError(bilingual(caught));
    } finally {
      setPending(false);
    }
  }

  async function onPasskey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get('code') ?? '');
    setPending(true);
    setError(null);
    try {
      const result = await postJson(
        '/api/v1/auth/login',
        { email: loginEmail, code },
        loginResultSchema.parse,
      );
      finish(result);
      if (result.step === 'enroll' && result.presentTotp) await onSetup();
    } catch (caught) {
      setError(bilingual(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <section>
      <h2>{copy.signIn}</h2>
      {error ? (
        <p className="form-error" role="alert">
          {error[lang]}
        </p>
      ) : null}
      {step === 'staff' ? (
        <>
          <p role="status">
            {account
              ? copy.signedInAs.replace('{role}', account.role).replace('{email}', account.email)
              : copy.signedIn}
          </p>
          <button type="button" onClick={() => void onSignOut()} disabled={pending}>
            {copy.signOutNow}
          </button>
          <p>{copy.authenticatorLead}</p>
          {qr ? (
            <img className="totp-qr" src={qr} width={320} height={320} alt={copy.scanCode} />
          ) : null}
          {secret ? (
            <p className="totp-secret">
              {copy.authenticatorSecret}
              <br />
              <code>{secret}</code>
            </p>
          ) : null}
          <form className="passkey-test" onSubmit={(event) => void onTestCode(event)}>
            <label>
              {copy.oneTimeCode}
              <input name="code" inputMode="numeric" autoComplete="one-time-code" required />
            </label>
            <button type="submit" disabled={pending}>
              {copy.passkeyTest}
            </button>
          </form>
          {passkeyResult ? (
            <p className={passkeyResult === 'bad' ? 'form-error' : undefined} role="status">
              {passkeyResult === 'ok' ? copy.passkeyAccepted : copy.passkeyRejected}
            </p>
          ) : null}
        </>
      ) : null}
      {step === 'enroll' ? (
        <>
          <p>{copy.enrollLead}</p>
          {!presentTotp || error ? (
            <button type="button" onClick={() => void onSetup()} disabled={pending}>
              {copy.enrollTotp}
            </button>
          ) : null}
          {qr ? (
            <img className="totp-qr" src={qr} width={320} height={320} alt={copy.scanCode} />
          ) : null}
          {secret ? <p className="totp-secret">{secret}</p> : null}
          {preview ? <p className="form-error">{copy.previewCode}</p> : null}
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
            <input
              name="email"
              autoComplete="username"
              required
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
            />
          </label>
          <label>
            {copy.password}
            <input name="password" type="password" autoComplete="current-password" />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={pending}>
              {copy.signInSubmit}
            </button>
          </div>
        </form>
      ) : null}
      {step !== 'staff' && step !== 'enroll' ? (
        <form className="form" onSubmit={(event) => void onPasskey(event)}>
          <p>{copy.passkeyHint}</p>
          <label>
            {copy.passkeyCode}
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]{6}"
              required
            />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={pending}>
              {copy.passkeySignIn}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

export function QrSignInPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { copy } = useLocale();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const options = await postJson(`/api/v1/auth/qr/${token}/options`, {}, (value) => value);
        const credential = await startAuthentication({ optionsJSON: options as never });
        await postJson(`/api/v1/auth/qr/${token}/verify`, credential, loginResultSchema.parse);
        if (cancelled) return;
        window.dispatchEvent(new Event('kmbhelp-session'));
        navigate('/');
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [navigate, token]);

  return (
    <section>
      <h2>{copy.signIn}</h2>
      <p>{copy.passkeyQrLead}</p>
      {failed ? <p role="alert">{copy.passkeyQrFailed}</p> : null}
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
      .then(async (loaded) => {
        if (cancelled) return;
        setData(loaded);
        document.body.classList.add('wait');
        try {
          const synced = await postJson('/api/v1/admin/directory/read', {}, adminStaffSchema.parse);
          if (!cancelled) setData(synced);
        } catch (caught) {
          if (!cancelled) setError(bilingual(caught));
        } finally {
          document.body.classList.remove('wait');
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(bilingual(caught));
      });
    return () => {
      cancelled = true;
      document.body.classList.remove('wait');
    };
  }, []);

  async function readDirectory() {
    setBusy(true);
    setError(null);
    document.body.classList.add('wait');
    try {
      setData(await postJson('/api/v1/admin/directory/read', {}, adminStaffSchema.parse));
    } catch (caught) {
      setError(bilingual(caught));
    } finally {
      document.body.classList.remove('wait');
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
      {error ? <p role="alert">{error[lang]}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      <div className="title-row">
        <h2>{copy.itStaff}</h2>
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
