import { LOCALES, type LocalePref } from '../i18n';
import { useI18n } from '../i18n/I18nProvider';

/**
 * Language picker.
 *
 * A native <select> rather than the cycling button the theme uses: ten options
 * is too many to cycle through, and the native control is the one that already
 * works with a screen reader and opens as a proper wheel on a phone.
 *
 * The select is laid transparently over the pill so the closed state can show
 * just the language's own name. Left to itself it would display the selected
 * option's full text, and "Device language — Português" does not fit in a
 * header pill in any of these languages.
 *
 * Each language is listed in its own script — someone looking for their
 * language is looking for "Русский", not "Russian".
 */
export default function LanguageToggle() {
  const { pref, locale, setPref, t } = useI18n();
  const active = LOCALES.find((l) => l.code === locale);

  return (
    <label className="lang-toggle" title={t('language.label')}>
      <span className="lang-toggle-icon" aria-hidden="true">🌐</span>
      <span className="lang-toggle-label" lang={locale}>{active?.native ?? locale}</span>
      <span className="lang-toggle-caret" aria-hidden="true">⌄</span>
      <select
        aria-label={t('language.aria')}
        value={pref}
        onChange={(e) => setPref(e.target.value as LocalePref)}
      >
        {/* Following the device is the default, and names the language that
            currently resolves to, so the choice isn't a guess. */}
        <option value="auto">
          {t('language.auto')}{active ? ` — ${active.native}` : ''}
        </option>
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.native}
          </option>
        ))}
      </select>
    </label>
  );
}
