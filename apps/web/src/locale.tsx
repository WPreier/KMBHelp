import { messages, type Lang } from '@kmbhelp/shared';
import { createContext, useContext, type ReactNode } from 'react';

type Copy = { [Key in keyof (typeof messages)['de']]: string };

const LocaleContext = createContext<{ lang: Lang; copy: Copy } | null>(null);

export function LocaleProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return (
    <LocaleContext.Provider value={{ lang, copy: messages[lang] }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale(): { lang: Lang; copy: Copy } {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('locale is missing');
  return value;
}
