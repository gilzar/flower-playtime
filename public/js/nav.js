// Shows one screen at a time, with a quick fade. Each screen is { music, render(scope), pause? }.
import { Scope } from './ui.js';
import * as audio from './audio.js';

let root = null;
let current = null;

/** Screen openers, filled in by app.js (keeps the game files free of import cycles). */
export const routes = {};

export function initNav(el) {
  root = el;
}

export function show(screen) {
  const prev = current;
  const scope = new Scope();
  const el = screen.render(scope);
  el.classList.add('screen', 'enter');
  root.append(el);
  el.getBoundingClientRect(); // apply the starting style so the fade-in animates
  el.classList.remove('enter');
  if (prev) {
    prev.scope.dispose();
    prev.el.classList.add('leave');
    setTimeout(() => prev.el.remove(), 320);
  }
  current = { el, scope, screen };
  audio.music(screen.music || null);
}

/** The app went to the background: let a running game pause itself. */
export function pauseCurrent() {
  current?.screen.pause?.();
}
