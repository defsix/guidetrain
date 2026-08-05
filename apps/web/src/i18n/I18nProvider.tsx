import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import en from './locales/en.json';
import {
  applyDocumentLocale, deviceLocale, loadMessages, makeT, readLocalePref, resolveLocale,
  writeLocalePref, type LocaleCode, type LocalePref, type Messages, type TFn,
} from './index';
import { loadExerciseText, localize, type ExerciseText } from './exerciseText';

type Ctx = {
  /** What the user chose: a language, or "auto" to follow the device. */
  pref: LocalePref;
  /** What that resolves to right now. */
  locale: LocaleCode;
  setPref: (next: LocalePref) => void;
  t: TFn;
  /**
   * Swap one exercise's name and steps for the translated ones, where they
   * exist. Identity-stable when there is nothing to apply.
   */
  localizeExercise: <T extends { id: string; name: string; instructions: string[] }>(x: T) => T;
};

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<LocalePref>(() => readLocalePref());
  const [locale, setLocale] = useState<LocaleCode>(() => resolveLocale(readLocalePref()));
  const [msgs, setMsgs] = useState<Messages>(en as Messages);
  const [exText, setExText] = useState<ExerciseText>({});

  // Fetch the locale's chunks, but ignore a response that lands after the user
  // has moved on to another language — otherwise a slow chunk can overwrite a
  // newer, faster one and the app ends up in a language nobody picked.
  //
  // The two are separate requests on purpose: the interface is small and needed
  // at once, the exercise text is ~30x bigger and only matters once a muscle is
  // opened. Waiting on the second to show the first would be the wrong trade.
  useEffect(() => {
    let live = true;
    applyDocumentLocale(locale);
    setExText({});
    loadMessages(locale).then((m) => { if (live) setMsgs(m); });
    loadExerciseText(locale).then((x) => { if (live) setExText(x); });
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

  const localizeExercise = useCallback(
    <T extends { id: string; name: string; instructions: string[] }>(x: T) => localize(x, exText),
    [exText],
  );

  const value = useMemo<Ctx>(
    () => ({ pref, locale, setPref, t: makeT(msgs, locale), localizeExercise }),
    [pref, locale, setPref, msgs, localizeExercise],
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
