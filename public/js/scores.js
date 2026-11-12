// Per-game high scores, saved on this device.
const KEY = 'flowerPlaytime.best';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
}
let data = load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* private mode: keep it in memory */ }
}

export const best = (game) => data[game] || 0;

/** Records a finished round. Returns { isNew, previous, best }. */
export function submit(game, score) {
  const previous = best(game);
  const isNew = score > previous;
  if (isNew) { data[game] = score; save(); }
  return { isNew, previous, best: Math.max(previous, score) };
}

export function resetAll() {
  data = {};
  save();
}
