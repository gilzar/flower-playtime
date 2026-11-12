// Wiggle Worm: steer a rainbow worm (wearing headphones) around a disco dance floor, gobbling
// glowing snacks to grow longer; every snack plays a sparkly note. Computer worms wiggle around
// too: bump your head into one and the round is over. If one of them bumps into you, it pops
// into snacks.
import { h, stageCanvas, RAINBOW, COLORS, rand, pick, clamp } from '../ui.js';
import * as audio from '../audio.js';
import { routes } from '../nav.js';
import { gameHud, showResults, pauseCard } from '../results.js';

const GAME = 'worm';
const TAU = Math.PI * 2;
const ARENA = 1600;
const SEG_GAP = 8;
const FOOD_COUNT = 210;
const PLAYER_SPEED = 150;
const SNACK_NOTES = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84, 81, 79, 76, 74, 72, 69, 67, 64, 62];
const AI_COLORS = [COLORS.orange, COLORS.teal, COLORS.blue, COLORS.purple, COLORS.yellow, COLORS.green, COLORS.red];

const angDiff = (a, b) => {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

function makeWorm({ x, y, heading, length, color, ai }) {
  const segs = [];
  for (let i = 0; i < length; i++) segs.push({ x: x - Math.cos(heading) * SEG_GAP * i, y: y - Math.sin(heading) * SEG_GAP * i });
  return {
    segs, heading, want: heading, color, ai, alive: true, grow: 0,
    speed: ai ? rand(110, 132) : PLAYER_SPEED, turn: ai ? 3.4 : 5.5,
    think: 0, goal: heading, alert: rand(0.6, 1), r: 12,
  };
}

/** Pre-drawn glowing snack, one per color (cheaper than drawing glows every frame). */
function snackSprite(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grad.addColorStop(0, '#fff');
  grad.addColorStop(0.28, color);
  grad.addColorStop(0.55, color + '66');
  grad.addColorStop(1, color + '00');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

export function WiggleWorm() {
  const game = { pause: () => {} };
  return {
    music: 'worm',
    pause: () => game.pause(),
    render(scope) {
      const screen = h('div', { class: 'bg-stage game worm' });
      const canvas = h('canvas', { class: 'game-canvas' });
      const area = h('div', { class: 'game-area', 'aria-label': 'Touch where you want the worm to go' }, canvas);
      const hud = gameHud(GAME, { onClose: () => routes.menu(), screenEl: screen });
      const hint = h('div', { class: 'hint hint-mid' }, '👆 Touch where you want to wiggle!');
      screen.append(area, hud.el, hint);

      const sprites = Object.fromEntries([...new Set([...RAINBOW, ...AI_COLORS])].map((c) => [c, snackSprite(c)]));
      let state = 'ready'; // 'ready' | 'play' | 'over'
      let paused = false;
      let score = 0, note = 0, t = 0;
      let food = [], sparks = [];
      let pointer = null; // { x, y } in screen px while a finger is down
      const player = makeWorm({ x: ARENA / 2, y: ARENA / 2, heading: -Math.PI / 2, length: 14, color: COLORS.pink, ai: false });
      const worms = [player];
      const cam = { x: player.segs[0].x, y: player.segs[0].y };

      let W = 0, H = 0, z = 1, areaRect = null;
      const view = stageCanvas(canvas, scope, (w, hh) => {
        W = w; H = hh;
        z = clamp(w / 360, 0.9, 1.25);
        areaRect = area.getBoundingClientRect();
      });

      const addSnack = (x, y, color, big = false) => food.push({ x, y, color, big, r: big ? 9 : 7, ph: rand(0, TAU) });
      const randomSnack = () => addSnack(rand(40, ARENA - 40), rand(40, ARENA - 40), pick(RAINBOW));
      for (let i = 0; i < FOOD_COUNT; i++) randomSnack();

      function spawnAI() {
        const ph = player.segs[0];
        let x, y, tries = 0;
        do {
          x = rand(150, ARENA - 150);
          y = rand(150, ARENA - 150);
        } while (Math.hypot(x - ph.x, y - ph.y) < 520 && ++tries < 50);
        const used = new Set(worms.filter((w) => w.ai && w.alive).map((w) => w.color));
        const color = AI_COLORS.find((c) => !used.has(c)) || pick(AI_COLORS);
        worms.push(makeWorm({ x, y, heading: rand(0, TAU), length: Math.floor(rand(12, 36)), color, ai: true }));
      }
      for (let i = 0; i < 4; i++) spawnAI();
      const aiWanted = () => Math.min(7, 4 + Math.floor(score / 15));
      let respawnIn = 0;

      // ---- steering ----
      const steer = (e) => {
        if (!areaRect) areaRect = area.getBoundingClientRect();
        pointer = { x: e.clientX - areaRect.left, y: e.clientY - areaRect.top };
        const dx = pointer.x - W / 2, dy = pointer.y - H / 2;
        if (dx * dx + dy * dy > 64) player.want = Math.atan2(dy, dx);
      };
      scope.on(area, 'pointerdown', (e) => {
        e.preventDefault();
        if (paused) return;
        try { area.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
        steer(e);
        if (state === 'ready') { state = 'play'; hint.classList.add('gone'); }
      });
      scope.on(area, 'pointermove', (e) => { if (pointer) steer(e); });
      const lift = () => { pointer = null; };
      scope.on(area, 'pointerup', lift);
      scope.on(area, 'pointercancel', lift);

      // ---- computer worms ----
      function danger(ai, ang, dist) {
        const head = ai.segs[0];
        let score = 0;
        for (const k of [0.5, 1]) {
          const p = { x: head.x + Math.cos(ang) * dist * k, y: head.y + Math.sin(ang) * dist * k };
          if (p.x < 50 || p.y < 50 || p.x > ARENA - 50 || p.y > ARENA - 50) score += 1;
          for (const w of worms) {
            if (w === ai || !w.alive) continue;
            const lim = (w.r + ai.r + 10) ** 2;
            for (let i = 0; i < w.segs.length; i += 2) if (d2(w.segs[i], p) < lim) { score += 1; break; }
          }
        }
        return score;
      }

      function thinkAI(ai, dt) {
        const head = ai.segs[0];
        ai.think -= dt;
        if (ai.think <= 0) {
          ai.think = rand(0.25, 0.5);
          let best = null, bd = 300 * 300;
          for (const f of food) { const d = d2(f, head); if (d < bd) { bd = d; best = f; } }
          ai.goal = best ? Math.atan2(best.y - head.y, best.x - head.x) : ai.heading + rand(-0.9, 0.9);
        }
        ai.want = ai.goal;
        const look = 80 * ai.alert;
        if (danger(ai, ai.heading, look)) {
          const l = danger(ai, ai.heading - 0.9, look), r = danger(ai, ai.heading + 0.9, look);
          ai.want = ai.heading + (l <= r ? -1.5 : 1.5);
        }
      }

      function moveWorm(w, dt) {
        const head = w.segs[0];
        const turn = w.turn * dt;
        w.heading += clamp(angDiff(w.want, w.heading), -turn, turn);
        head.x += Math.cos(w.heading) * w.speed * dt;
        head.y += Math.sin(w.heading) * w.speed * dt;
        // Bounce gently off the edge of the dance floor.
        const m = w.r + 2;
        let bounced = false;
        if (head.x < m || head.x > ARENA - m) { head.x = clamp(head.x, m, ARENA - m); w.heading = Math.PI - w.heading; bounced = true; }
        if (head.y < m || head.y > ARENA - m) { head.y = clamp(head.y, m, ARENA - m); w.heading = -w.heading; bounced = true; }
        if (bounced) { w.want = w.heading; w.goal = w.heading; }
        for (let i = 1; i < w.segs.length; i++) {
          const p = w.segs[i - 1], s = w.segs[i];
          const dx = s.x - p.x, dy = s.y - p.y;
          const d = Math.hypot(dx, dy);
          if (d > SEG_GAP) { const k = SEG_GAP / d; s.x = p.x + dx * k; s.y = p.y + dy * k; }
        }
        if (w.grow > 0) {
          const tail = w.segs[w.segs.length - 1];
          w.segs.push({ x: tail.x, y: tail.y });
          w.grow--;
        }
        w.r = 12 + Math.min(8, w.segs.length * 0.05);
      }

      function popWorm(w, byPlayer) {
        w.alive = false;
        for (let i = 0; i < w.segs.length; i += 3) addSnack(w.segs[i].x + rand(-6, 6), w.segs[i].y + rand(-6, 6), w.color, true);
        burst(w.segs[0], w.color, 10);
        if (onScreen(w.segs[0], 60)) { audio.pop(); if (byPlayer) audio.sparkle(); }
        respawnIn = Math.max(respawnIn, 2.5);
      }

      function crash() {
        state = 'over';
        audio.clink();
        audio.boop();
        for (let i = 0; i < player.segs.length; i += 2) burst(player.segs[i], RAINBOW[Math.floor(i / 3) % RAINBOW.length], 2);
        player.alive = false;
        scope.timeout(() => showResults(screen, scope, { game: GAME, score, onAgain: () => routes.worm(), onHome: () => routes.menu() }), 1200);
      }

      function burst(p, color, n) {
        for (let i = 0; i < n; i++) {
          const a = rand(0, TAU), v = rand(60, 220);
          sparks.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color });
        }
      }

      const onScreen = (p, pad = 0) => Math.abs((p.x - cam.x) * z) < W / 2 + pad && Math.abs((p.y - cam.y) * z) < H / 2 + pad;

      function update(dt) {
        t += dt;
        if (state === 'play') moveWorm(player, dt);
        for (const w of worms) {
          if (!w.ai || !w.alive) continue;
          thinkAI(w, dt);
          moveWorm(w, dt);
        }

        // Snacks
        for (const w of worms) {
          if (!w.alive || (w === player && state !== 'play')) continue;
          const head = w.segs[0];
          for (let i = food.length - 1; i >= 0; i--) {
            const f = food[i];
            if (d2(f, head) > (w.r + f.r + 4) ** 2) continue;
            food.splice(i, 1);
            if (!f.big) randomSnack();
            w.grow += 1;
            if (w === player) {
              score++;
              hud.setScore(score);
              audio.playNote(SNACK_NOTES[note++ % SNACK_NOTES.length], { inst: 'bell', volume: 0.55 });
              burst(f, f.color, 4);
            }
          }
        }

        // Bumps
        if (state === 'play') {
          const ph = player.segs[0];
          for (const w of worms) {
            if (!w.ai || !w.alive) continue;
            const lim = (player.r + w.r * 0.8) ** 2;
            if (d2(ph, w.segs[0]) > (w.segs.length * SEG_GAP + 60) ** 2) continue; // too far to touch
            if (w.segs.some((s) => d2(ph, s) < lim)) { crash(); break; }
          }
        }
        for (const w of worms) {
          if (!w.ai || !w.alive) continue;
          const ah = w.segs[0];
          for (const o of worms) {
            if (o === w || !o.alive) continue;
            const lim = (w.r * 0.8 + o.r) ** 2;
            let hit = false;
            for (let i = 1; i < o.segs.length; i++) if (d2(ah, o.segs[i]) < lim) { hit = true; break; }
            if (hit) { popWorm(w, o === player); break; }
          }
        }
        for (let i = worms.length - 1; i >= 0; i--) if (!worms[i].alive && worms[i].ai) worms.splice(i, 1);
        respawnIn -= dt;
        if (respawnIn <= 0 && worms.filter((w) => w.ai).length < aiWanted()) { spawnAI(); respawnIn = 1.5; }

        for (const s of sparks) {
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.vx *= 0.96;
          s.vy *= 0.96;
          s.life -= dt * 1.6;
        }
        sparks = sparks.filter((s) => s.life > 0);

        if (player.alive) {
          // The camera follows her head, smoothly.
          const ph = player.segs[0];
          const k = Math.min(1, dt * 10);
          cam.x += (ph.x - cam.x) * k;
          cam.y += (ph.y - cam.y) * k;
        }
      }

      // ---- drawing ----
      const sx = (x) => (x - cam.x) * z + W / 2;
      const sy = (y) => (y - cam.y) * z + H / 2;

      function drawFloor(ctx) {
        ctx.fillStyle = '#190C33';
        ctx.fillRect(0, 0, W, H);
        const x0 = Math.max(0, sx(0)), y0 = Math.max(0, sy(0)), x1 = Math.min(W, sx(ARENA)), y1 = Math.min(H, sy(ARENA));
        if (x1 <= x0 || y1 <= y0) return;
        ctx.fillStyle = '#3A1D6E';
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        // Disco dance-floor tiles that light up to the beat.
        const T = 120;
        const beat = Math.floor(t * (104 / 60));
        const i0 = Math.max(0, Math.floor((cam.x - W / 2 / z) / T)), i1 = Math.min(ARENA / T - 1, Math.floor((cam.x + W / 2 / z) / T));
        const j0 = Math.max(0, Math.floor((cam.y - H / 2 / z) / T)), j1 = Math.min(ARENA / T - 1, Math.floor((cam.y + H / 2 / z) / T));
        for (let i = i0; i <= i1; i++) {
          for (let j = j0; j <= j1; j++) {
            const lit = (i * 7 + j * 13 + beat) % 9 === 0;
            const tone = (i + j) % 2;
            ctx.fillStyle = lit ? `${RAINBOW[(i + j + beat) % RAINBOW.length]}55` : tone ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.1)';
            ctx.fillRect(sx(i * T) + 2, sy(j * T) + 2, T * z - 4, T * z - 4);
          }
        }
        // The edge: a glowing pink rope of lights.
        ctx.lineWidth = 8 * z;
        ctx.strokeStyle = COLORS.pink;
        ctx.strokeRect(sx(0) - 4 * z, sy(0) - 4 * z, ARENA * z + 8 * z, ARENA * z + 8 * z);
        ctx.lineWidth = 3 * z;
        ctx.strokeStyle = '#FFD1E6';
        ctx.strokeRect(sx(0) - 4 * z, sy(0) - 4 * z, ARENA * z + 8 * z, ARENA * z + 8 * z);
      }

      function drawWorm(ctx, w) {
        const n = w.segs.length;
        const r = w.r * z;
        // Outline pass, then color pass (tail first, so the head is on top).
        ctx.fillStyle = 'rgba(30, 10, 60, .55)';
        for (let i = n - 1; i >= 0; i--) {
          const s = w.segs[i];
          if (!onScreen(s, 40)) continue;
          ctx.beginPath();
          ctx.arc(sx(s.x), sy(s.y), r + 2.5, 0, TAU);
          ctx.fill();
        }
        for (let i = n - 1; i >= 0; i--) {
          const s = w.segs[i];
          if (!onScreen(s, 40)) continue;
          const band = Math.floor(i / 3);
          ctx.fillStyle = w.ai ? (band % 2 ? w.color : `${w.color}CC`) : RAINBOW[band % RAINBOW.length];
          ctx.beginPath();
          ctx.arc(sx(s.x), sy(s.y), r, 0, TAU);
          ctx.fill();
        }
        // Face
        const hd = w.segs[0];
        if (!onScreen(hd, 60)) return;
        const hx = sx(hd.x), hy = sy(hd.y), a = w.heading;
        if (!w.ai) {
          // Headphones: a band over the head and two purple ear cups.
          ctx.strokeStyle = COLORS.ink;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(hx, hy, r + 3, a - Math.PI / 2 - 0.2, a + Math.PI / 2 + 0.2, true);
          ctx.stroke();
          for (const side of [-1, 1]) {
            ctx.fillStyle = COLORS.purple;
            ctx.beginPath();
            ctx.arc(hx + Math.cos(a + side * Math.PI / 2) * (r + 1), hy + Math.sin(a + side * Math.PI / 2) * (r + 1), r * 0.42, 0, TAU);
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
        for (const side of [-1, 1]) {
          const ex = hx + Math.cos(a + side * 0.6) * r * 0.55, ey = hy + Math.sin(a + side * 0.6) * r * 0.55;
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(ex, ey, r * 0.38, 0, TAU);
          ctx.fill();
          ctx.fillStyle = COLORS.ink;
          ctx.beginPath();
          ctx.arc(ex + Math.cos(a) * r * 0.14, ey + Math.sin(a) * r * 0.14, r * 0.2, 0, TAU);
          ctx.fill();
        }
        if (!w.ai) {
          // Rosy cheeks + smile on her worm.
          ctx.strokeStyle = COLORS.ink;
          ctx.lineWidth = 2;
          ctx.beginPath();
          const mx = hx + Math.cos(a) * r * 0.55, my = hy + Math.sin(a) * r * 0.55;
          ctx.arc(mx, my, r * 0.3, a - 0.9, a + 0.9);
          ctx.stroke();
        }
      }

      function draw() {
        const ctx = view.ctx;
        drawFloor(ctx);
        // Snacks
        for (const f of food) {
          if (!onScreen(f, 30)) continue;
          const s = (f.r * 5 + Math.sin(t * 4 + f.ph) * 3) * z;
          ctx.drawImage(sprites[f.color] || sprites[COLORS.pink], sx(f.x) - s / 2, sy(f.y) - s / 2, s, s);
        }
        for (const w of worms) if (w.ai && w.alive) drawWorm(ctx, w);
        if (player.alive) drawWorm(ctx, player);
        for (const s of sparks) {
          ctx.globalAlpha = Math.max(0, s.life);
          ctx.fillStyle = s.color;
          ctx.beginPath();
          ctx.arc(sx(s.x), sy(s.y), (2 + 4 * s.life) * z, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        if (pointer && state === 'play') {
          ctx.strokeStyle = 'rgba(255, 255, 255, .5)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(pointer.x, pointer.y, 26, 0, TAU);
          ctx.stroke();
        }
      }

      game.pause = () => {
        if (paused || state !== 'play') return;
        paused = true;
        pointer = null;
        pauseCard(screen, () => { paused = false; });
      };

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
