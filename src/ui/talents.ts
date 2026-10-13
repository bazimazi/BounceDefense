import { TALENTS, TALENT_MAP, TALENT_TREES, TALENT_XP_PER_POINT, talentRequirement, talentSpent, type TalentTree } from '../data/talents';
import { applyTalents, changeTalent, talentProgress } from '../meta/talents';
import type { Profile } from '../meta/types';
import { t } from '../i18n';
import { bar, h } from './dom';
import { cancelWithin, enter, feedback, retire, revealItems, tabFeedback, type MotionDirection } from './motion';

type TalentChange = 'tree' | 'detail' | 'close' | 'rank' | 'reset' | 'apply';

export interface TalentView {
  element: HTMLElement;
  readonly detailOpen: boolean;
  readonly dirty: boolean;
  closeDetail: () => void;
  discard: () => void;
}

/** Local draft: experimentation is free, and only Apply writes to the profile. */
export function talentScreen(p: Profile, save: () => void, back: () => void): TalentView {
  const root = h('div', { class: 'screen talent-screen' });
  let draft = { ...p.talents };
  let active: TalentTree = 'kinetics';
  let selected = 'bankcraft';
  let notice = '';
  let detailOpen = false;
  const dirty = () => TALENTS.some(n => (draft[n.id] ?? 0) !== (p.talents[n.id] ?? 0));
  const closeDetail = () => { detailOpen = false; render(`talent-${selected}`, 'close'); };
  const progress = talentProgress(p);
  const render = (focus?: string, change?: TalentChange, direction: MotionDirection = 0) => {
    const wasOpen = root.hasAttribute('data-detail-open');
    const oldTab = root.querySelector('.talent-tabs .on')?.getBoundingClientRect();
    if (change === 'tree') retire(root.querySelector('.talent-tree.active'), 'content', direction);
    if (wasOpen && (change === 'tree' || change === 'close' || change === 'detail'))
      retire(root.querySelector('.talent-detail'), change === 'detail' ? 'content' : 'sheet', 0);
    for (const child of root.children) cancelWithin(child as HTMLElement);
    const scrollTop = root.querySelector('.talent-scroll')?.scrollTop ?? 0;
    const spent = talentSpent(draft);
    const changed = dirty();
    const talent = TALENT_MAP[selected];
    const rank = draft[talent.id] ?? 0;
    const lock = talentRequirement(draft, talent);
    const update = (delta: 1 | -1) => {
      const next = changeTalent(draft, selected, delta, progress.total);
      if (!next) return;
      const refunded = spent - talentSpent(next);
      draft = next;
      notice = refunded > 1 ? t('talents.refunded', { n: refunded }) : '';
      render(delta === 1 ? 'talent-learn' : 'talent-refund', 'rank');
    };
    root.replaceChildren(
      h('div', { class: 'topbar' },
        h('button', { class: 'ghost', onclick: back, 'aria-label': t('common.back') }, t('common.backGlyph')),
        h('h2', {}, t('talents.title')), h('span', { class: 'chip talent-points', 'aria-live': 'polite' }, t('talents.points', { n: progress.total - spent }))),
      h('div', { class: 'scroll talent-scroll' },
        h('div', { class: 'talent-intro' }, h('span', { class: 'eyebrow' }, t('talents.eyebrow')),
          h('p', {}, t('talents.intro')),
          h('div', { class: 'small muted' }, t('talents.progress', { xp: TALENT_XP_PER_POINT, total: progress.total }),
            progress.next ? t('talents.nextPoint', { n: progress.next }) : t('talents.allEarned')),
          bar(progress.next ? (TALENT_XP_PER_POINT - progress.next) / TALENT_XP_PER_POINT : 1, 'gold')),
        h('div', { class: 'talent-tabs', 'aria-label': t('talents.trees') }, TALENT_TREES.map(tree =>
          h('button', { id: `talent-tab-${tree.id}`, class: active === tree.id ? 'on' : '', 'aria-pressed': active === tree.id ? 'true' : 'false',
            style: `--tree-color:${tree.color}`, onclick: () => {
              if (active === tree.id) return;
              const dir = TALENT_TREES.findIndex(x => x.id === tree.id) > TALENT_TREES.findIndex(x => x.id === active) ? 1 : -1;
              active = tree.id; selected = TALENTS.find(n => n.tree === active)!.id; detailOpen = false;
              render(`talent-tab-${active}`, 'tree', dir);
            } },
          `${tree.icon} ${tree.name}`, h('span', {}, String(talentSpent(draft, tree.id)))))),
        h('div', { class: 'talent-forest' }, TALENT_TREES.map(tree =>
          h('section', { class: `talent-tree ${active === tree.id ? 'active' : ''}`, style: `--tree-color:${tree.color}`, 'aria-label': tree.name },
            h('div', { class: 'talent-tree-heading' }, h('span', { class: 'talent-tree-emblem', 'aria-hidden': 'true' }, tree.icon),
              h('div', {}, h('h3', {}, tree.name), h('span', { class: 'small muted' }, t('talents.invested', { n: talentSpent(draft, tree.id) })))),
            h('p', { class: 'talent-tree-desc' }, tree.desc),
            ...[0, 1, 2].map(tier => h('div', { class: `talent-tier tier-${tier}` },
              TALENTS.filter(n => n.tree === tree.id && n.tier === tier).map(n => {
                const r = draft[n.id] ?? 0;
                const requirement = talentRequirement(draft, n);
                return h('div', { class: `talent-slot ${n.requires ? 'connected' : ''} ${!requirement ? 'unlocked' : ''}` },
                  h('button', { id: `talent-${n.id}`, class: `talent-node ${r ? 'learned' : ''} ${requirement ? 'locked-node' : ''} ${selected === n.id ? 'selected-node' : ''} ${tier === 2 ? 'capstone' : ''}`,
                    'aria-pressed': selected === n.id ? 'true' : 'false',
                    'aria-label': `${t('talents.nodeLabel', { name: n.name, rank: r, max: n.maxRank })}${requirement ? `, ${requirement}` : ''}`,
                    title: n.desc(r || 1), onclick: () => {
                      selected = n.id; active = tree.id; notice = ''; detailOpen = true; render(`talent-${n.id}`, 'detail');
                    } },
                  h('span', { class: 'talent-icon', 'aria-hidden': 'true' }, n.icon),
                  h('span', { class: 'talent-rank' }, t('talents.rankBadge', { rank: r, max: n.maxRank }))),
                  h('div', { class: 'talent-node-name' }, n.name),
                  tier === 2 ? h('span', { class: 'talent-cap-label' }, t('talents.capstone')) : null);
              }))),
          ))),
        h('section', { class: 'talent-detail', 'aria-label': t('talents.selected') },
          h('button', { class: 'talent-detail-close', 'aria-label': t('talents.closeDetails'), onclick: closeDetail }, '×'),
          h('div', { class: 'row wrap' }, h('strong', {}, `${talent.icon} ${talent.name}`), h('span', { class: 'chip' }, t('talents.rank', { rank, max: talent.maxRank }))),
          rank > 0 ? h('p', { class: 'small' }, t('talents.current', { text: talent.desc(rank) })) : null,
          rank < talent.maxRank ? h('p', { class: 'small' }, t('talents.nextRank', { text: talent.desc(rank + 1) })) : null,
          h('div', { class: 'small talent-requirement' }, lock ?? (rank === talent.maxRank ? t('talents.fullyLearned') : progress.total === spent ? t('talents.noPoints') : t('talents.ready'))),
          h('div', { class: 'row talent-actions' },
            h('button', { id: 'talent-refund', disabled: rank === 0, onclick: () => update(-1) }, t('talents.refund')),
            h('button', { id: 'talent-learn', class: 'primary', disabled: !!lock || rank === talent.maxRank || spent >= progress.total, onclick: () => update(1) }, t('talents.learn'))),
          h('div', { class: 'small muted' }, t('talents.refundNote')),
          h('div', { class: 'small talent-notice', role: 'status' }, notice)),
        h('p', { class: 'small muted talent-rules' }, t('talents.rules')),
      ),
      h('div', { class: 'talent-footer' },
        h('div', { class: 'small muted' }, changed ? t('talents.unapplied') : t('talents.allocated', { spent, total: progress.total })),
        h('div', { class: 'row' },
          h('button', { id: 'talent-reset', disabled: spent === 0, onclick: () => { draft = {}; notice = t('talents.draftReset'); render('talent-reset', 'reset'); } }, t('talents.resetAll')),
          h('button', { id: 'talent-apply', class: 'primary', disabled: !changed, onclick: () => { applyTalents(p, draft); save(); notice = t('talents.saved'); render('talent-apply', 'apply'); } }, t('talents.apply')))),
    );
    root.querySelector('.talent-scroll')!.scrollTop = scrollTop;
    root.toggleAttribute('data-detail-open', detailOpen);
    if (change === 'tree') {
      const tree = root.querySelector<HTMLElement>('.talent-tree.active')!;
      enter(tree, 'content', direction); revealItems(tree, '.talent-slot');
    }
    if (root.isConnected) tabFeedback(root.querySelector<HTMLElement>('.talent-tabs')!, oldTab);
    if (change === 'detail' || (detailOpen && change === 'rank'))
      enter(root.querySelector<HTMLElement>('.talent-detail')!, wasOpen ? 'content' : 'sheet', 0);
    if (change === 'detail' || change === 'close') feedback(root.querySelector(`#talent-${selected}`));
    if (change === 'rank' || change === 'reset' || change === 'apply') {
      feedback(root.querySelector(`#talent-${selected}`));
      feedback(root.querySelector('.talent-points'));
      feedback(root.querySelector('.talent-footer'));
      if (notice) feedback(root.querySelector('.talent-notice'));
      if (change === 'reset') revealItems(root.querySelector<HTMLElement>('.talent-tree.active')!, '.talent-slot');
    }
    if (focus) root.querySelector<HTMLElement>(`#${focus}`)?.focus({ preventScroll: true });
  };
  render();
  return {
    element: root,
    get detailOpen() { return detailOpen; },
    get dirty() { return dirty(); },
    closeDetail,
    discard: () => { draft = { ...p.talents }; detailOpen = false; notice = ''; render(undefined, 'close'); },
  };
}
