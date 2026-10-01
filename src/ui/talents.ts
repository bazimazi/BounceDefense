import { TALENTS, TALENT_MAP, TALENT_TREES, TALENT_XP_PER_POINT, talentRequirement, talentSpent, type TalentTree } from '../data/talents';
import { applyTalents, changeTalent, talentProgress } from '../meta/talents';
import type { Profile } from '../meta/types';
import { bar, h } from './dom';

/** Local draft: experimentation is free, and only Apply writes to the profile. */
export function talentScreen(p: Profile, save: () => void, back: () => void): HTMLElement {
  const root = h('div', { class: 'screen talent-screen' });
  let draft = { ...p.talents };
  let active: TalentTree = 'kinetics';
  let selected = 'bankcraft';
  let notice = '';
  const progress = talentProgress(p);
  const render = (focus?: string) => {
    const scrollTop = root.querySelector('.talent-scroll')?.scrollTop ?? 0;
    const spent = talentSpent(draft);
    const dirty = TALENTS.some(t => (draft[t.id] ?? 0) !== (p.talents[t.id] ?? 0));
    const t = TALENT_MAP[selected];
    const rank = draft[t.id] ?? 0;
    const lock = talentRequirement(draft, t);
    const update = (delta: 1 | -1) => {
      const next = changeTalent(draft, selected, delta, progress.total);
      if (!next) return;
      const refunded = spent - talentSpent(next);
      draft = next;
      notice = refunded > 1 ? `${refunded} points refunded, including dependent talents.` : '';
      render(delta === 1 ? 'talent-learn' : 'talent-refund');
    };
    root.replaceChildren(
      h('div', { class: 'topbar' },
        h('button', { class: 'ghost', onclick: back, 'aria-label': 'Back; discard unapplied talent changes' }, '←'),
        h('h2', {}, 'Talents'), h('span', { class: 'chip talent-points', 'aria-live': 'polite' }, `${progress.total - spent} points available`)),
      h('div', { class: 'scroll talent-scroll' },
        h('div', { class: 'talent-intro' }, h('span', { class: 'eyebrow' }, 'CHOOSE YOUR SPECIALIZATION'),
          h('p', {}, 'Three disciplines. One shared budget. Shape every run.'),
          h('div', { class: 'small muted' }, `3 starting points + 1 per ${TALENT_XP_PER_POINT} total Mastery XP across all cores. ${progress.total}/15 earned.`,
            progress.next ? ` Next point in ${progress.next} XP.` : ' All points earned.'),
          bar(progress.next ? (TALENT_XP_PER_POINT - progress.next) / TALENT_XP_PER_POINT : 1, 'gold')),
        h('div', { class: 'talent-tabs', 'aria-label': 'Talent trees' }, TALENT_TREES.map(tree =>
          h('button', { class: active === tree.id ? 'on' : '', 'aria-pressed': active === tree.id ? 'true' : 'false',
            style: `--tree-color:${tree.color}`, onclick: () => { active = tree.id; selected = TALENTS.find(n => n.tree === active)!.id; render(); } },
          `${tree.icon} ${tree.name}`, h('span', {}, String(talentSpent(draft, tree.id)))))),
        h('div', { class: 'talent-forest' }, TALENT_TREES.map(tree =>
          h('section', { class: `talent-tree ${active === tree.id ? 'active' : ''}`, style: `--tree-color:${tree.color}`, 'aria-label': tree.name },
            h('div', { class: 'talent-tree-heading' }, h('span', { class: 'talent-tree-emblem', 'aria-hidden': 'true' }, tree.icon),
              h('div', {}, h('h3', {}, tree.name), h('span', { class: 'small muted' }, `${talentSpent(draft, tree.id)} points invested`))),
            h('p', { class: 'talent-tree-desc' }, tree.desc),
            ...[0, 1, 2].map(tier => h('div', { class: `talent-tier tier-${tier}` },
              TALENTS.filter(n => n.tree === tree.id && n.tier === tier).map(n => {
                const r = draft[n.id] ?? 0;
                const requirement = talentRequirement(draft, n);
                return h('div', { class: `talent-slot ${n.requires ? 'connected' : ''} ${!requirement ? 'unlocked' : ''}` },
                  h('button', { id: `talent-${n.id}`, class: `talent-node ${r ? 'learned' : ''} ${requirement ? 'locked-node' : ''} ${selected === n.id ? 'selected-node' : ''} ${tier === 2 ? 'capstone' : ''}`,
                    'aria-pressed': selected === n.id ? 'true' : 'false',
                    'aria-label': `${n.name}, rank ${r} of ${n.maxRank}${requirement ? `, ${requirement}` : ''}`,
                    title: n.desc(r || 1), onclick: () => {
                      selected = n.id; active = tree.id; notice = ''; render(`talent-${n.id}`);
                      root.querySelector('.talent-detail')?.scrollIntoView({ block: 'nearest' });
                    } },
                  h('span', { class: 'talent-icon', 'aria-hidden': 'true' }, n.icon),
                  h('span', { class: 'talent-rank' }, `${r}/${n.maxRank}`)),
                  h('div', { class: 'talent-node-name' }, n.name),
                  tier === 2 ? h('span', { class: 'talent-cap-label' }, 'CAPSTONE · 8 POINTS') : null);
              }))),
          ))),
        h('section', { class: 'talent-detail', 'aria-label': 'Selected talent' },
          h('div', { class: 'row wrap' }, h('strong', {}, `${t.icon} ${t.name}`), h('span', { class: 'chip' }, `Rank ${rank}/${t.maxRank}`)),
          rank > 0 ? h('p', { class: 'small' }, `Current: ${t.desc(rank)}`) : null,
          rank < t.maxRank ? h('p', { class: 'small' }, `Next rank: ${t.desc(rank + 1)}`) : null,
          h('div', { class: 'small talent-requirement' }, lock ?? (rank === t.maxRank ? 'Fully learned' : progress.total === spent ? 'No points available. Refund a talent or earn more Mastery XP.' : 'Ready to learn · 1 point')),
          h('div', { class: 'row talent-actions' },
            h('button', { id: 'talent-refund', disabled: rank === 0, onclick: () => update(-1) }, '− Refund'),
            h('button', { id: 'talent-learn', class: 'primary', disabled: !!lock || rank === t.maxRank || spent >= progress.total, onclick: () => update(1) }, '+ Learn rank')),
          h('div', { class: 'small muted' }, 'Refunding prerequisites also refunds their dependent talents.'),
          h('div', { class: 'small talent-notice', role: 'status' }, notice)),
        h('p', { class: 'small muted talent-rules' }, 'Talents persist across cores and runs. They complement Workshop and run upgrades; they never unlock synergies or evolutions. Risk Pacts still apply. Free respecs between runs.'),
      ),
      h('div', { class: 'talent-footer' },
        h('div', { class: 'small muted' }, dirty ? 'Unapplied changes · Back discards them' : `${spent}/${progress.total} points allocated · Saved`),
        h('div', { class: 'row' },
          h('button', { disabled: spent === 0, onclick: () => { draft = {}; notice = 'All points refunded in this draft.'; render(); } }, 'Reset all'),
          h('button', { class: 'primary', disabled: !dirty, onclick: () => { applyTalents(p, draft); save(); notice = 'Talents saved. Your next run will use this specialization.'; render(); } }, 'Apply talents'))),
    );
    root.querySelector('.talent-scroll')!.scrollTop = scrollTop;
    if (focus) root.querySelector<HTMLElement>(`#${focus}`)?.focus({ preventScroll: true });
  };
  render();
  return root;
}
