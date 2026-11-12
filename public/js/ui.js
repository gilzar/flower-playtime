// Small DOM helpers and the shared pop-star look: the flower buddy, stage lights, confetti.
// (Adapted from Flower Learns.)

export const COLORS = {
  pink: '#FF6B9E', purple: '#996BF2', blue: '#4599FF', teal: '#21BDAD', green: '#52C761',
  yellow: '#FFC72E', orange: '#FF9438', red: '#F25C5C', ink: '#3D2E61', paper: '#FFFCF7',
};
export const RAINBOW = [COLORS.pink, COLORS.orange, COLORS.yellow, COLORS.green, COLORS.teal, COLORS.blue, COLORS.purple];

/** h('div', {class: 'x', onClick}, child, 'text') */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, sv);
        else el.style[sk] = sv;
      }
    } else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function fromHTML(str) {
  const t = document.createElement('template');
  t.innerHTML = str.trim();
  return t.content.firstElementChild;
}

/** Tracks timers/listeners so everything stops when a screen closes. */
export class Scope {
  constructor() { this.fns = []; this.alive = true; }
  add(fn) { this.fns.push(fn); }
  timeout(fn, ms) {
    const id = setTimeout(() => { if (this.alive) fn(); }, ms);
    this.add(() => clearTimeout(id));
  }
  /** Calls fn(now) every animation frame until it returns false. */
  loop(fn) {
    let id;
    const tick = (t) => {
      if (!this.alive) return;
      if (fn(t) !== false) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    this.add(() => cancelAnimationFrame(id));
  }
  on(target, ev, fn, opts) {
    target.addEventListener(ev, fn, opts);
    this.add(() => target.removeEventListener(ev, fn, opts));
  }
  dispose() {
    this.alive = false;
    this.fns.splice(0).forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
  }
}

// ---- Icons ----

const ICONS = {
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" fill="none"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 4.5L7.5 12l7.5 7.5" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor"/><path d="M8 10.5V8a4 4 0 018 0v2.5" stroke="currentColor" stroke-width="2.4" fill="none"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/></svg>',
};
export const icon = (name) => fromHTML(ICONS[name]);

export function iconButton(name, onClick, { label, cls = '' } = {}) {
  return h('button', { class: `round-btn ${cls}`, 'aria-label': label || name, onClick }, icon(name));
}

/** Big chunky button: emoji + title (+ optional subtitle on the right). */
export function tile({ title, icon: emoji, color, subtitle, cls = '', onClick, id }) {
  return h('button', { class: `chunky tile ${cls}`, style: { '--c': color }, onClick, id },
    h('span', { class: 'tile-icon' }, emoji),
    h('span', { class: 'tile-text' }, h('span', { class: 'tile-title' }, title), subtitle ? h('span', { class: 'tile-sub' }, subtitle) : null),
    h('span', { class: 'tile-arrow' }, icon('play')));
}

/** Flower's buddy: a smiling, dancing flower with headphones (pure SVG + CSS animation). */
let mascotCount = 0;
export function mascot({ size = 150, mood = 'happy', petal = COLORS.pink, dancing = true } = {}) {
  const gid = `face${++mascotCount}`;
  let petals = '';
  for (let i = 0; i < 8; i++) {
    petals += `<ellipse cx="100" cy="42" rx="31" ry="43" fill="${petal}" opacity="${i % 2 ? 0.78 : 1}" transform="rotate(${i * 45} 100 100)"/>`;
  }
  return fromHTML(`
  <svg class="mascot ${mood} ${dancing ? 'dance' : ''}" viewBox="0 0 200 270" style="width:${size}px;height:${size * 1.35}px" aria-hidden="true">
    <defs>
      <radialGradient id="${gid}" cx="45%" cy="40%" r="65%"><stop offset="0" stop-color="#FFE27A"/><stop offset=".7" stop-color="${COLORS.yellow}"/><stop offset="1" stop-color="#FFAA40"/></radialGradient>
    </defs>
    <g class="stem">
      <rect x="95" y="150" width="10" height="110" rx="5" fill="${COLORS.green}"/>
      <ellipse cx="128" cy="206" rx="28" ry="12" fill="${COLORS.green}" opacity=".9" transform="rotate(-30 128 206)"/>
      <ellipse cx="74" cy="226" rx="24" ry="10" fill="${COLORS.green}" opacity=".9" transform="rotate(30 74 226)"/>
    </g>
    <g class="head">
      <g class="petals">${petals}</g>
      <circle cx="100" cy="100" r="54" fill="url(#${gid})" stroke="${COLORS.orange}" stroke-width="4"/>
      <g class="eyes">
        <ellipse cx="82" cy="94" rx="7" ry="10" fill="${COLORS.ink}"/><circle cx="84.5" cy="90" r="2.6" fill="#fff"/>
        <ellipse cx="118" cy="94" rx="7" ry="10" fill="${COLORS.ink}"/><circle cx="120.5" cy="90" r="2.6" fill="#fff"/>
      </g>
      <circle cx="70" cy="110" r="8" fill="${COLORS.pink}" opacity=".5"/>
      <circle cx="130" cy="110" r="8" fill="${COLORS.pink}" opacity=".5"/>
      <path class="mouth m-happy" d="M86 116 Q100 132 114 116" stroke="${COLORS.ink}" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path class="mouth m-cheer" d="M84 114 Q100 140 116 114 Z" fill="#C0334D" stroke="#C0334D" stroke-width="2" stroke-linejoin="round"/>
      <ellipse class="mouth m-oops" cx="100" cy="120" rx="7" ry="6" stroke="${COLORS.ink}" stroke-width="4.5" fill="none"/>
      <g class="glasses">
        <path d="M82 76 l5.5 11 12 1.6 -8.7 8.4 2.1 12 -10.9-5.7 -10.9 5.7 2.1-12 -8.7-8.4 12-1.6z" fill="${COLORS.ink}" stroke="${COLORS.pink}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M118 76 l5.5 11 12 1.6 -8.7 8.4 2.1 12 -10.9-5.7 -10.9 5.7 2.1-12 -8.7-8.4 12-1.6z" fill="${COLORS.ink}" stroke="${COLORS.pink}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M94 93 Q100 89 106 93" stroke="${COLORS.pink}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        <path d="M76 86 l4 -3" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".8"/>
      </g>
      <g class="headphones">
        <path d="M34 104 A66 66 0 0 1 166 104" stroke="${COLORS.ink}" stroke-width="9" fill="none" stroke-linecap="round"/>
        <rect x="20" y="86" width="24" height="42" rx="11" fill="${COLORS.purple}" stroke="${COLORS.ink}" stroke-width="4"/>
        <rect x="156" y="86" width="24" height="42" rx="11" fill="${COLORS.purple}" stroke="${COLORS.ink}" stroke-width="4"/>
        <circle cx="32" cy="107" r="5" fill="${COLORS.pink}"/><circle cx="168" cy="107" r="5" fill="${COLORS.pink}"/>
      </g>
    </g>
  </svg>`);
}

/** Concert lights: two sweeping spotlights and twinkling sparkles. */
export function stageLights() {
  const el = h('div', { class: 'stage-lights', 'aria-hidden': 'true' },
    h('span', { class: 'beam beam-l' }), h('span', { class: 'beam beam-r' }));
  for (let i = 0; i < 14; i++) {
    el.append(h('span', {
      class: 'sparkle',
      style: { left: `${4 + Math.random() * 92}%`, top: `${3 + Math.random() * 90}%`, animationDelay: `${-Math.random() * 3}s`, fontSize: `${10 + Math.random() * 14}px` },
    }, i % 3 ? '✦' : '★'));
  }
  return el;
}

/** Notes slowly drifting up behind menus. */
export function floatingNotes() {
  const el = h('div', { class: 'floating-notes', 'aria-hidden': 'true' });
  const symbols = ['♪', '♫', '♩', '♬', '♥'];
  for (let i = 0; i < 12; i++) {
    el.append(h('span', {
      style: {
        left: `${5 + Math.random() * 90}%`,
        fontSize: `${20 + Math.random() * 18}px`,
        color: RAINBOW[i % RAINBOW.length],
        animationDuration: `${18 + Math.random() * 16}s`,
        animationDelay: `${-Math.random() * 30}s`,
      },
    }, symbols[i % symbols.length]));
  }
  return el;
}

/** Falling confetti + notes for celebrations. Removes itself when done. */
export function confetti(parent, scope) {
  const canvas = h('canvas', { class: 'confetti' });
  parent.append(canvas);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = parent.clientWidth, hgt = parent.clientHeight;
  canvas.width = w * dpr;
  canvas.height = hgt * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const pieces = Array.from({ length: 80 }, (_, i) => ({
    x: Math.random() * w, vx: (Math.random() - 0.5) * 120, vy: 60 + Math.random() * 160,
    spin: (Math.random() - 0.5) * 12, size: 8 + Math.random() * 8,
    color: RAINBOW[Math.floor(Math.random() * RAINBOW.length)],
    symbol: i % 5 === 0 ? ['♪', '♥', '♫', '✿'][i % 4] : null, delay: Math.random() * 0.6,
  }));
  const start = performance.now();
  scope.loop((now) => {
    const t = (now - start) / 1000;
    ctx.clearRect(0, 0, w, hgt);
    for (const p of pieces) {
      const tt = t - p.delay;
      if (tt < 0) continue;
      const y = -30 + p.vy * tt + 210 * tt * tt;
      if (y > hgt + 40) continue;
      const x = p.x + p.vx * tt + Math.sin(tt * 3 + p.spin) * 14;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(tt * p.spin * 0.5);
      ctx.fillStyle = p.color;
      if (p.symbol) {
        ctx.font = `900 ${p.size * 2}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(p.symbol, 0, 0);
      } else ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (t > 5) { canvas.remove(); return false; }
    return true;
  });
}

export function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth; // restart the animation
  el.classList.add('shake');
}

export function bounce(el) {
  el.classList.remove('bounce');
  void el.offsetWidth;
  el.classList.add('bounce');
}

/**
 * A crisp canvas that fills its box and follows its size (and the phone's pixel density, capped at 2×
 * so older iPhones keep 60 fps). onResize(w, h) runs whenever the size changes, in CSS pixels.
 */
export function stageCanvas(canvas, scope, onResize) {
  const ctx = canvas.getContext('2d');
  const view = { ctx, w: 0, h: 0, dpr: 1, ready: false };
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.w = r.width;
    view.h = r.height;
    canvas.width = Math.round(r.width * view.dpr);
    canvas.height = Math.round(r.height * view.dpr);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    view.ready = true;
    onResize?.(view.w, view.h);
  };
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    scope.add(() => ro.disconnect());
  }
  scope.on(window, 'resize', resize);
  scope.timeout(resize, 0);
  return view;
}

/** Seeded random numbers (so a song's tiles land in the same lanes every time). */
export function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
