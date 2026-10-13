import { afterEach, describe, expect, it } from 'vitest';
import { LANGUAGES, language, setLanguage, t } from '../src/i18n';
import { en } from '../src/i18n/en';
import { fa } from '../src/i18n/fa';
import { CONTENT_REGISTRY } from '../src/i18n/content';
import { faContent } from '../src/i18n/fa-content';
import { CORE_MAP } from '../src/data/balls';
import { DIFFICULTIES } from '../src/data/arenas';
import { UPGRADE_MAP } from '../src/data/upgrades';
import { WORKSHOP_MAP } from '../src/data/meta';
import { talentRequirement, TALENT_MAP } from '../src/data/talents';
import { Build, buildName } from '../src/sim/build';
import { defaultProfile, migrate } from '../src/meta/profile';
import { describeUnlock, nextGoals } from '../src/meta/progress';
import '../src/data/enemies';
import '../src/data/synergies';

const PERSIAN = /[؀-ۿ]/;
const LATIN_WORD = /[A-Za-z]{3,}/;
/** Brand, ids and configuration tokens that stay Latin in every language. */
const LATIN_OK = new Set(['home.title1', 'home.title2', 'home.system', 'loadout.presetWord']);
const placeholders = (phrase: unknown) => (typeof phrase === 'string' ? [...phrase.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort() : null);

afterEach(() => setLanguage('en'));

describe('ui dictionary', () => {
  it('lists every supported language with a direction', () => {
    expect(LANGUAGES.map((l) => l.id)).toEqual(['en', 'fa']);
    expect(LANGUAGES.find((l) => l.id === 'fa')?.dir).toBe('rtl');
  });

  it('Persian covers exactly the English keys, with the same placeholders', () => {
    const keys = Object.keys(en) as (keyof typeof en)[];
    expect(Object.keys(fa).sort()).toEqual([...keys].sort());
    for (const key of keys) {
      const a = placeholders(en[key]), b = placeholders(fa[key]);
      if (a && b) expect(b, key).toEqual(a);
    }
  });

  it('Persian phrases are written in Persian', () => {
    for (const [key, phrase] of Object.entries(fa)) {
      if (typeof phrase !== 'string' || LATIN_OK.has(key)) continue;
      const stripped = phrase.replace(/\{\w+\}/g, '');
      expect(stripped.match(LATIN_WORD), `${key}: ${phrase}`).toBeNull();
      // Pure glyph/number phrases (arrows, "{n}/{max}") carry no letters at all.
      if (/\p{L}/u.test(stripped)) expect(stripped, key).toMatch(PERSIAN);
    }
  });

  it('interpolates placeholders in the active language and falls back safely', () => {
    expect(t('levelup.title', { n: 3 })).toBe('LEVEL 3');
    expect(t('report.talentPoints', { n: 1 })).toBe('+1 Talent point! Spend them in Talents.');
    expect(t('report.talentPoints', { n: 2 })).toBe('+2 Talent points! Spend them in Talents.');
    setLanguage('fa');
    expect(language()).toBe('fa');
    expect(t('levelup.title', { n: 3 })).toBe('سطح 3');
    expect(t('hud.circuit', { lit: 2, n: 7 })).toBe('2/3 · 7 ث');
    setLanguage('xx' as never);
    expect(language()).toBe('en');
  });
});

describe('game content', () => {
  it('Persian translates every registered content field', () => {
    expect(CONTENT_REGISTRY.length).toBeGreaterThanOrEqual(20);
    for (const { kind, defs, fields } of CONTENT_REGISTRY) {
      for (const def of defs) for (const path of fields) {
        const [head, tail] = path.split('.');
        const target = (tail ? (def as Record<string, unknown>)[head] : def) as Record<string, unknown> | undefined;
        const field = tail ?? head;
        if (!target || !(field in target)) continue;
        const original = target[field];
        if (original === '' || (Array.isArray(original) && !original.length)) continue;
        const translated = faContent[kind]?.[def.id]?.[path];
        const label = `${kind}.${def.id}.${path}`;
        expect(translated, label).toBeDefined();
        expect(Array.isArray(translated), label).toBe(Array.isArray(original));
        expect(typeof translated, label).toBe(typeof original);
        if (typeof translated === 'string') expect(translated, label).toMatch(PERSIAN);
        if (Array.isArray(translated)) { expect(translated.length, label).toBe((original as string[]).length); for (const line of translated) expect(line, label).toMatch(PERSIAN); }
        if (typeof translated === 'function') for (let level = 1; level <= 5; level++) expect(translated(level), `${label}(${level})`).toMatch(PERSIAN);
      }
    }
  });

  it('has no stray Persian content for unknown ids or fields', () => {
    for (const [kind, ids] of Object.entries(faContent)) {
      const registrations = CONTENT_REGISTRY.filter((r) => r.kind === kind);
      expect(registrations.length, kind).toBeGreaterThan(0);
      for (const [id, fields] of Object.entries(ids)) {
        const def = registrations.flatMap((r) => r.defs).find((d) => d.id === id);
        expect(def, `${kind}.${id}`).toBeDefined();
        for (const path of Object.keys(fields)) expect(registrations.some((r) => r.fields.includes(path)), `${kind}.${id}.${path}`).toBe(true);
      }
    }
  });

  it('serves translated names and describers, then returns to English', () => {
    expect(UPGRADE_MAP.heavy_impact.name).toBe('Heavy Impact');
    expect(DIFFICULTIES[1].rules).toEqual(['Elites appear more often', 'Advanced squads unlocked']);
    setLanguage('fa');
    expect(UPGRADE_MAP.heavy_impact.name).toBe('ضربهٔ سنگین');
    expect(UPGRADE_MAP.executioner.desc(2)).toContain('15');
    expect(WORKSHOP_MAP.hull.desc(3)).toContain('30');
    expect(CORE_MAP.cryo.unlockReq?.text).toMatch(PERSIAN);
    expect(DIFFICULTIES[1].rules).toHaveLength(2);
    expect(DIFFICULTIES[1].rules[0]).toMatch(PERSIAN);
    expect(talentRequirement({}, TALENT_MAP.precision)).toMatch(PERSIAN);
    expect(describeUnlock({ type: 'upgrade', id: 'wildfire' })).toMatch(PERSIAN);
    setLanguage('en');
    expect(UPGRADE_MAP.heavy_impact.name).toBe('Heavy Impact');
    expect(describeUnlock({ type: 'coins', amount: 5 })).toBe('+5 Coins');
  });

  it('localizes build names and goals without changing the archetype logic', () => {
    const plain = new Build('striker', [], []);
    const tesla = new Build('striker', [], []);
    tesla.addUpgrade('chain_lightning');
    expect(buildName(plain)).toBe('Plain Ball');
    expect(buildName(tesla)).toBe('Tesla Conduit');
    const goalsEn = nextGoals(defaultProfile(), 3).map((g) => g.text);
    setLanguage('fa');
    expect(buildName(plain)).toBe('توپ ساده');
    expect(buildName(tesla)).toBe('رسانا تسلایی');
    const goalsFa = nextGoals(defaultProfile(), 3).map((g) => g.text);
    expect(goalsFa).toHaveLength(goalsEn.length);
    for (const text of goalsFa) expect(text).toMatch(PERSIAN);
  });
});

describe('language setting', () => {
  it('defaults to English and rejects unknown saved languages', () => {
    expect(defaultProfile().settings.language).toBe('en');
    expect(migrate({ version: 3, settings: { language: 'fa' } }).settings.language).toBe('fa');
    expect(migrate({ version: 3, settings: { language: 'klingon' } }).settings.language).toBe('en');
    expect(migrate({ version: 2, settings: { sfx: 1 } }).settings.language).toBe('en');
  });
});
