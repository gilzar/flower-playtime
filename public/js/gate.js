// The grown-up lock: a multiplication question on a keypad. Shown every time the app opens,
// after it's been in the background for a while, and when a grown-up taps Lock.
import { h, mascot, stageLights, icon, shake } from './ui.js';
import * as audio from './audio.js';

const question = () => [6 + Math.floor(Math.random() * 4), 4 + Math.floor(Math.random() * 6)];

export function Gate({ onUnlock }) {
  return {
    music: null,
    render(scope) {
      let [a, b] = question();
      let entry = '';
      let done = false;
      const q = h('div', { class: 'gate-q' }, `What is ${a} × ${b}?`);
      const shown = h('div', { class: 'gate-entry', 'aria-live': 'polite' }, ' ');
      const card = h('div', { class: 'gate-card' });

      const press = (k) => {
        if (done) return;
        if (k === '⌫') { entry = entry.slice(0, -1); audio.click(); }
        else if (k === 'OK') {
          if (entry && Number(entry) === a * b) {
            done = true;
            card.classList.add('opened');
            audio.fanfare();
            scope.timeout(onUnlock, 650);
            return;
          }
          entry = '';
          [a, b] = question();
          q.textContent = `What is ${a} × ${b}?`;
          audio.boop();
          shake(shown);
        } else if (entry.length < 3) { entry += k; audio.click(); }
        shown.textContent = entry || ' ';
      };

      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'];
      card.append(
        h('div', { class: 'gate-head' }, icon('lock'), h('span', {}, 'Grown-ups only')),
        q, shown,
        h('div', { class: 'keypad' }, keys.map((k) => h('button', {
          class: k === 'OK' ? 'ok' : k === '⌫' ? 'del' : '',
          'aria-label': k === '⌫' ? 'Delete' : k,
          onClick: () => press(k),
        }, k))));

      return h('div', { class: 'bg-stage gate-screen' },
        stageLights(),
        h('div', { class: 'gate-top' },
          mascot({ size: 92 }),
          h('div', {},
            h('h1', { class: 'app-title' }, "Flower's Playtime"),
            h('div', { class: 'gate-sub' }, 'Ask a grown-up to start playtime!'))),
        h('div', { class: 'spacer' }),
        card,
        h('div', { class: 'spacer' }));
    },
  };
}
