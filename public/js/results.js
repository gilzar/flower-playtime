// Shared game pieces: the score bar, "New best!" moments, the end-of-round card, banners and pause.
import { h, iconButton, mascot, confetti, tile, bounce, COLORS } from './ui.js';
import * as audio from './audio.js';
import * as scores from './scores.js';

/**
 * Score bar for the top of a game: close button, the score (big, in the middle) and her best.
 * setScore(n) also cheers once when she passes her old best mid-round.
 */
export function gameHud(game, { onClose, screenEl }) {
  const startBest = scores.best(game);
  let cheered = false;
  const num = h('span', { class: 'score-num' }, '0');
  const bestNum = h('b', {}, String(startBest));
  const bestPill = h('div', { class: 'best-pill' }, h('small', {}, 'Best'), bestNum);
  const el = h('div', { class: 'hud' },
    iconButton('close', onClose, { label: 'Back to the games' }),
    h('div', { class: 'score-pill', 'aria-live': 'polite' }, num),
    bestPill);
  return {
    el,
    setScore(n) {
      num.textContent = String(n);
      bounce(num);
      if (n > startBest) {
        bestNum.textContent = String(n);
        bestPill.classList.add('beaten');
        if (!cheered && startBest > 0) {
          cheered = true;
          audio.sparkle();
          banner(screenEl, 'New best! 🎉', { cls: 'gold' });
        }
      }
    },
  };
}

/** A big word that pops up in the middle of the screen and floats away. */
export function banner(screenEl, text, { cls = '', ms = 1300 } = {}) {
  const el = h('div', { class: `banner ${cls}` }, text);
  screenEl.append(el);
  setTimeout(() => el.remove(), ms);
  return el;
}

/** "Paused" card; tapping anywhere keeps playing. */
export function pauseCard(screenEl, onResume) {
  const el = h('button', { class: 'pause-card', 'aria-label': 'Keep playing' },
    h('div', { class: 'pause-inner' }, h('div', { class: 'pause-icon' }, '⏸️'), h('div', {}, 'Tap to keep playing')));
  el.addEventListener('click', () => { el.remove(); onResume(); });
  screenEl.append(el);
  return el;
}

/**
 * End-of-round card. A new high score gets the full pop-star moment: confetti, a fanfare,
 * the flower buddy in sunglasses and the score counting up.
 */
export function showResults(screenEl, scope, { game, score, onAgain, onHome, homeLabel = 'Games', homeIcon = '🏠' }) {
  const { isNew, previous, best } = scores.submit(game, score);
  const celebrate = isNew && score > 0;
  const close = score > 0 && !isNew && score >= best - 2;
  const title = celebrate ? 'New high score!' : close ? 'So close!' : score === 0 ? 'Try again!' : 'Great game!';
  const scoreEl = h('div', { class: 'results-score' }, celebrate ? '0' : String(score));
  const note = celebrate
    ? (previous > 0 ? `Your old best was ${previous}` : 'Your first high score!')
    : `Your best is ${best}. Can you beat it?`;
  const buttons = h('div', { class: 'results-buttons' },
    tile({ title: 'Play again', icon: '🔁', color: COLORS.pink, onClick: () => { audio.click(); onAgain(); }, id: 'playAgain' }),
    tile({ title: homeLabel, icon: homeIcon, color: COLORS.purple, cls: 'small', onClick: () => { audio.click(); onHome(); } }));
  const card = h('div', { class: `results-card ${celebrate ? 'new' : ''}` },
    mascot({ size: 110, mood: celebrate ? 'cheer' : 'happy' }),
    h('h2', { class: 'results-title' }, title),
    scoreEl,
    h('div', { class: 'results-note' }, note),
    buttons);
  const overlay = h('div', { class: 'results', role: 'dialog', 'aria-label': title }, card);
  screenEl.append(overlay);

  if (celebrate) {
    confetti(screenEl, scope);
    audio.fanfare();
    // Count the score up, a little sparkle per step.
    const steps = Math.min(score, 24);
    for (let i = 1; i <= steps; i++) {
      scope.timeout(() => {
        scoreEl.textContent = String(Math.round((score * i) / steps));
        if (i % 2 === 0 || i === steps) audio.tick(i);
      }, 250 + i * (900 / steps));
    }
    scope.timeout(() => bounce(scoreEl), 300 + 900);
  } else {
    audio.aww();
  }
  return overlay;
}
