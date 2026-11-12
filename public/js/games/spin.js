// Disco Spin: tap to throw heart wands into a spinning record, without hitting the hearts already
// stuck in it. Every wand that sticks plays the next note of a disco riff. Throw all the wands to
// clear the level; levels spin faster, wobble, stop-and-go or flip direction.
import { h, stageLights, stageCanvas, RAINBOW, COLORS, rand, clamp } from '../ui.js';
import * as audio from '../audio.js';
import { routes } from '../nav.js';
import { gameHud, showResults, pauseCard, banner } from '../results.js';

const GAME = 'spin';
const TAU = Math.PI * 2;
const FLY_SPEED = 2400; // px per second
const RIFF = [72, 76, 79, 81, 79, 76, 74, 76, 72, 79, 84, 81, 79, 76, 77, 74]; // original
const LABELS = [COLORS.pink, COLORS.teal, COLORS.orange, COLORS.purple, COLORS.blue, COLORS.green, COLORS.red];

const angDiff = (a, b) => {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
const norm = (a) => ((a % TAU) + TAU) % TAU;
const easeOutBack = (x) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);

/** How each level spins: wands to throw, wands already stuck ("blocks"), speed and style. */
export function levelPlan(n) {
  const table = [
    { wands: 5, blocks: 0, speed: 1.2, style: 'steady', dir: 1 },
    { wands: 6, blocks: 1, speed: 1.45, style: 'steady', dir: -1 },
    { wands: 6, blocks: 2, speed: 1.5, style: 'wobble', dir: 1 },
    { wands: 7, blocks: 2, speed: 1.7, style: 'flip', dir: 1 },
    { wands: 7, blocks: 3, speed: 1.9, style: 'steady', dir: -1 },
    { wands: 8, blocks: 2, speed: 1.8, style: 'stopgo', dir: 1 },
    { wands: 8, blocks: 3, speed: 2.0, style: 'flip', dir: -1 },
  ];
  if (n <= table.length) return table[n - 1];
  const styles = ['wobble', 'flip', 'stopgo', 'steady'];
  return {
    wands: Math.min(10, 6 + Math.floor(n / 3)),
    blocks: Math.min(4, 2 + Math.floor(n / 5)),
    speed: Math.min(2.8, 1.9 + (n - 7) * 0.08),
    style: styles[n % styles.length],
    dir: n % 2 ? 1 : -1,
  };
}

function spinRate(plan, t) {
  const b = plan.speed * plan.dir;
  switch (plan.style) {
    case 'wobble': return b * (1 + 0.7 * Math.sin(t * 1.7));
    case 'flip': return b * clamp(1.8 * Math.sin((t * TAU) / 5.5 + 0.6), -1, 1);
    case 'stopgo': return b * (0.12 + 1.5 * Math.max(0, Math.sin((t * TAU) / 3.2)) ** 2);
    default: return b;
  }
}

function heartPath(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(0, s * 0.95);
  ctx.bezierCurveTo(-s * 1.25, s * 0.1, -s * 0.85, -s * 0.95, 0, -s * 0.4);
  ctx.bezierCurveTo(s * 0.85, -s * 0.95, s * 1.25, s * 0.1, 0, s * 0.95);
  ctx.closePath();
}

/** A wand whose tip is at (x, y), pointing along dir (the heart end is dir-ward). */
function drawWand(ctx, x, y, dir, color, len, hr, { block = false, flash = false } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(dir);
  ctx.lineCap = 'round';
  ctx.strokeStyle = block ? '#A79FC0' : '#FFF4CF';
  ctx.lineWidth = Math.max(4, hr * 0.36);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(len, 0);
  ctx.stroke();
  ctx.translate(len + hr * 0.75, 0);
  ctx.rotate(Math.PI / 2);
  if (flash) {
    ctx.beginPath();
    ctx.arc(0, 0, hr * 1.7, 0, TAU);
    ctx.fillStyle = 'rgba(255, 70, 70, .45)';
    ctx.fill();
  }
  heartPath(ctx, hr);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = flash ? '#FF3B30' : 'rgba(255, 255, 255, .95)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-hr * 0.38, -hr * 0.18, hr * 0.17, 0, TAU);
  ctx.fillStyle = 'rgba(255, 255, 255, .65)';
  ctx.fill();
  ctx.restore();
}

export function DiscoSpin() {
  const game = { pause: () => {} };
  return {
    music: 'spin',
    pause: () => game.pause(),
    render(scope) {
      const screen = h('div', { class: 'bg-stage game spin' });
      const canvas = h('canvas', { class: 'game-canvas' });
      const area = h('div', { class: 'game-area', 'aria-label': 'Tap to throw' }, canvas);
      const hud = gameHud(GAME, { onClose: () => routes.menu(), screenEl: screen });
      const hint = h('div', { class: 'hint' }, '👆 Tap to throw a heart!');
      const levelTag = h('div', { class: 'level-tag' }, 'Level 1');
      screen.append(stageLights(), area, hud.el, hint, levelTag);

      // ---- state ----
      let state = 'play'; // 'play' | 'clear' | 'over'
      let paused = false;
      let level = 1, plan = levelPlan(1), t = 0, rot = 0;
      let score = 0, left = 0, colorIdx = 0, riff = 0, lastThrow = 0, thrownAny = false;
      let stuck = [], flying = [], debris = [], sparks = [];
      let bump = 0, shakeT = 0, labelColor = LABELS[0];
      let rec = { mode: 'grow', t: 0 }; // record animation: 'grow' | 'idle' | 'pop' | 'gone'

      // ---- layout (CSS px inside the game area) ----
      let W = 0, H = 0, cx = 0, cy = 0, R = 100, L = 80, hr = 14, inset = 12, launchY = 0, gap = 0.1;
      const view = stageCanvas(canvas, scope, (w, hh) => {
        W = w; H = hh;
        R = Math.min(w * 0.26, hh * 0.15, 130);
        L = R * 0.72;
        hr = Math.max(13, R * 0.18);
        inset = R * 0.12;
        cx = w / 2;
        cy = Math.max(R + L + 1.5 * hr + 10, hh * 0.33);
        launchY = Math.max(cy + R + 60, hh - (L + inset + 1.5 * hr) - 12);
        // Two hearts bump when their centers are closer than about one heart width (a little forgiving).
        const rho = R - inset + (L + inset) + 0.75 * hr;
        gap = 2 * Math.asin(Math.min(0.95, (0.9 * hr * 0.85) / rho));
      });

      function startLevel(n) {
        level = n;
        plan = levelPlan(n);
        t = 0;
        rot = 0;
        left = plan.wands;
        stuck = [];
        labelColor = LABELS[(n - 1) % LABELS.length];
        const angles = [];
        for (let tries = 0; angles.length < plan.blocks && tries < 300; tries++) {
          const a = rand(0, TAU);
          if (Math.abs(angDiff(a, Math.PI / 2)) < 0.7) continue; // never right where the first wand lands
          if (angles.some((b) => Math.abs(angDiff(a, b)) < 0.9)) continue;
          angles.push(a);
        }
        for (const a of angles) stuck.push({ a, color: '#D9D3EA', block: true, wob: 0, flash: false });
        levelTag.textContent = `Level ${n}`;
        rec = { mode: 'grow', t: 0 };
        state = 'play';
      }

      function throwWand() {
        if (state !== 'play' || paused || left <= 0) return;
        const now = performance.now();
        if (now - lastThrow < 130) return;
        lastThrow = now;
        left--;
        flying.push({ y: launchY, color: RAINBOW[colorIdx++ % RAINBOW.length] });
        audio.whoosh();
        if (!thrownAny) { thrownAny = true; hint.classList.add('gone'); }
      }

      function burst(x, y, color, n = 8, up = -1) {
        for (let i = 0; i < n; i++) {
          const a = rand(0, Math.PI) * up;
          const v = rand(120, 320);
          sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color: i % 2 ? '#fff' : color });
        }
      }

      function land(f) {
        const a = norm(Math.PI / 2 - rot);
        const hit = stuck.find((s) => Math.abs(angDiff(a, s.a)) < gap);
        if (hit) { crash(f, hit); return; }
        stuck.push({ a, color: f.color, wob: 1, flash: false });
        score++;
        hud.setScore(score);
        audio.thunk();
        audio.playNote(RIFF[riff++ % RIFF.length], { inst: 'synth', volume: 0.5 });
        bump = 1;
        burst(cx, cy + R, f.color, 8, 1);
      }

      function crash(f, hit) {
        state = 'over';
        hit.flash = true;
        audio.clink();
        shakeT = 0.45;
        for (const g of [f, ...flying.filter((x) => x !== f)]) {
          debris.push({ x: cx, y: Math.max(cy + R, g.y), vx: rand(-180, 180), vy: -rand(200, 320), ang: Math.PI / 2, spin: rand(-10, 10), color: g.color });
        }
        flying = [];
        scope.timeout(() => showResults(screen, scope, { game: GAME, score, onAgain: () => routes.spin(), onHome: () => routes.menu() }), 1100);
      }

      function clearLevel() {
        state = 'clear';
        audio.pop();
        audio.playSequence([72, 76, 79, 84, 88], 0.08, { inst: 'bell', volume: 0.5 });
        for (const s of stuck) {
          const th = s.a + rot;
          const r0 = R + L * 0.4;
          const v = rand(260, 440);
          debris.push({ x: cx + Math.cos(th) * r0, y: cy + Math.sin(th) * r0, vx: Math.cos(th) * v, vy: Math.sin(th) * v - 160, ang: th, spin: rand(-8, 8), color: s.color, block: s.block });
        }
        stuck = [];
        for (let i = 0; i < 3; i++) burst(cx + rand(-R, R) * 0.5, cy + rand(-R, R) * 0.5, RAINBOW[i * 2], 10, i % 2 ? 1 : -1);
        rec = { mode: 'pop', t: 0 };
        banner(screen, `Level ${level + 1}!`);
        scope.timeout(() => startLevel(level + 1), 1250);
      }

      function update(dt) {
        t += dt;
        if (state !== 'clear') rot += spinRate(plan, t) * dt;
        rec.t += dt;
        if (rec.mode === 'grow' && rec.t > 0.45) rec = { mode: 'idle', t: 0 };
        if (rec.mode === 'pop' && rec.t > 0.28) rec = { mode: 'gone', t: 0 };
        bump = Math.max(0, bump - dt * 6);
        shakeT = Math.max(0, shakeT - dt);
        for (const s of stuck) s.wob = Math.max(0, s.wob - dt * 3.5);

        for (const f of flying) {
          f.y -= FLY_SPEED * dt;
          if (f.y <= cy + R && state === 'play') { f.done = true; land(f); }
        }
        flying = flying.filter((f) => !f.done);
        if (state === 'play' && left === 0 && flying.length === 0) clearLevel();

        for (const d of debris) {
          d.vy += 1500 * dt;
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          d.ang += d.spin * dt;
        }
        debris = debris.filter((d) => d.y < H + 150);
        for (const s of sparks) {
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.vy += 500 * dt;
          s.life -= dt * 2.2;
        }
        sparks = sparks.filter((s) => s.life > 0);
      }

      function drawRecord(ctx) {
        ctx.save();
        ctx.translate(cx, cy);
        // Soft pink glow under the record.
        const glow = ctx.createRadialGradient(0, 0, R * 0.8, 0, 0, R * 1.5);
        glow.addColorStop(0, 'rgba(255, 140, 220, .45)');
        glow.addColorStop(1, 'rgba(255, 140, 220, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, R * 1.5, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, TAU);
        ctx.fillStyle = '#21183A';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255, 255, 255, .22)';
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255, 255, 255, .08)';
        for (let r = R * 0.48; r < R * 0.95; r += R * 0.07) {
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, TAU);
          ctx.stroke();
        }
        ctx.rotate(rot);
        // Two shiny wedges that turn with the record, so the spin is easy to see.
        ctx.fillStyle = 'rgba(255, 255, 255, .09)';
        for (const k of [0, Math.PI]) {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, R * 0.96, k, k + 0.55);
          ctx.closePath();
          ctx.fill();
        }
        // The label: a little white flower.
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.4, 0, TAU);
        ctx.fillStyle = labelColor;
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, .92)';
        for (let i = 0; i < 6; i++) {
          const a = (i * TAU) / 6;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * R * 0.18, Math.sin(a) * R * 0.18, R * 0.095, 0, TAU);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.1, 0, TAU);
        ctx.fillStyle = COLORS.yellow;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.03, 0, TAU);
        ctx.fillStyle = '#21183A';
        ctx.fill();
        ctx.restore();
        // A fixed shine on top.
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.8, Math.PI * 1.08, Math.PI * 1.42);
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(255, 255, 255, .22)';
        ctx.stroke();
      }

      function draw() {
        const ctx = view.ctx;
        ctx.clearRect(0, 0, W, H);
        ctx.save();
        if (shakeT > 0) ctx.translate(rand(-1, 1) * shakeT * 16, rand(-1, 1) * shakeT * 10);

        // The record and its wands, scaled together for the bump / grow / pop animations.
        let scale = 1 + 0.045 * bump, alpha = 1;
        if (rec.mode === 'grow') scale = Math.max(0.05, easeOutBack(Math.min(1, rec.t / 0.45)));
        if (rec.mode === 'pop') { scale = 1 + rec.t * 1.2; alpha = Math.max(0, 1 - rec.t / 0.28); }
        if (rec.mode !== 'gone') {
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.translate(cx, cy);
          ctx.scale(scale, scale);
          ctx.translate(-cx, -cy);
          for (const s of stuck) {
            const th = s.a + rot + Math.sin(s.wob * 18) * 0.06 * s.wob;
            drawWand(ctx, cx + Math.cos(th) * (R - inset), cy + Math.sin(th) * (R - inset), th, s.color, L + inset, hr, s);
          }
          drawRecord(ctx);
          ctx.restore();
        }

        for (const f of flying) drawWand(ctx, cx, f.y, Math.PI / 2, f.color, L + inset, hr);
        if (state === 'play' && left > 0) {
          const bob = Math.sin(performance.now() / 260) * 3;
          drawWand(ctx, cx, launchY + bob, Math.PI / 2, RAINBOW[colorIdx % RAINBOW.length], L + inset, hr);
        }
        for (const d of debris) {
          ctx.save();
          ctx.translate(d.x, d.y);
          ctx.rotate(d.ang - Math.PI / 2);
          drawWand(ctx, 0, -(L + inset) / 2, Math.PI / 2, d.color, L + inset, hr, d);
          ctx.restore();
        }
        for (const s of sparks) {
          ctx.globalAlpha = Math.max(0, s.life);
          ctx.fillStyle = s.color;
          ctx.beginPath();
          ctx.arc(s.x, s.y, 3 + 3 * s.life, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        // Wands still to throw, as little hearts in the corner (the next one waits in the middle).
        const waiting = state === 'play' ? Math.max(0, left - 1) : 0;
        for (let i = 0; i < waiting; i++) {
          ctx.save();
          ctx.translate(24, H - 22 - i * 26);
          heartPath(ctx, 9);
          ctx.fillStyle = RAINBOW[(colorIdx + 1 + i) % RAINBOW.length];
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#fff';
          ctx.stroke();
          ctx.restore();
        }
      }

      scope.on(area, 'pointerdown', (e) => { e.preventDefault(); throwWand(); });

      game.pause = () => {
        if (paused || state === 'over') return;
        paused = true;
        pauseCard(screen, () => { paused = false; });
      };

      startLevel(1);
      let last = performance.now();
      scope.loop((now) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (!view.ready) return;
        if (!paused) update(dt);
        draw();
      });
      return screen;
    },
  };
}
