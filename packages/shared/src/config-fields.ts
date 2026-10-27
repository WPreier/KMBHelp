export type ConfigField = {
  key: string;
  secret: boolean;
  textDe: string;
  textEn: string;
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
      'Die Netze, aus denen die Verwaltung eine Anmeldung verlangt. Kommagetrennt, zum Beispiel 192.168.36.0/24. Aus 127.0.0.0/8 entfällt die Anmeldung, solange die API nicht in Produktion läuft.',
    textEn:
      'The networks that must sign in for administration. Comma-separated, for example 192.168.36.0/24. From 127.0.0.0/8 sign-in is skipped while the API is not in production.',
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
      'Die Mandanten-Nummer von Microsoft 365. Mail und Kalender warten auf sie. Der Versand selbst folgt in Phase 4.',
    textEn:
      'The Microsoft 365 tenant id. Mail and calendar wait for it. Sending itself follows in phase 4.',
  },
  {
    key: 'GRAPH_CLIENT_ID',
    secret: false,
    textDe: 'Die Anwendungsnummer, unter der KMBHelp bei Microsoft 365 bekannt ist.',
    textEn: 'The application id under which KMBHelp is known to Microsoft 365.',
  },
  {
    key: 'GRAPH_CLIENT_SECRET',
    secret: true,
    textDe:
      'Das Geheimnis der Microsoft-365-Anwendung. Es wird nicht angezeigt. Ohne Admin-Consent holt die API noch kein Token.',
    textEn:
      'The Microsoft 365 application secret. It is not shown. Without admin consent the API still does not request a token.',
  },
  {
    key: 'GRAPH_MAILBOX',
    secret: false,
    textDe:
      'Das Postfach helpdesk@kmbcloud.at, aus dem später die Mails gelesen und beantwortet werden.',
    textEn: 'The mailbox helpdesk@kmbcloud.at from which mail will later be read and answered.',
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
    key: 'AI_ENDPOINT',
    secret: false,
    textDe:
      'Die Adresse des KI-Anbieters. Solange sie fehlt, verteilt KMBHelp nur nach Regeln. Ein Modell wird erst in Phase 6 gerufen.',
    textEn:
      'The model provider address. While it is missing, KMBHelp assigns work by rules only. A model is called in phase 6.',
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
      'Der Schlüssel des KI-Anbieters. Er wird nicht angezeigt und vor Phase 6 nicht benutzt.',
    textEn: 'The model provider key. It is not shown and is not used before phase 6.',
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
    const value = (env[field.key] ?? '').trim();
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
