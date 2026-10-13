import { language, type Language } from './index';
import { faContent } from './fa-content';

/** A translated field: plain text, a list (difficulty rules) or a describer that takes a level/rank. */
export type ContentValue = string | string[] | ((...args: number[]) => string);
/** kind -> id -> field path -> translation */
export type ContentTable = Record<string, Record<string, Record<string, ContentValue>>>;

const TABLES: Partial<Record<Language, ContentTable>> = { fa: faContent };

export interface ContentRegistration {
  kind: string;
  defs: readonly { id: string }[];
  /** Field paths, e.g. `name` or `unlockReq.text`. */
  fields: string[];
}
/** Everything that was localized; the i18n test walks it to prove every language is complete. */
export const CONTENT_REGISTRY: ContentRegistration[] = [];

export function contentText(kind: string, id: string, field: string): ContentValue | undefined {
  const active = language();
  if (active === 'en') return undefined;
  return TABLES[active]?.[kind]?.[id]?.[field];
}

/**
 * Game data stays authored in English. Each listed field becomes a getter that serves the
 * active language's text (or the original when no translation exists), so menus, the canvas
 * HUD, run banners and build names all switch together without touching their call sites.
 */
export function localize<T extends { id: string }>(kind: string, defs: readonly T[], fields: string[]): void {
  CONTENT_REGISTRY.push({ kind, defs, fields });
  for (const def of defs) {
    for (const path of fields) {
      const [head, tail] = path.split('.');
      const target = (tail ? (def as Record<string, unknown>)[head] : def) as Record<string, unknown> | undefined;
      const field = tail ?? head;
      if (!target || !(field in target)) continue;
      const original = target[field];
      Object.defineProperty(target, field, {
        enumerable: true, configurable: true,
        get: () => contentText(kind, def.id, path) ?? original,
      });
    }
  }
}
