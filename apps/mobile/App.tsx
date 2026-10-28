import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  impacts,
  messages,
  type CategoryOption,
  type CreatedTicket,
  type DashboardRange,
  type Impact,
  type Lang,
  type Priority,
  type PriorityReason,
} from '@kmbhelp/shared';
import { createHelpdeskClient, HelpdeskRequestError } from './src/client.js';
import { apiOrigin } from './src/origin.js';
import { presentDashboard, presentSearchHit } from './src/present.js';
import { restoreSession, type SessionCookies } from './src/session.js';

type Screen = 'file' | 'faq' | 'search' | 'dashboard';
type ThemeName = 'light' | 'dark';
type Palette = {
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  line: string;
  green: string;
  onGreen: string;
  alert: string;
};

const ranges: DashboardRange[] = ['day', 'week', 'month', 'quarter', 'year'];
const light: Palette = {
  bg: '#f4f1ea',
  surface: '#fffcf7',
  ink: '#1c2430',
  muted: '#5c6570',
  line: '#d5cfc3',
  green: '#1d6b45',
  onGreen: '#f4faf6',
  alert: '#9d1c1c',
};
const dark: Palette = {
  bg: '#14181d',
  surface: '#1c2229',
  ink: '#ece7dc',
  muted: '#b0aa9e',
  line: '#343b44',
  green: '#2f8f62',
  onGreen: '#f4faf6',
  alert: '#ffb4b4',
};

export default function App() {
  const [lang, setLang] = useState<Lang>('de');
  const [theme, setTheme] = useState<ThemeName>('light');
  const [screen, setScreen] = useState<Screen>('file');
  const [session, setSession] = useState<SessionCookies | null>(null);
  const [query, setQuery] = useState('');
  const text = messages[lang];
  const colors = theme === 'dark' ? dark : light;
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

  return (
    <View style={[styles.page, { backgroundColor: colors.bg }]}>
      <View
        style={[styles.bar, { backgroundColor: colors.surface, borderBottomColor: colors.line }]}
      >
        <View style={styles.search}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            maxLength={80}
            accessibilityLabel={text.searchSubmit}
            placeholder={text.searchSubmit}
            placeholderTextColor={colors.muted}
            onSubmitEditing={() => setScreen('search')}
            style={[
              styles.searchInput,
              { color: colors.ink, borderColor: colors.line, backgroundColor: colors.surface },
            ]}
          />
          <Pressable
            accessibilityLabel={text.searchSubmit}
            onPress={() => setScreen('search')}
            style={[styles.searchButton, { backgroundColor: colors.green }]}
          >
            <SearchMark color={colors.onGreen} />
          </Pressable>
        </View>
        <View style={styles.tools} accessibilityRole="tablist">
          <ToolButton
            label={text.langDe}
            pressed={lang === 'de'}
            colors={colors}
            onPress={() => setLang('de')}
          >
            <GermanFlag />
          </ToolButton>
          <ToolButton
            label={text.langEn}
            pressed={lang === 'en'}
            colors={colors}
            onPress={() => setLang('en')}
          >
            <EnglishFlag />
          </ToolButton>
        </View>
        <View style={styles.tools}>
          <ToolButton
            label={text.themeLight}
            pressed={theme === 'light'}
            colors={colors}
            onPress={() => setTheme('light')}
          >
            <SunMark color={colors.ink} />
          </ToolButton>
          <ToolButton
            label={text.themeDark}
            pressed={theme === 'dark'}
            colors={colors}
            onPress={() => setTheme('dark')}
          >
            <MoonMark color={colors.ink} />
          </ToolButton>
        </View>
      </View>
      <View
        style={[
          styles.identity,
          { backgroundColor: colors.surface, borderBottomColor: colors.line },
        ]}
      >
        <Text style={[styles.title, { color: colors.ink }]}>{text.documentTitle}</Text>
        <Text style={[styles.lead, { color: colors.muted }]}>{text.lead}</Text>
      </View>
      <View style={styles.nav}>
        <Nav label={text.fileTicket} colors={colors} onPress={() => setScreen('file')} />
        <Nav label={text.guides} colors={colors} onPress={() => setScreen('faq')} />
        <Nav label={text.dashboardTitle} colors={colors} onPress={() => setScreen('dashboard')} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        {screen === 'file' ? <FileScreen lang={lang} client={client} colors={colors} /> : null}
        {screen === 'faq' ? <FaqScreen lang={lang} client={client} colors={colors} /> : null}
        {screen === 'search' ? (
          <SearchScreen lang={lang} client={client} colors={colors} query={query} />
        ) : null}
        {screen === 'dashboard' ? (
          <DashboardScreen lang={lang} client={client} colors={colors} />
        ) : null}
      </ScrollView>
    </View>
  );
}

function Nav(props: { label: string; colors: Palette; onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} style={styles.navItem}>
      <Text style={[styles.navText, { color: props.colors.green }]}>{props.label}</Text>
    </Pressable>
  );
}

function ToolButton(props: {
  label: string;
  pressed: boolean;
  colors: Palette;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityLabel={props.label}
      accessibilityState={{ selected: props.pressed }}
      onPress={props.onPress}
      style={[
        styles.tool,
        {
          borderColor: props.pressed ? props.colors.green : props.colors.line,
          backgroundColor: props.colors.surface,
        },
      ]}
    >
      {props.children}
    </Pressable>
  );
}

type Client = ReturnType<typeof createHelpdeskClient>;

function FileScreen(props: { lang: Lang; client: Client; colors: Palette }) {
  const text = messages[props.lang];
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [assignees, setAssignees] = useState<Array<{ id: string; displayName: string }>>([]);
  const [categoryCode, setCategoryCode] = useState('');
  const [impact, setImpact] = useState<Impact | ''>('workplace');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [requesterName, setRequesterName] = useState('');
  const [staffId, setStaffId] = useState('');
  const [clientPriority, setClientPriority] = useState<Priority | ''>('');
  const [availability, setAvailability] = useState<{
    textDe: string;
    textEn: string;
    windows: Array<{ start: string; end: string }>;
  } | null>(null);
  const [created, setCreated] = useState<CreatedTicket | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void props.client.categories().then((list) => {
      setCategories(list.categories);
      setCategoryCode((current) => current || list.categories[0]?.code || '');
    });
    void props.client
      .assignable()
      .then((list) => setAssignees(list.staff.filter((person) => person.active)))
      .catch(() => setAssignees([]));
  }, [props.client]);
  useEffect(() => {
    if (staffId === '') {
      setAvailability(null);
      return;
    }
    let cancelled = false;
    void props.client
      .availability(staffId)
      .then((next) => {
        if (!cancelled) setAvailability(next);
      })
      .catch(() => {
        if (!cancelled) setAvailability(null);
      });
    return () => {
      cancelled = true;
    };
  }, [props.client, staffId]);
  const impactLabel: Record<Impact, string> = {
    filing: text.impactFiling,
    payroll: text.impactPayroll,
    workplace: text.impactWorkplace,
    cosmetic: text.impactCosmetic,
  };

  function reset() {
    setCategoryCode('');
    setImpact('');
    setSubject('');
    setBody('');
    setDueOn('');
    setRequesterName('');
    setStaffId('');
    setClientPriority('');
    setError('');
  }

  return (
    <View>
      <Text style={[styles.h, { color: props.colors.ink }]}>{text.fileTicket}</Text>
      <Choice
        label={text.category}
        value={categoryCode}
        colors={props.colors}
        onChange={setCategoryCode}
        options={[
          { value: '', label: '' },
          ...categories.map((category) => ({
            value: category.code,
            label: `${props.lang === 'de' ? category.groupLabelDe : category.groupLabelEn} / ${
              props.lang === 'de' ? category.labelDe : category.labelEn
            }`,
          })),
        ]}
      />
      <Choice
        label={text.impact}
        value={impact}
        colors={props.colors}
        onChange={(value) => setImpact(value as Impact | '')}
        options={[
          { value: '', label: '' },
          ...impacts.map((item) => ({ value: item, label: impactLabel[item] })),
        ]}
      />
      <Field
        label={text.subject}
        value={subject}
        onChange={setSubject}
        colors={props.colors}
        maxLength={200}
      />
      <Field
        label={text.description}
        value={body}
        onChange={setBody}
        colors={props.colors}
        maxLength={8000}
        multiline
      />
      <Field
        label={text.dueOn}
        value={dueOn}
        onChange={setDueOn}
        colors={props.colors}
        maxLength={10}
        placeholder="dd.MM.yyyy"
      />
      <Field
        label={text.name}
        value={requesterName}
        onChange={setRequesterName}
        colors={props.colors}
        maxLength={200}
      />
      <Choice
        label={text.assignee}
        value={staffId}
        colors={props.colors}
        onChange={setStaffId}
        options={[
          { value: '', label: text.priorityUnset },
          ...assignees.map((person) => ({ value: person.id, label: person.displayName })),
        ]}
      />
      <Text style={[styles.label, { color: props.colors.ink }]}>{text.calendarTitle}</Text>
      <View style={styles.week}>
        {weekDays(props.lang).map((day) => (
          <Text key={day.key} style={[styles.weekDay, { color: props.colors.ink }]}>
            {day.label}
          </Text>
        ))}
      </View>
      {availability ? (
        <Text style={[styles.note, { color: props.colors.ink }]}>
          {props.lang === 'de' ? availability.textDe : availability.textEn}
        </Text>
      ) : null}
      {availability?.windows.map((window) => (
        <Text
          key={`${window.start}-${window.end}`}
          style={[styles.row, { color: props.colors.ink }]}
        >
          {window.start} – {window.end}
        </Text>
      ))}
      <Choice
        label={text.reportedPriority}
        value={clientPriority}
        colors={props.colors}
        onChange={(value) => setClientPriority(value as Priority | '')}
        options={[
          { value: '', label: text.priorityUnset },
          { value: 'p1', label: text.priorityP1 },
          { value: 'p2', label: text.priorityP2 },
          { value: 'p3', label: text.priorityP3 },
        ]}
      />
      <Text style={[styles.note, { color: props.colors.muted }]}>{text.priorityHint}</Text>
      {error ? <Text style={[styles.note, { color: props.colors.alert }]}>{error}</Text> : null}
      <View style={styles.actions}>
        <Pressable
          style={[styles.button, { backgroundColor: props.colors.green }]}
          onPress={() => {
            setError('');
            setCreated(null);
            if (!categoryCode || !impact || !subject.trim() || !body.trim()) {
              setError(text.sendFailed);
              return;
            }
            void props.client
              .createTicket({
                categoryCode,
                impact,
                subject,
                body,
                dueOn,
                requesterName,
                assignedStaffId: staffId || undefined,
                clientPriority: clientPriority || undefined,
              })
              .then((next) => {
                setCreated(next);
                reset();
              })
              .catch((cause: unknown) => setError(failureText(cause, props.lang)));
          }}
        >
          <Text style={[styles.buttonText, { color: props.colors.onGreen }]}>{text.submit}</Text>
        </Pressable>
        <Pressable
          style={[
            styles.button,
            styles.secondary,
            { borderColor: props.colors.line, backgroundColor: props.colors.surface },
          ]}
          onPress={reset}
        >
          <Text style={[styles.buttonText, { color: props.colors.ink }]}>{text.reset}</Text>
        </Pressable>
      </View>
      {created ? (
        <Text style={[styles.note, { color: props.colors.ink }]}>
          {text.ticketCreated} {created.number}
          {'\n'}
          {priorityText(created.priority, text)}. {reasonText(created.priorityReason, text)}
        </Text>
      ) : null}
    </View>
  );
}

function FaqScreen(props: { lang: Lang; client: Client; colors: Palette }) {
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
      <Text style={[styles.h, { color: props.colors.ink }]}>{text.guides}</Text>
      {articles.length === 0 ? (
        <Text style={[styles.note, { color: props.colors.muted }]}>{text.noGuides}</Text>
      ) : null}
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
          <Text style={[styles.row, { color: props.colors.green }]}>{article.title}</Text>
        </Pressable>
      ))}
      {open ? (
        <Text style={[styles.note, { color: props.colors.ink }]}>
          {open.title}
          {'\n'}
          {open.body}
        </Text>
      ) : null}
    </View>
  );
}

function SearchScreen(props: { lang: Lang; client: Client; colors: Palette; query: string }) {
  const text = messages[props.lang];
  const [hits, setHits] = useState<Array<{ title: string; sentence: string }>>([]);
  useEffect(() => {
    const q = props.query.trim();
    if (!q) {
      setHits([]);
      return;
    }
    void props.client
      .search(q)
      .then((result) => setHits(result.hits.map((hit) => presentSearchHit(hit, props.lang))));
  }, [props.client, props.lang, props.query]);
  return (
    <View>
      <Text style={[styles.h, { color: props.colors.ink }]}>{text.searchResults}</Text>
      {hits.length === 0 ? (
        <Text style={[styles.note, { color: props.colors.muted }]}>{text.noHits}</Text>
      ) : null}
      {hits.map((hit) => (
        <Text
          key={`${hit.title}-${hit.sentence}`}
          style={[styles.row, { color: props.colors.ink }]}
        >
          {hit.title}
          {'\n'}
          {hit.sentence}
        </Text>
      ))}
    </View>
  );
}

function DashboardScreen(props: { lang: Lang; client: Client; colors: Palette }) {
  const text = messages[props.lang];
  const [range, setRange] = useState<DashboardRange>('month');
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState('');
  const label: Record<DashboardRange, string> = {
    day: text.dashboardDay,
    week: text.dashboardWeek,
    month: text.dashboardMonth,
    quarter: text.dashboardQuarter,
    year: text.dashboardYear,
  };
  return (
    <View>
      <Text style={[styles.h, { color: props.colors.ink }]}>{text.dashboardTitle}</Text>
      <View style={styles.nav}>
        {ranges.map((item) => (
          <Nav
            key={item}
            label={label[item]}
            colors={props.colors}
            onPress={() => setRange(item)}
          />
        ))}
      </View>
      <Pressable
        style={[styles.button, { backgroundColor: props.colors.green }]}
        onPress={() => {
          setError('');
          void props.client
            .dashboard(range)
            .then((report) => setLines(presentDashboard(report, props.lang)))
            .catch((cause: unknown) => setError(failureText(cause, props.lang)));
        }}
      >
        <Text style={[styles.buttonText, { color: props.colors.onGreen }]}>
          {text.dashboardTitle}
        </Text>
      </Pressable>
      {error ? <Text style={[styles.note, { color: props.colors.alert }]}>{error}</Text> : null}
      {lines.map((line) => (
        <Text key={line} style={[styles.row, { color: props.colors.ink }]}>
          {line}
        </Text>
      ))}
    </View>
  );
}

function Choice(props: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  colors: Palette;
}) {
  const [open, setOpen] = useState(false);
  const current = props.options.find((item) => item.value === props.value);
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: props.colors.ink }]}>{props.label}</Text>
      <Pressable
        accessibilityLabel={props.label}
        onPress={() => setOpen((value) => !value)}
        style={[
          styles.input,
          { borderColor: props.colors.line, backgroundColor: props.colors.surface },
        ]}
      >
        <Text style={{ color: props.colors.ink }}>{current?.label ?? ''}</Text>
      </Pressable>
      {open ? (
        <View
          style={[
            styles.menu,
            { borderColor: props.colors.line, backgroundColor: props.colors.surface },
          ]}
        >
          {props.options.map((item) => (
            <Pressable
              key={item.value || `${props.label}-empty`}
              onPress={() => {
                props.onChange(item.value);
                setOpen(false);
              }}
              style={styles.option}
            >
              <Text
                style={{
                  color: item.value === props.value ? props.colors.green : props.colors.ink,
                  fontWeight: item.value === props.value ? '600' : '400',
                }}
              >
                {item.label === '' ? ' ' : item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  colors: Palette;
  maxLength?: number;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: props.colors.ink }]}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChange}
        maxLength={props.maxLength}
        placeholder={props.placeholder}
        placeholderTextColor={props.colors.muted}
        multiline={props.multiline ?? false}
        style={[
          styles.input,
          props.multiline ? styles.area : null,
          {
            color: props.colors.ink,
            borderColor: props.colors.line,
            backgroundColor: props.colors.surface,
          },
        ]}
      />
    </View>
  );
}

function weekDays(lang: Lang): Array<{ key: string; label: string }> {
  const start = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    const label = new Intl.DateTimeFormat(lang === 'de' ? 'de-AT' : 'en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
    }).format(day);
    return { key: day.toISOString().slice(0, 10), label };
  });
}

function priorityText(priority: string, text: (typeof messages)['de']): string {
  if (priority === 'p1') return text.priorityP1;
  if (priority === 'p2') return text.priorityP2;
  if (priority === 'p3') return text.priorityP3;
  return priority;
}

function reasonText(reason: PriorityReason, text: (typeof messages)['de']): string {
  if (reason === 'deadline_today_or_overdue') return text.reasonDeadlineToday;
  if (reason === 'deadline_later') return text.reasonDeadlineLater;
  if (reason === 'impact_without_date') return text.reasonImpactWithoutDate;
  if (reason === 'single_workplace') return text.reasonWorkplace;
  return text.reasonCosmetic;
}

function failureText(error: unknown, lang: Lang): string {
  if (error instanceof HelpdeskRequestError && error.text) return error.text[lang];
  return messages[lang].sendFailed;
}

function GermanFlag() {
  return (
    <View style={styles.flag}>
      <View style={[styles.flagBand, { backgroundColor: '#000000' }]} />
      <View style={[styles.flagBand, { backgroundColor: '#dd0000' }]} />
      <View style={[styles.flagBand, { backgroundColor: '#ffce00' }]} />
    </View>
  );
}

function EnglishFlag() {
  return (
    <View style={[styles.flag, { backgroundColor: '#012169' }]}>
      <View style={styles.flagCrossWide} />
      <View style={styles.flagCrossTall} />
      <View style={styles.flagCrossWideRed} />
      <View style={styles.flagCrossTallRed} />
    </View>
  );
}

function SunMark(props: { color: string }) {
  return (
    <View style={styles.mark}>
      <View style={[styles.sun, { borderColor: props.color }]} />
      <View style={[styles.rayV, { backgroundColor: props.color }]} />
      <View style={[styles.rayH, { backgroundColor: props.color }]} />
    </View>
  );
}

function MoonMark(props: { color: string }) {
  return (
    <View style={styles.mark}>
      <View style={[styles.moon, { borderColor: props.color }]} />
    </View>
  );
}

function SearchMark(props: { color: string }) {
  return (
    <View style={styles.mark}>
      <View style={[styles.lens, { borderColor: props.color }]} />
      <View style={[styles.handle, { backgroundColor: props.color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  bar: {
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  search: { flexGrow: 1, flexBasis: 180, flexDirection: 'row', alignItems: 'center', gap: 6 },
  searchInput: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 4, paddingHorizontal: 12 },
  searchButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 2,
  },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tool: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 2,
  },
  identity: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4, borderBottomWidth: 1 },
  title: { fontSize: 28, fontWeight: '600' },
  lead: { fontSize: 16, marginTop: 4 },
  nav: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingTop: 8 },
  navItem: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  navText: { fontSize: 16 },
  body: { padding: 16, paddingBottom: 48 },
  h: { fontSize: 22, fontWeight: '600', marginBottom: 4 },
  field: { marginTop: 16 },
  label: { fontSize: 16, marginBottom: 4 },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  area: { minHeight: 128, textAlignVertical: 'top' },
  menu: { borderWidth: 1, borderTopWidth: 0 },
  option: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  week: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  weekDay: { fontSize: 13, minWidth: 72 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  button: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 2 },
  secondary: { borderWidth: 1 },
  buttonText: { fontSize: 16 },
  row: { fontSize: 16, marginTop: 10 },
  note: { fontSize: 16, marginTop: 12 },
  flag: { width: 22, height: 14, overflow: 'hidden' },
  flagBand: { flex: 1 },
  flagCrossWide: {
    position: 'absolute',
    left: 0,
    top: 5,
    width: 22,
    height: 4,
    backgroundColor: '#ffffff',
  },
  flagCrossTall: {
    position: 'absolute',
    left: 9,
    top: 0,
    width: 4,
    height: 14,
    backgroundColor: '#ffffff',
  },
  flagCrossWideRed: {
    position: 'absolute',
    left: 0,
    top: 6,
    width: 22,
    height: 2,
    backgroundColor: '#c8102e',
  },
  flagCrossTallRed: {
    position: 'absolute',
    left: 10,
    top: 0,
    width: 2,
    height: 14,
    backgroundColor: '#c8102e',
  },
  mark: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  sun: { width: 8, height: 8, borderRadius: 4, borderWidth: 2 },
  rayV: { position: 'absolute', width: 2, height: 18 },
  rayH: { position: 'absolute', width: 18, height: 2 },
  moon: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderRightColor: 'transparent',
    transform: [{ rotate: '-30deg' }],
  },
  lens: { width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  handle: {
    position: 'absolute',
    width: 6,
    height: 2,
    right: 0,
    bottom: 2,
    transform: [{ rotate: '45deg' }],
  },
});
