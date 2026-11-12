// The games menu: three big buttons, each with her best score, and the grown-up Lock button.
import { h, mascot, stageLights, floatingNotes, tile, icon, COLORS } from './ui.js';
import * as audio from './audio.js';
import * as scores from './scores.js';
import { routes } from './nav.js';

export const GAMES = [
  { id: 'spin', title: 'Disco Spin', icon: '💿', color: COLORS.pink, note: 72 },
  { id: 'keys', title: 'Piano Pop', icon: '🎹', color: COLORS.blue, note: 76 },
  { id: 'worm', title: 'Wiggle Worm', icon: '🐛', color: COLORS.green, note: 79 },
];

export function Menu() {
  return {
    music: 'menu',
    render(scope) {
      const screen = h('div', { class: 'bg-stage menu' });
      const buddy = mascot({ size: 120 });
      buddy.addEventListener('click', () => {
        [[67, 0], [70, 0.12], [72, 0.24], [67, 0.48], [72, 0.6], [76, 0.72]].forEach(([m, t]) => audio.playNote(m, { inst: 'synth', volume: 0.6, delay: t }));
      });

      const open = (g) => {
        audio.playNote(g.note, { inst: 'synth', volume: 0.7 });
        if (g.id === 'keys') routes.songs();
        else routes[g.id]();
      };

      const askLock = () => {
        audio.click();
        const sheet = h('div', { class: 'confirm', role: 'dialog', 'aria-label': 'Lock playtime?' },
          h('div', { class: 'confirm-card' },
            h('div', { class: 'confirm-title' }, 'All done playing?'),
            h('div', { class: 'confirm-sub' }, 'A grown-up will need to unlock it again.'),
            h('button', { class: 'chunky confirm-btn', style: { '--c': COLORS.purple }, id: 'lockNow', onClick: () => routes.lock() }, '🔒 Lock playtime'),
            h('button', { class: 'chunky confirm-btn', style: { '--c': COLORS.green }, onClick: () => sheet.remove() }, '🎮 Keep playing')));
        screen.append(sheet);
      };

      screen.append(
        stageLights(),
        floatingNotes(),
        h('div', { class: 'menu-top' },
          h('button', { class: 'lock-pill', id: 'lockButton', 'aria-label': 'Lock playtime', onClick: askLock }, icon('lock'), h('span', {}, 'Lock'))),
        h('div', { class: 'menu-hero' }, buddy, h('h1', { class: 'app-title' }, "Flower's", h('br'), 'Playtime')),
        h('div', { class: 'spacer' }),
        h('div', { class: 'menu-stack' }, GAMES.map((g) => {
          const best = scores.best(g.id);
          return tile({
            title: g.title, icon: g.icon, color: g.color, id: `play-${g.id}`,
            subtitle: best ? `Best: ${best}` : 'Play!',
            onClick: () => open(g),
          });
        })),
        h('div', { class: 'spacer' }));
      return screen;
    },
  };
}
