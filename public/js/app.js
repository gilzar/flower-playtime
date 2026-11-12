// Flower's Playtime: startup, the grown-up lock, and getting around.
import * as audio from './audio.js';
import * as scores from './scores.js';
import { initNav, show, routes, pauseCurrent } from './nav.js';
import { Gate } from './gate.js';
import { Menu } from './menu.js';
import { DiscoSpin } from './games/spin.js';
import { SongPicker, PianoPop } from './games/keys.js';
import { WiggleWorm } from './games/worm.js';

// Coming back after this long in the background counts as reopening the app: ask a grown-up again.
const RELOCK_AFTER_MS = 60 * 1000;

let unlocked = false;
let hiddenAt = 0;

routes.lock = () => { unlocked = false; show(Gate({ onUnlock: routes.unlock })); };
routes.unlock = () => { unlocked = true; routes.menu(); };
routes.menu = () => show(Menu());
routes.spin = () => show(DiscoSpin());
routes.songs = () => show(SongPicker());
routes.keys = (songId) => show(PianoPop(songId));
routes.worm = () => show(WiggleWorm());

// iPhones only allow sound after a tap: every tap makes sure it's on.
const wake = () => audio.unlock();
for (const ev of ['pointerdown', 'touchend', 'click']) document.addEventListener(ev, wake, true);

// iOS niceties: allow :active styles, no pinch-zoom, no double-tap zoom, no rubber-band scrolling.
document.addEventListener('touchstart', () => {}, { passive: true });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (!e.target.closest('.scroll')) e.preventDefault(); }, { passive: false });

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    pauseCurrent();
  } else if (unlocked && Date.now() - hiddenAt > RELOCK_AFTER_MS) {
    routes.lock();
  }
  audio.visibilityChanged();
});
// Safari can bring a page back from memory without reloading it: treat that as reopening.
addEventListener('pageshow', (e) => { if (e.persisted && unlocked) routes.lock(); });

initNav(document.getElementById('app'));

// Testing helpers, only on this computer (never on the real site):
//   ?play=menu|spin|songs|worm|keys-<song> skips the lock, ?reset clears the high scores.
const params = new URLSearchParams(location.search);
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
if (local && params.has('reset')) scores.resetAll();
const play = local && params.get('play');
if (play) {
  unlocked = true;
  const [name, arg] = play.split('-');
  (routes[name] || routes.menu)(arg);
} else {
  routes.lock();
}
