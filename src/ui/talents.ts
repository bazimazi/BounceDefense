import { DIFFICULTIES } from '../data/arenas';
import { TALENTS, TALENT_MAP, TALENT_POINT_CAP, TALENT_TREES, talentRequirement, talentSpent, type TalentTree } from '../data/talents';
import { applyTalents, changeTalent, talentProgress, talentWins } from '../meta/talents';
import type { Profile } from '../meta/types';
import { t } from '../i18n';
import { meter, pips, richText } from './components';
import { h } from './dom';

export interface TalentState {
  tree: TalentTree;
  selected: string;
  notice: string;
}

export function newTalentState(): TalentState {
  return { tree: 'kinetics', selected: 'bankcraft', notice: '' };
}

/**
 * Talents apply the moment they are learned. Respecs are free between runs, so a separate
 * draft-and-apply step only added a confirmation dialog and a way to lose changes.
 */
export function talentPanel(p: Profile, state: TalentState, changed: (sound: 'learn' | 'refund' | 'select') => void): HTMLElement {
  const progress = talentProgress(p);
  const won = talentWins(p);
  const spent = talentSpent(p.talents);
  const available = progress.total - spent;
  if (TALENT_MAP[state.selected]?.tree !== state.tree) state.selected = TALENTS.find(n => n.tree === state.tree)!.id;
  const talent = TALENT_MAP[state.selected];
  const rank = p.talents[talent.id] ?? 0;
  const lock = talentRequirement(p.talents, talent, won);
  const tree = TALENT_TREES.find(x => x.id === state.tree)!;

  const update = (delta: 1 | -1) => {
    const next = changeTalent(p.talents, talent.id, delta, progress.total, won);
    if (!next) return;
    const refunded = spent - talentSpent(next);
    applyTalents(p, next);
    state.notice = refunded > 1 ? t('talents.refunded', { n: refunded }) : '';
    changed(delta > 0 ? 'learn' : 'refund');
  };
  const status = lock ?? (rank === talent.maxRank ? t('talents.fullyLearned') : available <= 0 ? t('talents.noPoints') : t('talents.ready'));

  return h('div', { class: 'talent-panel', style: `--tree-color:${tree.color}` },
    h('div', { class: 'talent-summary' },
      h('div', { class: 'talent-summary-copy' },
        h('b', { class: 'talent-points', 'aria-live': 'polite' }, t('talents.points', { n: available })),
        h('small', {}, progress.next ? t('talents.nextPointShort', { n: progress.next, total: progress.total, max: TALENT_POINT_CAP }) : t('talents.allEarnedShort'))),
      h('button', {
        id: 'talent-reset', class: 'ghost small-btn', disabled: spent === 0,
        onclick: () => { applyTalents(p, {}); state.notice = t('talents.draftReset'); changed('refund'); },
      }, t('talents.resetAll'))),
    meter(progress.need ? (progress.need - progress.next) / progress.need : 1, 'gold thin'),
    h('div', { class: 'talent-tabs', role: 'tablist', 'aria-label': t('talents.trees'), 'data-body': '.talent-tree' }, TALENT_TREES.map(x =>
      h('button', {
        id: `talent-tab-${x.id}`, role: 'tab', class: state.tree === x.id ? 'on' : '', 'aria-selected': String(state.tree === x.id),
        style: `--tree-color:${x.color}`, 'data-motion-key': `talent-tab:${x.id}`,
        onclick: () => { if (state.tree === x.id) return; state.tree = x.id; state.notice = ''; changed('select'); },
      }, h('span', { class: 'talent-tab-icon', 'aria-hidden': 'true' }, x.icon), h('span', {}, x.name), h('small', {}, String(talentSpent(p.talents, x.id)))))),
    h('p', { class: 'talent-tree-desc' }, tree.desc),
    h('section', { class: 'talent-tree active', 'aria-label': tree.name },
      [0, 1, 2, 3, 4, 5].flatMap(tier => {
        // Deep tiers open with a win: a divider names it, lit once the win is in.
        const need = TALENTS.find(n => n.tree === tree.id && n.tier === tier)?.minWin;
        const divider = need !== undefined && TALENTS.find(n => n.tree === tree.id && n.tier === tier - 1)?.minWin !== need
          ? h('div', { class: `talent-tier-label ${won >= need ? 'open' : ''}` }, t('talents.tierWin', { name: DIFFICULTIES[need]?.name ?? '' }))
          : null;
        return [divider, h('div', { class: `talent-tier tier-${tier} ${tier >= 3 ? 'deep' : ''}` },
        TALENTS.filter(n => n.tree === tree.id && n.tier === tier).map(n => {
          const r = p.talents[n.id] ?? 0;
          const requirement = talentRequirement(p.talents, n, won);
          return h('div', { class: `talent-slot ${n.requires ? 'connected' : ''} ${!requirement ? 'unlocked' : ''}` },
            h('button', {
              id: `talent-${n.id}`, 'data-motion-key': `talent:${n.id}`,
              class: `talent-node ${r ? 'learned' : ''} ${r === n.maxRank ? 'maxed' : ''} ${requirement ? 'locked-node' : ''} ${state.selected === n.id ? 'selected-node' : ''} ${n.capstone ? 'capstone' : ''}`,
              'aria-pressed': String(state.selected === n.id),
              'aria-label': `${t('talents.nodeLabel', { name: n.name, rank: r, max: n.maxRank })}${requirement ? `, ${requirement}` : ''}`,
              onclick: () => { if (state.selected === n.id) return; state.selected = n.id; state.notice = ''; changed('select'); },
            },
            h('span', { class: 'talent-icon', 'aria-hidden': 'true' }, n.icon),
            h('span', { class: 'talent-rank' }, t('talents.rankBadge', { rank: r, max: n.maxRank }))),
            h('div', { class: 'talent-node-name' }, n.name),
            n.capstone ? h('span', { class: 'talent-cap-label' }, t(tier === 5 ? 'talents.apexCapstone' : 'talents.capstone')) : null);
        }))];
      })),
    h('section', { class: 'talent-detail', 'aria-label': t('talents.selected'), 'aria-live': 'polite' },
      h('div', { class: 'talent-detail-head' },
        h('span', { class: 'talent-detail-icon', 'aria-hidden': 'true' }, talent.icon),
        h('div', {}, h('strong', {}, talent.name), pips(rank, talent.maxRank, rank < talent.maxRank && !lock))),
      rank > 0 ? h('p', { class: 'talent-line' }, h('span', { class: 'talent-line-label' }, t('talents.currentLabel')), richText(talent.desc(rank))) : null,
      rank < talent.maxRank ? h('p', { class: 'talent-line next' }, h('span', { class: 'talent-line-label' }, t('talents.nextLabel')), richText(talent.desc(rank + 1))) : null,
      h('div', { class: `talent-requirement ${lock ? 'locked' : ''}` }, status),
      h('div', { class: 'talent-actions' },
        h('button', { id: 'talent-refund', disabled: rank === 0, onclick: () => update(-1) }, t('talents.refund')),
        h('button', { id: 'talent-learn', class: 'primary', disabled: !!lock || rank === talent.maxRank || available <= 0, onclick: () => update(1) }, t('talents.learn'))),
      state.notice ? h('div', { class: 'talent-notice', role: 'status' }, state.notice) : null),
    h('p', { class: 'talent-rules' }, t('talents.rules')),
  );
}
