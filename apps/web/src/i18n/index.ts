/**
 * Language selection, driven by the device.
 *
 * The device decides by default: `navigator.languages` is negotiated against
 * the list below and the best match wins, exactly like the theme's "device"
 * setting. A picker is still offered, because the browser's language is a
 * setting about the *machine* and a person can want the app in something else —
 * a Polish speaker on a shared German laptop, say. The choice sticks.
 *
 * Only the active language is downloaded. English is bundled eagerly because it
 * is also the per-key fallback: a key missing from a translation falls through
 * to English rather than rendering a raw key at the user.
 */
import en from './locales/en.json';

export type LocaleCode =
  | 'en' | 'es' | 'fr' | 'de' | 'pt' | 'ja' | 'zh-Hans' | 'pl' | 'ru' | 'cs';

/** `native` is what the picker shows — a language is named in its own words. */
export const LOCALES: { code: LocaleCode; native: string; english: string }[] = [
  { code: 'en', native: 'English', english: 'English' },
  { code: 'cs', native: 'Čeština', english: 'Czech' },
  { code: 'de', native: 'Deutsch', english: 'German' },
  { code: 'es', native: 'Español', english: 'Spanish' },
  { code: 'fr', native: 'Français', english: 'French' },
  { code: 'pl', native: 'Polski', english: 'Polish' },
  { code: 'pt', native: 'Português', english: 'Portuguese' },
  { code: 'ru', native: 'Русский', english: 'Russian' },
  { code: 'zh-Hans', native: '简体中文', english: 'Chinese (Simplified)' },
  { code: 'ja', native: '日本語', english: 'Japanese' },
];

const CODES = LOCALES.map((l) => l.code);

/**
 * Base language → the locale that serves it.
 *
 * Regional tags collapse here: `pt-BR` and `pt-PT` both get `pt`, `es-419` gets
 * `es`. Any `zh` lands on Simplified, including `zh-Hant`/`zh-TW`/`zh-HK` —
 * imperfect, since those readers use Traditional characters, but far closer to
 * readable than falling back to English.
 */
const BY_BASE: Record<string, LocaleCode> = {
  en: 'en', cs: 'cs', de: 'de', es: 'es', fr: 'fr',
  pl: 'pl', pt: 'pt', ru: 'ru', zh: 'zh-Hans', ja: 'ja',
};

export const DEFAULT_LOCALE: LocaleCode = 'en';

/** Best supported locale for an ordered list of BCP 47 tags. */
export function negotiate(tags: readonly string[]): LocaleCode {
  for (const tag of tags) {
    const lower = String(tag).toLowerCase();
    const exact = CODES.find((c) => c.toLowerCase() === lower);
    if (exact) return exact;
    const base = BY_BASE[lower.split('-')[0]];
    if (base) return base;
  }
  return DEFAULT_LOCALE;
}

/** What the device is asking for. */
export function deviceLocale(): LocaleCode {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const tags = nav?.languages?.length ? nav.languages : nav?.language ? [nav.language] : [];
  return negotiate(tags);
}

export type LocalePref = 'auto' | LocaleCode;

const STORAGE_KEY = 'guidetrain.locale';

export function readLocalePref(): LocalePref {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'auto') return 'auto';
    if (raw && (CODES as string[]).includes(raw)) return raw as LocaleCode;
  } catch {
    // Private mode and blocked storage both throw; the device default is fine.
  }
  return 'auto';
}

export function writeLocalePref(pref: LocalePref) {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // Not being able to remember the choice is not a reason to refuse it.
  }
}

export function resolveLocale(pref: LocalePref): LocaleCode {
  return pref === 'auto' ? deviceLocale() : pref;
}

export type Messages = typeof en;

// Vite splits each of these into its own chunk, so a French visitor downloads
// French and nothing else. English is excluded because it is imported statically
// above — it is the fallback, so it has to be in the main bundle either way.
const FILES = import.meta.glob(['./locales/*.json', '!./locales/en.json']);

export async function loadMessages(code: LocaleCode): Promise<Messages> {
  if (code === 'en') return en as Messages;
  const load = FILES[`./locales/${code}.json`];
  if (!load) return en as Messages;
  try {
    return ((await load()) as { default: Messages }).default;
  } catch {
    // A failed chunk fetch should degrade to English, not to a blank screen.
    return en as Messages;
  }
}

export type Vars = Record<string, string | number>;

function lookup(msgs: unknown, key: string): unknown {
  // Split on dots only, so keys can contain spaces ("equipment.body only").
  return key.split('.').reduce<unknown>(
    (o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]),
    msgs,
  );
}

export type TFn = (key: string, vars?: Vars, fallback?: string) => string;

/**
 * Pick the plural form for a count.
 *
 * English needs two forms, so a bare "{count} exercises" looks like it works —
 * but Polish, Russian and Czech each need three (1 / 2–4 / 5+), and Japanese
 * and Chinese need one. Intl.PluralRules knows all of that per locale, so a
 * message can be an object of forms and the right one is chosen here.
 */
function plural(v: unknown, locale: LocaleCode, count: number): unknown {
  if (!v || typeof v !== 'object') return v;
  const forms = v as Record<string, unknown>;
  try {
    const cat = new Intl.PluralRules(locale).select(count);
    if (typeof forms[cat] === 'string') return forms[cat];
  } catch {
    // No Intl data for this locale: "other" is the safe universal form.
  }
  return forms.other;
}

/**
 * Translator over one set of messages.
 *
 * Resolution is translation → English → caller's fallback → the key itself.
 * The English step is what lets a partial translation ship: a language can
 * cover the interface and leave the exercise text to English without any of it
 * showing up as a broken placeholder.
 */
export function makeT(msgs: Messages, locale: LocaleCode = DEFAULT_LOCALE): TFn {
  return (key, vars, fallback) => {
    const count = typeof vars?.count === 'number' ? vars.count : undefined;
    let v = lookup(msgs, key);
    if (count !== undefined) v = plural(v, locale, count);
    if (typeof v !== 'string') {
      v = lookup(en, key);
      if (count !== undefined) v = plural(v, locale, count);
    }
    if (typeof v !== 'string') v = fallback;
    if (typeof v !== 'string') return key;
    if (!vars) return v;
    return v.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  };
}

/**
 * Tell the document what language it is in.
 *
 * `lang` drives screen-reader pronunciation, hyphenation and the font a browser
 * picks for CJK, so it has to track the real choice rather than stay at "en".
 */
export function applyDocumentLocale(code: LocaleCode) {
  if (typeof document !== 'undefined') document.documentElement.lang = code;
}
