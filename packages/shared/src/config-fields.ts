import {
  defaultAiProvider,
  defaultInternalMailDomains,
  defaultMailPrompt,
} from './mail-prompt.js';

export type ConfigField = {
  key: string;
  secret: boolean;
  textDe: string;
  textEn: string;
};

export const defaultCalendarMinutes = '30';
export const defaultCalendarDelayP1 = '0';
export const defaultCalendarDelayP2 = '60';
export const defaultCalendarDelayP3 = '240';
export const defaultFallbackCategory = 'printer';

export const defaultWorkerSchedule =
  '00:00-08:00=30,08:00-12:00=10,12:00-12:30=0,12:30-17:00=10,17:00-24:00=30';

const shownWhenEmpty: Record<string, string> = {
  CALENDAR_DEFAULT_MINUTES: defaultCalendarMinutes,
  CALENDAR_DELAY_P1: defaultCalendarDelayP1,
  CALENDAR_DELAY_P2: defaultCalendarDelayP2,
  CALENDAR_DELAY_P3: defaultCalendarDelayP3,
  FALLBACK_CATEGORY: defaultFallbackCategory,
  WORKER_SCHEDULE: defaultWorkerSchedule,
  ACCESS_LOG_RETENTION_DAYS: '90',
  AI_PROVIDER: defaultAiProvider,
  INTERNAL_MAIL_DOMAINS: defaultInternalMailDomains,
  AI_MAIL_PROMPT: defaultMailPrompt,
};

export const configFields: readonly ConfigField[] = [
  {
    key: 'DATABASE_URL',
    secret: true,
    textDe:
      'Die Adresse der PostgreSQL-Datenbank. Tickets, Sitzungen und die gespeicherten Zuordnungen liegen dort. Ohne sie kann der Helpdesk nichts behalten.',
    textEn:
      'The PostgreSQL address. Tickets, sessions and the stored assignments live there. Without it the helpdesk cannot keep anything.',
  },
  {
    key: 'API_HOST',
    secret: false,
    textDe:
      'Die Netzadresse, an der die API zuhört. 127.0.0.1 heißt: nur dieser Rechner erreicht sie direkt. Ein neuer Wert gilt nach dem Neustart der API.',
    textEn:
      'The address where the API listens. 127.0.0.1 means only this computer reaches it directly. A new value applies after the API restarts.',
  },
  {
    key: 'API_PORT',
    secret: false,
    textDe:
      'Der TCP-Port der API. Die Webseite spricht darüber mit dem Server, Standard ist 3000. Ein neuer Wert gilt nach dem Neustart der API.',
    textEn:
      'The API TCP port. The website talks to the server through it. 3000 is the usual port. A new value applies after the API restarts.',
  },
  {
    key: 'SESSION_SECRET',
    secret: true,
    textDe:
      'Der Schlüssel, mit dem Sitzungen und Einmalcodes versiegelt werden. In Produktion muss er mindestens 16 Zeichen haben, sonst startet die API nicht.',
    textEn:
      'The key that seals sessions and one-time codes. In production it must be at least 16 characters, or the API refuses to start.',
  },
  {
    key: 'ALLOW_TEST_AUTH',
    secret: false,
    textDe:
      'Erlaubt den Test-Kopf für Staff-Aufrufe. Nur außerhalb der Produktion und nur mit dem Wert 1. In Produktion darf das Feld leer bleiben.',
    textEn:
      'Allows the staff test header. Only outside production, and only when the value is 1. In production the field stays empty.',
  },
  {
    key: 'ADMIN_IP_ALLOWLIST',
    secret: false,
    textDe:
      'Die Netze, aus denen die Verwaltung eine Anmeldung verlangt. Kommagetrennt, zum Beispiel 192.168.36.0/24. Jeder Zugriff von 127.0.0.0/8 oder ::1 ist ohne Anmeldung frei, auch in Produktion. Eine weitergeleitete Adresse zählt dafür nicht.',
    textEn:
      'The networks that must sign in for administration. Comma-separated, for example 192.168.36.0/24. Every connection from 127.0.0.0/8 or ::1 is open without sign-in, including production. A forwarded address does not count.',
  },
  {
    key: 'LDAPS_URL',
    secret: false,
    textDe:
      'Der Domänencontroller für die erste Passwortprüfung. Für diese Kanzlei ist das ldaps://MADC1.kmbcloud.at:636.',
    textEn:
      'The domain controller for the first password check. For this firm that is ldaps://MADC1.kmbcloud.at:636.',
  },
  {
    key: 'LDAPS_BIND_DN',
    secret: false,
    textDe:
      'Das Dienstkonto, mit dem KMBHelp im Verzeichnis sucht. Es ist kein Domänenadmin. Die Anmeldung der Mitarbeiter benutzt ihr eigenes Passwort.',
    textEn:
      'The service account KMBHelp uses to search the directory. It is not a domain admin. Staff sign in with their own password.',
  },
  {
    key: 'LDAPS_BIND_PASSWORD',
    secret: true,
    textDe:
      'Das Passwort des Dienstkontos. Es wird nicht angezeigt und nicht ins Protokoll geschrieben. Ein leeres Feld beim Speichern lässt den hinterlegten Wert stehen.',
    textEn:
      'The service-account password. It is not shown and not written to the log. Saving an empty field keeps the stored value.',
  },
  {
    key: 'LDAPS_BASE_DN',
    secret: false,
    textDe: 'Die Suchbasis im Verzeichnis. Die Kanzlei sucht unter DC=kmbcloud,DC=at.',
    textEn: 'The directory search base. The firm searches under DC=kmbcloud,DC=at.',
  },
  {
    key: 'LDAPS_GROUP_DN',
    secret: false,
    textDe:
      'Die Gruppe HelpdeskAdmins. Nur ihre Mitglieder werden als Helpdeskmitarbeiter geführt. Der Name im Verzeichnis ist der cn, der Schlüssel die E-Mail.',
    textEn:
      'The HelpdeskAdmins group. Only its members are kept as helpdesk staff. The directory name is cn, and the key is the email address.',
  },
  {
    key: 'LDAPS_CA_FILE',
    secret: false,
    textDe:
      'Ein Dateipfad zum Zertifikat des Domänencontrollers, falls es nicht als Text hinterlegt ist. Ein Blattzertifikat wird gepinnt, ein CA-Zertifikat wird als Vertrauensanker benutzt.',
    textEn:
      'A file path to the domain controller certificate, when it is not stored as text. A leaf certificate is pinned. A CA certificate is used as a trust anchor.',
  },
  {
    key: 'LDAPS_CA_PEM',
    secret: true,
    textDe:
      'Das Zertifikat des Domänencontrollers als PEM-Text. Der Inhalt wird nicht angezeigt. Die Prüfung vergleicht es mit dem Zertifikat, das der Server live zeigt.',
    textEn:
      'The domain controller certificate as PEM text. The contents are not shown. The check compares it with the certificate the server presents live.',
  },
  {
    key: 'SYSLOG_HOST',
    secret: false,
    textDe:
      'Der Rechner, der die Meldungen empfängt. Die Prüfung schickt ein UDP-Datagramm dorthin. UDP bestätigt nicht, dass es angekommen ist.',
    textEn:
      'The computer that receives the messages. The check sends a UDP datagram there. UDP does not confirm that it arrived.',
  },
  {
    key: 'SYSLOG_PORT',
    secret: false,
    textDe: 'Der UDP-Port des Syslog-Empfängers. Der übliche Port ist 514.',
    textEn: 'The syslog receiver UDP port. The usual port is 514.',
  },
  {
    key: 'SYSLOG_NAME',
    secret: false,
    textDe:
      'Der Name, mit dem KMBHelp die Meldung versendet. Im RFC-5424-Satz ist das der APP-NAME. Der HOSTNAME bleibt der Rechnername. Standard ist KMBHelp.',
    textEn:
      'The name KMBHelp sends the message under. In an RFC 5424 line that is the APP-NAME. The HOSTNAME stays the machine name. The default is KMBHelp.',
  },
  {
    key: 'SYSLOG_FACILITY',
    secret: false,
    textDe:
      'Das Fach beim Empfänger. Standard ist local0. Zusammen mit Informational, Warning oder Error entsteht daraus die Prioritätszahl am Anfang der Zeile.',
    textEn:
      'The receiver shelf. The default is local0. Together with Informational, Warning or Error it becomes the priority number at the start of the line.',
  },
  {
    key: 'SYSLOG_UTC_OFFSET',
    secret: false,
    textDe:
      'Die Uhrzeit in der Syslog-Zeile. +01:00 ist die Winterzeit der Kanzlei. Im Sommer trägt man +02:00 ein, dann steht in der Zeile die örtliche Uhr und nicht UTC.',
    textEn:
      'The clock in the syslog line. +01:00 is the firm’s winter time. In summer set +02:00, and the line shows the local clock instead of UTC.',
  },
  {
    key: 'GRAPH_TENANT_ID',
    secret: false,
    textDe:
      'Die Verzeichnis-ID (Tenant) aus der App-Registrierung im Microsoft-Entra-Verwaltungszentrum. Sie steht auf der Übersichtsseite der Anwendung. Zusammen mit Client und Geheimnis holt der Worker ein Token und kann damit alle Postfächer und Kalender lesen, für die der Admin-Consent erteilt wurde.',
    textEn:
      'The directory id (tenant) from the app registration in the Microsoft Entra admin center. It is on the application overview. Together with the client and the secret, the worker requests a token and can then read every mailbox and calendar covered by admin consent.',
  },
  {
    key: 'GRAPH_CLIENT_ID',
    secret: false,
    textDe:
      'Die Anwendungs-ID (Client) derselben App-Registrierung. Unter API-Berechtigungen werden als Anwendungsberechtigungen Mail.Read, Mail.Send und Calendars.ReadWrite eingetragen und der Admin-Consent erteilt. Ohne Consent bleibt der Worker bei not_configured.',
    textEn:
      'The application id (client) of the same app registration. Under API permissions, add the application permissions Mail.Read, Mail.Send and Calendars.ReadWrite and grant admin consent. Without consent the worker stays at not_configured.',
  },
  {
    key: 'GRAPH_CLIENT_SECRET',
    secret: true,
    textDe:
      'Das Client-Geheimnis aus Zertifikate und Geheimnisse der App-Registrierung. Es wird nicht angezeigt und nur in der lokalen Geheimdatei gespeichert, nie in Git. Ein neues Geheimnis gilt nach dem Speichern für den nächsten Worker-Lauf.',
    textEn:
      'The client secret from Certificates and secrets of the app registration. It is not shown and is stored only in the local secrets file, never in git. A new secret applies on the next worker run.',
  },
  {
    key: 'GRAPH_MAILBOX',
    secret: false,
    textDe:
      'Das Postfach helpdesk@kmbcloud.at. Der Worker liest es im Zeitplan und verschickt Antworten von hier. Termine legt er in den Kalender des zugewiesenen Mitarbeiters.',
    textEn:
      'The mailbox helpdesk@kmbcloud.at. The worker reads it on the schedule and sends replies from here. It creates events on the assigned employee’s calendar.',
  },
  {
    key: 'ONCALL_EMAIL',
    secret: false,
    textDe:
      'Die E-Mail-Adresse der Bereitschaft. Bei einem neuen Ticket mit Priorität P1 geht eine kurze Mail dorthin, sobald Microsoft 365 konfiguriert ist. Leer heißt: keine Bereitschaftsmail.',
    textEn:
      'The on-call email address. A new priority-P1 ticket sends a short mail there once Microsoft 365 is configured. Empty means no on-call mail.',
  },
  {
    key: 'FALLBACK_CATEGORY',
    secret: false,
    textDe:
      'Der Kategorie-Code, nachdem die KI die Mail als Support bestätigt hat und selbst keinen Katalogcode nennt. Standard ist printer (Drucker). Ohne erreichbare KI entsteht kein Ticket. Der Code muss in der Tabelle category stehen. Die Liste kommt aus dem Ticketkatalog und wird mit pnpm db:seed in PostgreSQL geschrieben. Eine eigene Seite zum Anlegen von Kategorien gibt es noch nicht. Auf der Verwaltung werden Kategorien nur den Mitarbeitern zugeordnet.',
    textEn:
      'The category code after the model confirms the mail is support and names no catalog code itself. The default is printer. Without a reachable model no ticket is created. The code must exist in the category table. The list comes from the ticket catalog and is written to PostgreSQL by pnpm db:seed. There is no page yet for creating categories. Administration only assigns categories to employees.',
  },
  {
    key: 'CALENDAR_DEFAULT_MINUTES',
    secret: false,
    textDe:
      'Die Dauer eines neuen Termins in Minuten, solange kein Modell eine eigene Schätzung liefert. Standard ist 30. Sobald die KI in Phase 6 eine Dauer nennt, ersetzt diese Zahl die Vorgabe für genau dieses Ticket.',
    textEn:
      'The length of a new appointment in minutes, until a model supplies its own estimate. The default is 30. Once the phase 6 model names a duration, that number replaces the default for that ticket.',
  },
  {
    key: 'CALENDAR_DELAY_P1',
    secret: false,
    textDe:
      'Minuten nach dem Anlegen, wann ein P1-Termin beginnt. Standard ist 0: der Termin startet mit der Erstellung des Tickets.',
    textEn:
      'Minutes after creation when a P1 appointment starts. The default is 0: the appointment starts when the ticket is created.',
  },
  {
    key: 'CALENDAR_DELAY_P2',
    secret: false,
    textDe:
      'Minuten nach dem Anlegen, wann ein P2-Termin beginnt. Standard ist 60, also eine Stunde nach der Erstellung.',
    textEn:
      'Minutes after creation when a P2 appointment starts. The default is 60, one hour after creation.',
  },
  {
    key: 'CALENDAR_DELAY_P3',
    secret: false,
    textDe:
      'Minuten nach dem Anlegen, wann ein P3-Termin beginnt. Standard ist 240, also vier Stunden nach der Erstellung.',
    textEn:
      'Minutes after creation when a P3 appointment starts. The default is 240, four hours after creation.',
  },
  {
    key: 'WORKER_SCHEDULE',
    secret: false,
    textDe:
      'Wann der Worker Microsoft 365 abfragt. Jeder Abschnitt ist von-bis=Minuten, getrennt durch Komma. 0 bedeutet: in diesem Abschnitt nicht abfragen. Standard: 00:00-08:00=30, 08:00-12:00=10, 12:00-12:30=0, 12:30-17:00=10, 17:00-24:00=30. Die Uhr ist SYSLOG_UTC_OFFSET, Winter +01:00.',
    textEn:
      'When the worker calls Microsoft 365. Each part is from-to=minutes, separated by commas. 0 means do not call during that part. Default: 00:00-08:00=30, 08:00-12:00=10, 12:00-12:30=0, 12:30-17:00=10, 17:00-24:00=30. The clock is SYSLOG_UTC_OFFSET, winter +01:00.',
  },
  {
    key: 'ACCESS_LOG_RETENTION_DAYS',
    secret: false,
    textDe:
      'Nach wie vielen Tagen IP-Zeilen in access_log gelöscht werden. Standard ist 90. Der Knopf Reviews auf der Vorgangsseite löscht die älteren Zeilen. Öffentliche Suchbegriffe werden nicht gespeichert.',
    textEn:
      'After how many days IP rows in access_log are deleted. The default is 90. The review button on the process page deletes older rows. Public search terms are not stored.',
  },
  {
    key: 'PUBLIC_ORIGIN',
    secret: false,
    textDe:
      'Die Adresse in Antwortmail und Kalender. Lokal http://127.0.0.1:5173, in Produktion https://helpdesk.kmbcloud.at.',
    textEn:
      'The address used in the reply and the calendar entry. Locally http://127.0.0.1:5173, in production https://helpdesk.kmbcloud.at.',
  },
  {
    key: 'WEBAUTHN_RP_ID',
    secret: false,
    textDe:
      'Der Hostname, an den ein Passkey gebunden ist. Er muss zum Host der Origin passen, sonst lässt sich der Passkey nicht benutzen.',
    textEn:
      'The hostname a passkey is bound to. It must match the origin host, or the passkey cannot be used.',
  },
  {
    key: 'WEBAUTHN_ORIGIN',
    secret: false,
    textDe:
      'Die genaue Web-Adresse, für die der Passkey gilt. Lokal ist das http://127.0.0.1:5173, in Produktion die Helpdesk-Adresse.',
    textEn:
      'The exact web address the passkey is for. Locally that is http://127.0.0.1:5173. In production it is the helpdesk address.',
  },
  {
    key: 'AI_PROVIDER',
    secret: false,
    textDe:
      'Der Name des KI-Anbieters. Derzeit grok. Später können gemini, deepseek oder other denselben Aufruf nutzen. Der Name wählt keine Adresse. Der Aufruf geht an AI_ENDPOINT.',
    textEn:
      'The model provider name. It is grok for now. Later gemini, deepseek or other can use the same call. The name does not choose an address. The call goes to AI_ENDPOINT.',
  },
  {
    key: 'INTERNAL_MAIL_DOMAINS',
    secret: false,
    textDe:
      'Domänen interner Absender, eine pro Zeile oder durch Komma getrennt. Nur diese Absender können ein Support-Ticket auslösen. Derzeit kmb-steuerberatung.at, ght.at und koller-rohrschach.at. Ein leeres Feld verwendet diese drei.',
    textEn:
      'Domains of internal senders, one per line or separated by commas. Only these senders can open a support ticket. They are kmb-steuerberatung.at, ght.at and koller-rohrschach.at. An empty field uses those three.',
  },
  {
    key: 'AI_MAIL_PROMPT',
    secret: false,
    textDe:
      'Der Auftrag an den KI-Anbieter. Die Antwort beginnt mit JA oder NEIN und einer Begründung in einem Satz. JA heißt: die Mail ist ein Support-Anliegen und kann ein Ticket werden. NEIN heißt: Newsletter, Werbung, automatische Nachricht oder Spam. Ein leeres Feld verwendet den eingebauten Auftrag.',
    textEn:
      'The instruction for the model provider. The answer starts with JA or NEIN and one sentence of reasoning. JA means the mail is a support request and may become a ticket. NEIN means newsletter, advertising, an automatic notice or spam. An empty field uses the built-in instruction.',
  },
  {
    key: 'AI_ENDPOINT',
    secret: false,
    textDe:
      'Die https-Adresse des KI-Anbieters. Ein Aufruf erfolgt nur zusammen mit EU-Region, Vertrag und Schlüssel. Ohne erreichbare KI bleibt eine Helpdesk-Mail ungelesen und wird kein Ticket. Die Suche bleibt dann beim Satz aus Phase 2.',
    textEn:
      'The https address of the model provider. A call happens only together with an EU region, the contract and the key. Without a reachable model a helpdesk mail stays unread and does not become a ticket. Search then keeps the phase 2 sentence.',
  },
  {
    key: 'AI_REGION',
    secret: false,
    textDe:
      'Die Region, in der der Anbieter verarbeiten soll. Gewünscht ist die EU, sobald ein Vertrag steht.',
    textEn:
      'The region where the provider should process data. The EU is the intended region once a contract exists.',
  },
  {
    key: 'AI_API_KEY',
    secret: true,
    textDe:
      'Der Schlüssel des KI-Anbieters. Er wird nicht angezeigt. Ohne die übrigen drei Angaben geht er an kein Modell.',
    textEn:
      'The model provider key. It is not shown. Without the other three values it is not sent to a model.',
  },
  {
    key: 'AI_AVV_REFERENCE',
    secret: false,
    textDe:
      'Ein Hinweis auf den Auftragsverarbeitungsvertrag. Ohne diesen Vertrag geht kein Tickettext an ein Modell.',
    textEn:
      'A reference to the processing agreement. Without that contract no ticket text goes to a model.',
  },
  {
    key: 'AI_AUTO_REPLY_CATEGORIES',
    secret: false,
    textDe:
      'Kategorie-Codes, die eine veröffentlichte FAQ automatisch beantworten darf. Leer heißt: nie automatisch schließen. Die Konfidenz muss mindestens 0,85 sein, und der Text darf keine SVNR, IBAN, Karte oder ein Geburtsdatum enthalten.',
    textEn:
      'Category codes a published FAQ may answer automatically. Empty means never close automatically. Confidence must be at least 0.85, and the text must not contain a social security number, an IBAN, a card or a birth date.',
  },
  {
    key: 'VITE_PUBLIC_URL_WWW',
    secret: false,
    textDe:
      'Das Ziel des Links www in der Kopfzeile. Die Webseite liest es beim Start ihres eigenen Prozesses.',
    textEn:
      'The target of the www link in the header. The website reads it when its own process starts.',
  },
  {
    key: 'VITE_PUBLIC_URL_HOME',
    secret: false,
    textDe: 'Das Ziel des Links Home. Externe Ziele öffnen in einem neuen Fenster.',
    textEn: 'The target of the Home link. External targets open in a new window.',
  },
  {
    key: 'VITE_PUBLIC_URL_WIKI',
    secret: false,
    textDe: 'Das Ziel des Links Wiki, rechts neben Home.',
    textEn: 'The target of the Wiki link, to the right of Home.',
  },
  {
    key: 'LOCAL_ADMIN_USERNAME',
    secret: false,
    textDe:
      'Der Benutzername des einen lokalen Admins. Angelegt wird er mit pnpm install:helpdesk, nicht durch dieses Feld allein.',
    textEn:
      'The username of the single local admin. pnpm install:helpdesk creates the account. This field alone does not.',
  },
  {
    key: 'LOCAL_ADMIN_PASSWORD',
    secret: true,
    textDe:
      'Das Installationspasswort des lokalen Admins. Es liegt danach nur als Argon2id-Hash in der Datenbank. Das Feld zeigt es nie an.',
    textEn:
      'The local admin installation password. Afterwards only an Argon2id hash is stored in the database. The field never shows it.',
  },
];

const secretKeys = new Set(configFields.filter((field) => field.secret).map((field) => field.key));

export function configField(key: string): ConfigField | undefined {
  return configFields.find((field) => field.key === key);
}

export function isSecretConfig(key: string): boolean {
  return secretKeys.has(key);
}

export function describeConfig(env: NodeJS.ProcessEnv): Array<{
  key: string;
  secret: boolean;
  state: 'set' | 'missing' | 'shown';
  value: string;
  textDe: string;
  textEn: string;
}> {
  return configFields.map((field) => {
    const raw = (env[field.key] ?? '').trim();
    const value = raw === '' ? (shownWhenEmpty[field.key] ?? '') : raw;
    if (field.secret) {
      return {
        ...field,
        state: value === '' ? 'missing' : 'set',
        value: '',
      };
    }
    return {
      ...field,
      state: value === '' ? 'missing' : 'shown',
      value,
    };
  });
}
