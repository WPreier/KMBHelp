import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { messages, type DashboardRange, type Lang } from '@kmbhelp/shared';
import { createHelpdeskClient } from './src/client.js';
import { canShowStaffDetail, presentStaffTicket, type StaffRow } from './src/gate.js';
import { apiOrigin } from './src/origin.js';
import type { SessionCookies } from './src/session.js';

type Screen = 'file' | 'list' | 'faq' | 'search' | 'staff' | 'dashboard' | 'signIn';

const ranges: DashboardRange[] = ['day', 'week', 'month', 'quarter', 'year'];

export default function App() {
  const [lang, setLang] = useState<Lang>('de');
  const [screen, setScreen] = useState<Screen>('file');
  const [session, setSession] = useState<SessionCookies | null>(null);
  const [deviceUnlocked, setDeviceUnlocked] = useState(false);
  const [note, setNote] = useState('');
  const text = messages[lang];
  const client = createHelpdeskClient({
    origin: apiOrigin(process.env),
    fetch: globalThis.fetch.bind(globalThis),
    session,
  });

  async function unlock(): Promise<boolean> {
    if (deviceUnlocked) return true;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'KMBHelp',
      cancelLabel: lang === 'de' ? 'Abbrechen' : 'Cancel',
      disableDeviceFallback: false,
    });
    if (!result.success) return false;
    setDeviceUnlocked(true);
    return true;
  }

  async function openStaff(next: 'staff' | 'dashboard') {
    if (!session) {
      setScreen('signIn');
      return;
    }
    const view = await client.session();
    const open = await unlock();
    if (!canShowStaffDetail(view.signedIn, open)) {
      setNote(lang === 'de' ? 'Die Mitarbeiteransicht bleibt zu.' : 'The staff view stays closed.');
      return;
    }
    setScreen(next);
  }

  return (
    <View style={styles.page}>
      <View style={styles.bar}>
        <Text style={styles.brand}>KMBHelp</Text>
        <Pressable onPress={() => setLang(lang === 'de' ? 'en' : 'de')}>
          <Text style={styles.link}>{lang === 'de' ? 'English' : 'Deutsch'}</Text>
        </Pressable>
      </View>
      <View style={styles.nav}>
        <Nav label={text.fileTicket} onPress={() => setScreen('file')} />
        <Nav label={text.openTickets} onPress={() => setScreen('list')} />
        <Nav label={text.guides} onPress={() => setScreen('faq')} />
        <Nav label={text.searchSubmit} onPress={() => setScreen('search')} />
        <Nav label={text.signIn} onPress={() => void openStaff('staff')} />
        <Nav label={text.dashboardTitle} onPress={() => void openStaff('dashboard')} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        {note ? <Text style={styles.note}>{note}</Text> : null}
        {screen === 'file' ? <FileScreen lang={lang} client={client} /> : null}
        {screen === 'list' ? <ListScreen lang={lang} client={client} /> : null}
        {screen === 'faq' ? <FaqScreen lang={lang} client={client} /> : null}
        {screen === 'search' ? <SearchScreen lang={lang} client={client} /> : null}
        {screen === 'signIn' ? (
          <SignInScreen
            lang={lang}
            client={client}
            onSession={async (cookies) => {
              if (!cookies) return;
              await SecureStore.setItemAsync('kmbhelp_session', cookies.session);
              await SecureStore.setItemAsync('kmbhelp_csrf', cookies.csrf);
              setSession(cookies);
              setNote(
                lang === 'de'
                  ? 'Angemeldet. Das Gerät ist noch zu.'
                  : 'Signed in. The device is still locked.',
              );
            }}
          />
        ) : null}
        {screen === 'staff' ? <StaffScreen lang={lang} client={client} /> : null}
        {screen === 'dashboard' ? <DashboardScreen lang={lang} client={client} /> : null}
      </ScrollView>
    </View>
  );
}

function Nav(props: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} style={styles.navItem}>
      <Text style={styles.navText}>{props.label}</Text>
    </Pressable>
  );
}

type Client = ReturnType<typeof createHelpdeskClient>;

function FileScreen(props: { lang: Lang; client: Client }) {
  const text = messages[props.lang];
  const [categoryCode, setCategoryCode] = useState('printer');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [number, setNumber] = useState<number | null>(null);
  return (
    <View>
      <Text style={styles.h}>{text.fileTicket}</Text>
      <Field label={text.category} value={categoryCode} onChange={setCategoryCode} />
      <Field label={text.subject} value={subject} onChange={setSubject} />
      <Field label={text.description} value={body} onChange={setBody} />
      <Pressable
        style={styles.button}
        onPress={() => {
          void props.client
            .createTicket({ categoryCode, impact: 'workplace', subject, body })
            .then((created) => setNumber(created.number));
        }}
      >
        <Text style={styles.buttonText}>{text.submit}</Text>
      </Pressable>
      {number ? (
        <Text style={styles.note}>
          {text.ticketCreated} {number}
        </Text>
      ) : null}
    </View>
  );
}

function ListScreen(props: { lang: Lang; client: Client }) {
  const text = messages[props.lang];
  const [rows, setRows] = useState<Array<{ number: number; subject: string }>>([]);
  return (
    <View>
      <Text style={styles.h}>{text.openTickets}</Text>
      <Pressable
        style={styles.button}
        onPress={() => void props.client.publicTickets().then((list) => setRows(list.tickets))}
      >
        <Text style={styles.buttonText}>{text.openTickets}</Text>
      </Pressable>
      {rows.map((row) => (
        <Text key={row.number} style={styles.row}>
          {row.number} {row.subject}
        </Text>
      ))}
    </View>
  );
}

function FaqScreen(props: { lang: Lang; client: Client }) {
  const text = messages[props.lang];
  const [titles, setTitles] = useState<string[]>([]);
  return (
    <View>
      <Text style={styles.h}>{text.guides}</Text>
      <Pressable
        style={styles.button}
        onPress={() =>
          void props.client
            .faq()
            .then((list) =>
              setTitles(
                list.articles.map((article) =>
                  props.lang === 'de' ? article.titleDe : article.titleEn,
                ),
              ),
            )
        }
      >
        <Text style={styles.buttonText}>{text.guides}</Text>
      </Pressable>
      {titles.map((title) => (
        <Text key={title} style={styles.row}>
          {title}
        </Text>
      ))}
    </View>
  );
}

function SearchScreen(props: { lang: Lang; client: Client }) {
  const text = messages[props.lang];
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<string[]>([]);
  return (
    <View>
      <Text style={styles.h}>{text.searchTitle}</Text>
      <Field label={text.searchSubmit} value={q} onChange={setQ} />
      <Pressable
        style={styles.button}
        onPress={() =>
          void props.client
            .search(q)
            .then((result) =>
              setHits(
                result.hits.map((hit) => (props.lang === 'de' ? hit.sentenceDe : hit.sentenceEn)),
              ),
            )
        }
      >
        <Text style={styles.buttonText}>{text.searchSubmit}</Text>
      </Pressable>
      {hits.map((hit) => (
        <Text key={hit} style={styles.row}>
          {hit}
        </Text>
      ))}
    </View>
  );
}

function SignInScreen(props: {
  lang: Lang;
  client: Client;
  onSession: (cookies: SessionCookies | null) => Promise<void>;
}) {
  const text = messages[props.lang];
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  return (
    <View>
      <Text style={styles.h}>{text.signIn}</Text>
      <Field label={text.name} value={email} onChange={setEmail} />
      <Field
        label={props.lang === 'de' ? 'Passwort' : 'Password'}
        value={secret}
        onChange={setSecret}
        secure
      />
      <Field label={props.lang === 'de' ? 'Code' : 'Code'} value={code} onChange={setCode} />
      <Pressable
        style={styles.button}
        onPress={() => {
          void props.client
            .login({ email, password: secret, code: code || undefined })
            .then((next) => props.onSession(next.cookies));
        }}
      >
        <Text style={styles.buttonText}>{text.signInSubmit}</Text>
      </Pressable>
    </View>
  );
}

function StaffScreen(props: { lang: Lang; client: Client }) {
  const [rows, setRows] = useState<StaffRow[]>([]);
  return (
    <View>
      <Text style={styles.h}>{messages[props.lang].openTickets}</Text>
      <Pressable
        style={styles.button}
        onPress={() =>
          void props.client
            .staffTickets()
            .then((list) =>
              setRows(
                [...list.open, ...list.recent].map((ticket) => presentStaffTicket(ticket, true)),
              ),
            )
        }
      >
        <Text style={styles.buttonText}>{messages[props.lang].openTickets}</Text>
      </Pressable>
      {rows.map((row) => (
        <Text key={row.number} style={styles.row}>
          {row.number} {row.subject}
          {row.body ? `\n${row.body}` : ''}
        </Text>
      ))}
    </View>
  );
}

function DashboardScreen(props: { lang: Lang; client: Client }) {
  const text = messages[props.lang];
  const [range, setRange] = useState<DashboardRange>('month');
  const [line, setLine] = useState('');
  const label: Record<DashboardRange, string> = {
    day: text.dashboardDay,
    week: text.dashboardWeek,
    month: text.dashboardMonth,
    quarter: text.dashboardQuarter,
    year: text.dashboardYear,
  };
  return (
    <View>
      <Text style={styles.h}>{text.dashboardTitle}</Text>
      <View style={styles.nav}>
        {ranges.map((item) => (
          <Nav key={item} label={label[item]} onPress={() => setRange(item)} />
        ))}
      </View>
      <Pressable
        style={styles.button}
        onPress={() =>
          void props.client.dashboard(range).then((report) => {
            setLine(
              `${text.dashboardIncoming} ${report.incoming}. ${text.dashboardOpenP1} ${report.openP1}.`,
            );
          })
        }
      >
        <Text style={styles.buttonText}>{text.dashboardTitle}</Text>
      </Pressable>
      {line ? <Text style={styles.row}>{line}</Text> : null}
    </View>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  secure?: boolean;
}) {
  return (
    <View>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChange}
        secureTextEntry={props.secure ?? false}
        style={styles.input}
        autoCapitalize="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f7f6f3' },
  bar: {
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#1d6b45',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  brand: { color: '#ffffff', fontSize: 18, fontWeight: '600' },
  link: { color: '#ffffff', fontSize: 14 },
  nav: { flexDirection: 'row', flexWrap: 'wrap', padding: 8 },
  navItem: { paddingVertical: 8, paddingHorizontal: 10 },
  navText: { color: '#1d6b45', fontSize: 14 },
  body: { padding: 16 },
  h: { color: '#1c2830', fontSize: 20, marginBottom: 12 },
  label: { color: '#1c2830', fontSize: 13, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#c8c2b4',
    backgroundColor: '#ffffff',
    color: '#1c2830',
    padding: 10,
    marginTop: 4,
  },
  button: { backgroundColor: '#1d6b45', padding: 12, marginTop: 16, alignSelf: 'flex-start' },
  buttonText: { color: '#ffffff', fontSize: 15 },
  row: { color: '#1c2830', fontSize: 15, marginTop: 10 },
  note: { color: '#1c2830', fontSize: 15, marginBottom: 8 },
});
