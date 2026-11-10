import { en } from './en';
import { fa } from './fa';

export type Language = 'en' | 'fa';
export type UiKey = keyof typeof en;
export type Params = Record<string, string | number>;
export type Phrase = string | ((params: Params) => string);
/** Every language provides every key; TypeScript rejects an incomplete dictionary. */
export type Dictionary = Record<UiKey, Phrase>;

export interface LanguageDef {
  id: Language;
  /** Native name, shown in the language picker; `lang.<id>` gives the name in the active language. */
  name: string;
  dir: 'ltr' | 'rtl';
  /** Native numerals, when the language does not write 0-9: digits from zero to nine, and its separators. */
  numerals?: { digits: string; group: string; decimal: string; percent: string };
}

export const LANGUAGES: readonly LanguageDef[] = [
  { id: 'en', name: 'English', dir: 'ltr' },
  { id: 'fa', name: 'فارسی', dir: 'rtl', numerals: { digits: '۰۱۲۳۴۵۶۷۸۹', group: '٬', decimal: '٫', percent: '٪' } },
];
export const DEFAULT_LANGUAGE: Language = 'en';

const DICTIONARIES: Record<Language, Dictionary> = { en, fa };
const listeners = new Set<(language: Language) => void>();
let current: Language = DEFAULT_LANGUAGE;
let numerals: LanguageDef['numerals'];

/**
 * Rewrites 0-9 in the active language's numerals: "1,234.5 50%" becomes "۱٬۲۳۴٫۵ ۵۰٪" in Persian.
 * Applied where text reaches the screen (`h()`, live HUD labels, canvas text), so formatted and raw
 * numbers alike follow the language while game logic and `t()` keep working with plain digits.
 */
export function localizeDigits(text: string): string {
  if (!numerals || !/\d/.test(text)) return text;
  const n = numerals;
  return text
    .replace(/(\d)([,.])(?=\d)/g, (_, digit: string, sep: string) => digit + (sep === ',' ? n.group : n.decimal))
    .replace(/(\d)%/g, `$1${n.percent}`)
    .replace(/\d/g, digit => n.digits[Number(digit)]);
}

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some((l) => l.id === value);
}

export function language(): Language {
  return current;
}

export function direction(): 'ltr' | 'rtl' {
  return LANGUAGES.find((l) => l.id === current)!.dir;
}

export function isRtl(): boolean {
  return direction() === 'rtl';
}

/** The device language on a first launch; afterwards the saved setting wins. */
export function detectLanguage(): Language {
  if (typeof navigator === 'undefined') return DEFAULT_LANGUAGE;
  const tags = [...(navigator.languages ?? []), navigator.language].filter(Boolean);
  return tags.some((tag) => /^fa(-|_|$)/i.test(tag)) ? 'fa' : DEFAULT_LANGUAGE;
}

/** Switches every later `t()` call and the document's `lang`/`dir`; listeners re-render live views. */
export function setLanguage(next: Language): void {
  const resolved = isLanguage(next) ? next : DEFAULT_LANGUAGE;
  const changed = resolved !== current;
  current = resolved;
  numerals = LANGUAGES.find((l) => l.id === current)!.numerals;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = current;
    document.documentElement.dir = direction();
    document.title = t('app.name');
  }
  if (changed) for (const fn of listeners) fn(current);
}

export function onLanguageChange(fn: (language: Language) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Looks up a UI phrase in the active language and fills `{placeholders}`. */
export function t(key: UiKey, params?: Params): string {
  const phrase = DICTIONARIES[current][key] ?? en[key];
  const text = typeof phrase === 'function' ? phrase(params ?? {}) : phrase;
  return params ? text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match)) : text;
}

/** Font stacks per script: Persian needs an Arabic-script face on canvas as well as in CSS. */
export function fontFamily(): string {
  return current === 'fa'
    ? '"Vazirmatn", "Vazir", "Segoe UI", "Noto Sans Arabic", "Noto Naskh Arabic", Tahoma, system-ui, sans-serif'
    : '"Rubik", "Segoe UI", system-ui, sans-serif';
}
