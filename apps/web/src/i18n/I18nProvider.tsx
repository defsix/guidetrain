import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import en from './locales/en.json';
import {
  applyDocumentLocale, deviceLocale, loadMessages, makeT, readLocalePref, resolveLocale,
  writeLocalePref, type LocaleCode, type LocalePref, type Messages, type TFn,
} from './index';

type Ctx = {
  /** What the user chose: a language, or "auto" to follow the device. */
  pref: LocalePref;
  /** What that resolves to right now. */
  locale: LocaleCode;
  setPref: (next: LocalePref) => void;
  t: TFn;
};

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<LocalePref>(() => readLocalePref());
  const [locale, setLocale] = useState<LocaleCode>(() => resolveLocale(readLocalePref()));
  const [msgs, setMsgs] = useState<Messages>(en as Messages);

  // Fetch the locale's chunk, but ignore a response that lands after the user
  // has moved on to another language — otherwise a slow chunk can overwrite a
  // newer, faster one and the app ends up in a language nobody picked.
  useEffect(() => {
    let live = true;
    applyDocumentLocale(locale);
    loadMessages(locale).then((m) => { if (live) setMsgs(m); });
    return () => { live = false; };
  }, [locale]);

  // On "device", follow the browser if its language changes mid-session.
  useEffect(() => {
    if (pref !== 'auto') return;
    const onChange = () => setLocale(deviceLocale());
    window.addEventListener('languagechange', onChange);
    return () => window.removeEventListener('languagechange', onChange);
  }, [pref]);

  const setPref = useCallback((next: LocalePref) => {
    writeLocalePref(next);
    setPrefState(next);
    setLocale(resolveLocale(next));
  }, []);

  const value = useMemo<Ctx>(
    () => ({ pref, locale, setPref, t: makeT(msgs, locale) }),
    [pref, locale, setPref, msgs],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

/** Just the translator, for components that need nothing else. */
export function useT(): TFn {
  return useI18n().t;
}
