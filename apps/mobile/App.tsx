import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import {
  impacts,
  messages,
  priorities,
  type CategoryOption,
  type DashboardRange,
  type Impact,
  type Lang,
  type Priority,
} from '@kmbhelp/shared';
import { createHelpdeskClient, HelpdeskRequestError } from './src/client.js';
import { canShowStaffDetail, presentStaffTicket, type StaffRow } from './src/gate.js';
import { apiOrigin } from './src/origin.js';
import { presentDashboard, presentPublicRow, presentSearchHit } from './src/present.js';
import { restoreSession, type SessionCookies } from './src/session.js';

type Screen = 'file' | 'list' | 'faq' | 'search' | 'staff' | 'dashboard' | 'signIn';

const ranges: DashboardRange[] = ['day', 'week', 'month', 'quarter', 'year'];

export default function App() {
  const [lang, setLang] = useState<Lang>('de');
  const [screen, setScreen] = useState<Screen>('file');
  const [session, setSession] = useState<SessionCookies | null>(null);
  const [deviceUnlocked, setDeviceUnlocked] = useState(false);
  const [note, setNote] = useState('');
  const text = messages[lang];
  useEffect(() => {
    void (async () => {
      const restored = restoreSession(
        await SecureStore.getItemAsync('kmbhelp_session'),
        await SecureStore.getItemAsync('kmbhelp_csrf'),
      );
      if (restored) setSession(restored);
    })();
  }, []);
  const client = useMemo(
    () =>
      createHelpdeskClient({
        origin: apiOrigin(process.env),
        fetch: globalThis.fetch.bind(globalThis),
        session,
      }),
    [session],
  );

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
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoryCode, setCategoryCode] = useState('');
  const [impact, setImpact] = useState<Impact>('workplace');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [requesterName, setRequesterName] = useState('');
  const [clientPriority, setClientPriority] = useState<Priority | ''>('');
  const [number, setNumber] = useState<number | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void props.client.categories().then((list) => {
      setCategories(list.categories);
      setCategoryCode((current) => current || list.categories[0]?.code || '');
    });
  }, [props.client]);
  const impactLabel: Record<Impact, string> = {
    filing: text.impactFiling,
    payroll: text.impactPayroll,
    workplace: text.impactWorkplace,
    cosmetic: text.impactCosmetic,
  };
  return (
    <View>
      <Text style={styles.h}>{text.fileTicket}</Text>
      <Text style={styles.label}>{text.category}</Text>
      {categories.map((category) => (
        <Pressable key={category.code} onPress={() => setCategoryCode(category.code)}>
          <Text style={category.code === categoryCode ? styles.chosen : styles.row}>
            {props.lang === 'de' ? category.labelDe : category.labelEn}
          </Text>
        </Pressable>
      ))}
      <Text style={styles.label}>{text.impact}</Text>
      {impacts.map((item) => (
        <Pressable key={item} onPress={() => setImpact(item)}>
          <Text style={item === impact ? styles.chosen : styles.row}>{impactLabel[item]}</Text>
        </Pressable>
      ))}
      <Field label={text.subject} value={subject} onChange={setSubject} />
      <Field label={text.description} value={body} onChange={setBody} />
      <Field label={`${text.dueOn} dd.MM.yyyy`} value={dueOn} onChange={setDueOn} />
      <Field label={text.name} value={requesterName} onChange={setRequesterName} />
      <Text style={styles.label}>{text.reportedPriority}</Text>
      <Text style={styles.note}>{text.priorityHint}</Text>
      <Pressable onPress={() => setClientPriority('')}>
        <Text style={clientPriority === '' ? styles.chosen : styles.row}>{text.priorityUnset}</Text>
      </Pressable>
      {priorities.map((item) => (
        <Pressable key={item} onPress={() => setClientPriority(item)}>
          <Text style={item === clientPriority ? styles.chosen : styles.row}>
            {item === 'p1' ? text.priorityP1 : item === 'p2' ? text.priorityP2 : text.priorityP3}
          </Text>
        </Pressable>
      ))}
      <Pressable
        style={styles.button}
        onPress={() => {
          setError('');
          void props.client
            .createTicket({
              categoryCode,
              impact,
              subject,
              body,
              dueOn,
              requesterName,
              clientPriority: clientPriority || undefined,
            })
            .then((created) => setNumber(created.number))
            .catch((cause: unknown) => setError(failureText(cause, props.lang)));
        }}
      >
        <Text style={styles.buttonText}>{text.submit}</Text>
      </Pressable>
      {error ? <Text style={styles.note}>{error}</Text> : null}
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
  const [rows, setRows] = useState<Array<{ number: number; subject: string; meta: string }>>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    void props.client
      .publicTickets()
      .then((list) => setRows(list.tickets.map((ticket) => presentPublicRow(ticket, props.lang))))
      .catch((cause: unknown) => setError(failureText(cause, props.lang)));
  }, [props.client, props.lang]);
  return (
    <View>
      <Text style={styles.h}>{text.openTickets}</Text>
      {error ? <Text style={styles.note}>{error}</Text> : null}
      {rows.length === 0 && !error ? <Text style={styles.note}>{text.noOpenTickets}</Text> : null}
      {rows.map((row) => (
        <Text key={row.number} style={styles.row}>
          {row.number} {row.subject}
          {'\n'}
          {row.meta}
        </Text>
      ))}
    </View>
  );
}

function FaqScreen(props: { lang: Lang; client: Client }) {
  const text = messages[props.lang];
  const [articles, setArticles] = useState<Array<{ slug: string; title: string }>>([]);
  const [open, setOpen] = useState<{ title: string; body: string } | null>(null);
  useEffect(() => {
    void props.client.faq().then((list) =>
      setArticles(
        list.articles.map((article) => ({
          slug: article.slug,
          title: props.lang === 'de' ? article.titleDe : article.titleEn,
        })),
      ),
    );
  }, [props.client, props.lang]);
  return (
    <View>
      <Text style={styles.h}>{text.guides}</Text>
      {articles.length === 0 ? <Text style={styles.note}>{text.noGuides}</Text> : null}
      {articles.map((article) => (
        <Pressable
          key={article.slug}
          onPress={() =>
            void props.client.faqArticle(article.slug).then((loaded) =>
              setOpen({
                title: props.lang === 'de' ? loaded.titleDe : loaded.titleEn,
                body: props.lang === 'de' ? loaded.bodyDe : loaded.bodyEn,
              }),
            )
          }
        >
          <Text style={styles.row}>{article.title}</Text>
        </Pressable>
      ))}
      {open ? (
        <Text style={styles.note}>
          {open.title}
          {'\n'}
          {open.body}
        </Text>
      ) : null}
    </View>
  );
}

function SearchScreen(props: { lang: Lang; client: Client }) {
  const text = messages[props.lang];
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Array<{ title: string; sentence: string }>>([]);
  return (
    <View>
      <Text style={styles.h}>{text.searchTitle}</Text>
      <Field label={text.searchSubmit} value={q} onChange={setQ} />
      <Pressable
        style={styles.button}
        onPress={() =>
          void props.client
            .search(q)
            .then((result) => setHits(result.hits.map((hit) => presentSearchHit(hit, props.lang))))
        }
      >
        <Text style={styles.buttonText}>{text.searchSubmit}</Text>
      </Pressable>
      {hits.length === 0 ? <Text style={styles.note}>{text.noHits}</Text> : null}
      {hits.map((hit) => (
        <Text key={`${hit.title}-${hit.sentence}`} style={styles.row}>
          {hit.title}
          {'\n'}
          {hit.sentence}
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
  const [error, setError] = useState('');
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
          setError('');
          void props.client
            .login({ email, password: secret, code: code || undefined })
            .then((next) => props.onSession(next.cookies))
            .catch((cause: unknown) => setError(failureText(cause, props.lang)));
        }}
      >
        <Text style={styles.buttonText}>{text.signInSubmit}</Text>
      </Pressable>
      {error ? <Text style={styles.note}>{error}</Text> : null}
    </View>
  );
}

function StaffScreen(props: { lang: Lang; client: Client }) {
  const text = messages[props.lang];
  const [open, setOpen] = useState<StaffRow[]>([]);
  const [recent, setRecent] = useState<StaffRow[]>([]);
  useEffect(() => {
    void props.client.staffTickets().then((list) => {
      setOpen(list.open.map((ticket) => presentStaffTicket(ticket, true)));
      setRecent(list.recent.map((ticket) => presentStaffTicket(ticket, true)));
    });
  }, [props.client]);
  return (
    <View>
      <Text style={styles.h}>{text.openTickets}</Text>
      {open.map((row) => (
        <Text key={`open-${row.number}`} style={styles.row}>
          {row.number} {row.subject}
          {row.body ? `\n${row.body}` : ''}
        </Text>
      ))}
      <Text style={styles.h}>{text.done}</Text>
      {recent.map((row) => (
        <Text key={`recent-${row.number}`} style={styles.row}>
          {row.number} {row.subject}
          {row.durationSeconds !== null
            ? `\n${Math.floor(row.durationSeconds / 60)} ${text.minutes}`
            : ''}
          {row.body ? `\n${row.body}` : ''}
        </Text>
      ))}
    </View>
  );
}

function DashboardScreen(props: { lang: Lang; client: Client }) {
  const text = messages[props.lang];
  const [range, setRange] = useState<DashboardRange>('month');
  const [lines, setLines] = useState<string[]>([]);
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
          void props.client
            .dashboard(range)
            .then((report) => setLines(presentDashboard(report, props.lang)))
        }
      >
        <Text style={styles.buttonText}>{text.dashboardTitle}</Text>
      </Pressable>
      {lines.map((line) => (
        <Text key={line} style={styles.row}>
          {line}
        </Text>
      ))}
    </View>
  );
}

function failureText(error: unknown, lang: Lang): string {
  if (error instanceof HelpdeskRequestError && error.text) return error.text[lang];
  return messages[lang].loadFailed;
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
  chosen: { color: '#1d6b45', fontSize: 15, marginTop: 8, fontWeight: '600' },
  row: { color: '#1c2830', fontSize: 15, marginTop: 10 },
  note: { color: '#1c2830', fontSize: 15, marginBottom: 8 },
});
