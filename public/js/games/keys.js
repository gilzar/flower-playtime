// Piano Pop: colorful tiles slide down four lanes; tapping each one plays the next note of the song
// (with chords and a drum beat that keeps time with the tiles). Let a tile slip away, or tap an
// empty spot, and the run is over. The song repeats a little faster each time around.
import { h, stageLights, stageCanvas, tile, iconButton, seeded, clamp, COLORS } from '../ui.js';
import * as audio from '../audio.js';
import * as scores from '../scores.js';
import { routes } from '../nav.js';
import { gameHud, showResults, pauseCard, banner } from '../results.js';
import { SONGS, parseSong } from './songs.js';

const GAME = 'keys';
const LANES = 4;
const ROWS_VISIBLE = 4.2;
const START_SPEED = 1.5; // rows per second
const SPEED_PER_TILE = 0.02;
const SPEED_PER_LOOP = 0.25;
const MAX_SPEED = 4.5;
const TILE_COLORS = [COLORS.pink, COLORS.purple, COLORS.blue, COLORS.teal, COLORS.orange];
const TAU = Math.PI * 2;
const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif';

/** The song list. */
export function SongPicker() {
  return {
    music: 'menu',
    render() {
      const best = scores.best(GAME);
      return h('div', { class: 'bg-stage songs' },
        stageLights(),
        h('div', { class: 'screen-header' },
          iconButton('back', () => routes.menu(), { label: 'Back to the games' }),
          h('div', { class: 'header-title' }, '🎹 Piano Pop'),
          h('div', { class: 'best-pill' }, h('small', {}, 'Best'), h('b', {}, String(best)))),
        h('div', { class: 'songs-sub' }, 'Pick a song!'),
        h('div', { class: 'song-list scroll' }, SONGS.map((s) => tile({
          title: s.title, icon: s.emoji, color: s.color, subtitle: s.credit, cls: 'small', id: `song-${s.id}`,
          onClick: () => {
            const first = parseSong(s).notes.slice(0, 3).map((n) => n.midi);
            audio.playSequence(first, 0.14, { inst: 'piano', volume: 0.7 });
            routes.keys(s.id);
          },
        }))));
    },
  };
}

function roundRect(ctx, x, y, w, hgt, r) {
  r = Math.min(r, w / 2, hgt / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + hgt, r);
  ctx.arcTo(x + w, y + hgt, x, y + hgt, r);
  ctx.arcTo(x, y + hgt, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const hash = (s) => [...s].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619), 2166136261);

export function PianoPop(songId) {
  const song = SONGS.find((s) => s.id === songId) || SONGS[0];
  const game = { pause: () => {} };
  return {
    music: null, // the tiles and the beat are the music
    pause: () => game.pause(),
    render(scope) {
      const screen = h('div', { class: 'bg-stage game keys' });
      const canvas = h('canvas', { class: 'game-canvas' });
      const area = h('div', { class: 'game-area', 'aria-label': 'Piano tiles' }, canvas);
      const hud = gameHud(GAME, { onClose: () => routes.songs(), screenEl: screen });
      const songTag = h('div', { class: 'song-tag' }, `${song.emoji} ${song.title}`);
      const hint = h('div', { class: 'hint hint-mid' }, '👆 Tap every tile. Don\'t let one get away!');
      screen.append(stageLights(), area, hud.el, songTag, hint);

      const parsed = parseSong(song);
      const rnd = seeded(hash(song.id));
      let tiles = [], made = 0, genLoop = 0, genIdx = 0, lastLane = -1;
      let state = 'ready'; // 'ready' | 'play' | 'miss' | 'over'
      let paused = false;
      let scroll = 0, speed = START_SPEED, hits = 0, nextBeat = 0, loopShown = 0;
      let rings = [], missFx = null, back = null;
      const laneFlash = [0, 0, 0, 0];

      let W = 0, H = 0, laneW = 0, rh = 0, baseY = 0, areaRect = null;
      const view = stageCanvas(canvas, scope, (w, hh) => {
        W = w; H = hh;
        laneW = w / LANES;
        rh = hh / ROWS_VISIBLE;
        baseY = hh - rh * 0.3;
        areaRect = area.getBoundingClientRect();
        generate();
      });

      const bottomOf = (t) => baseY + (scroll - t.row) * rh;
      const topOf = (t) => bottomOf(t) - t.len * rh;

      function generate() {
        if (!rh) return;
        while (!tiles.length || tiles[tiles.length - 1].row < scroll + ROWS_VISIBLE + 3) {
          const n = parsed.notes[genIdx];
          let lane;
          do { lane = Math.floor(rnd() * LANES); } while (lane === lastLane);
          lastLane = lane;
          tiles.push({
            row: genLoop * parsed.length + n.at, len: Math.min(2, n.len), midi: n.midi, chord: n.chord, lane,
            loop: genLoop, first: made === 0, color: TILE_COLORS[made % TILE_COLORS.length], hit: false, hitT: 0,
          });
          made++;
          if (++genIdx >= parsed.notes.length) { genIdx = 0; genLoop++; }
        }
        tiles = tiles.filter((t) => topOf(t) <= H + 10 || !t.hit);
      }

      function hitTile(t) {
        t.hit = true;
        hits++;
        hud.setScore(hits);
        audio.playNote(t.midi, { inst: 'piano', volume: 0.95 });
        if (t.chord) audio.playChord(t.chord, { volume: 0.8 });
        laneFlash[t.lane] = 1;
        rings.push({ x: (t.lane + 0.5) * laneW, y: bottomOf(t) - (t.len * rh) / 2, t: 0, color: t.color });
        if (t.loop > loopShown) {
          loopShown = t.loop;
          banner(screen, 'Faster! 🚀');
        }
        speed = Math.min(MAX_SPEED, START_SPEED + hits * SPEED_PER_TILE + t.loop * SPEED_PER_LOOP);
      }

      function miss(info) {
        state = 'miss';
        audio.boop();
        missFx = { ...info, t: 0 };
        if (info.tile) {
          // Slide back so she can see the tile that got away.
          back = { from: scroll, to: info.tile.row + (H - 0.12 * rh - baseY) / rh, t: 0 };
        }
        scope.timeout(() => {
          state = 'over';
          showResults(screen, scope, {
            game: GAME, score: hits,
            onAgain: () => routes.keys(song.id), onHome: () => routes.songs(), homeLabel: 'Songs', homeIcon: '🎵',
          });
        }, 1300);
      }

      function tileAt(lane, y) {
        const slop = rh * 0.18;
        let found = null, onDone = false;
        for (const t of tiles) {
          if (t.lane !== lane) continue;
          const b = bottomOf(t), tp = b - t.len * rh;
          if (y < tp - slop || y > b + slop) continue;
          if (t.hit) { onDone = true; continue; }
          if (!found || b > bottomOf(found)) found = t;
        }
        return { found, onDone };
      }

      scope.on(area, 'pointerdown', (e) => {
        e.preventDefault();
        if (paused || (state !== 'ready' && state !== 'play')) return;
        if (!areaRect) areaRect = area.getBoundingClientRect();
        const x = e.clientX - areaRect.left, y = e.clientY - areaRect.top;
        const lane = clamp(Math.floor(x / laneW), 0, LANES - 1);
        let { found, onDone } = tileAt(lane, y);
        // A finger right on the line between two lanes counts for the neighbor too.
        if (!found) {
          const edge = x - lane * laneW;
          const near = edge < 18 ? lane - 1 : edge > laneW - 18 ? lane + 1 : -1;
          if (near >= 0 && near < LANES) {
            const other = tileAt(near, y);
            found = other.found;
            onDone = onDone || other.onDone;
          }
        }
        if (state === 'ready') {
          if (found && found.first) {
            state = 'play';
            hint.classList.add('gone');
            hitTile(found);
          }
          return;
        }
        if (found) hitTile(found);
        else if (!onDone) miss({ lane, y });
      });

      function update(dt) {
        for (const r of rings) r.t += dt;
        rings = rings.filter((r) => r.t < 0.5);
        for (let i = 0; i < LANES; i++) laneFlash[i] = Math.max(0, laneFlash[i] - dt * 5);
        for (const t of tiles) if (t.hit) t.hitT += dt;

        if (state === 'play') {
          scroll += speed * dt;
          // Drums, scheduled slightly ahead so they land exactly when the tiles cross the beat line.
          const rpb = parsed.rowsPerBeat;
          while (nextBeat * rpb <= scroll + speed * 0.1) {
            const delay = Math.max(0, (nextBeat * rpb - scroll) / speed);
            audio.drum('kick', delay, 0.42);
            if (nextBeat % 2 === 1) audio.drum('clap', delay, 0.22);
            audio.drum('hat', delay + rpb / speed / 2, 0.09);
            nextBeat++;
          }
          for (const t of tiles) {
            if (!t.hit && topOf(t) > H) { miss({ tile: t }); break; }
          }
          if (state === 'play') generate();
        }
        if (missFx) missFx.t += dt;
        if (back) {
          back.t = Math.min(1, back.t + dt / 0.35);
          const e = 1 - Math.pow(1 - back.t, 3);
          scroll = back.from + (back.to - back.from) * e;
        }
      }

      function drawTile(ctx, t) {
        const b = bottomOf(t), hgt = t.len * rh;
        const tp = b - hgt;
        if (b < -10 || tp > H + 10) return;
        const x = t.lane * laneW + 4, w = laneW - 8, y = tp + 3, th = hgt - 6;
        const missed = missFx && missFx.tile === t;
        if (t.hit && !missed) {
          const a = Math.max(0, 1 - t.hitT * 3);
          if (a <= 0) return;
          ctx.globalAlpha = a * 0.7;
          const grow = t.hitT * 14;
          roundRect(ctx, x - grow, y - grow, w + grow * 2, th + grow * 2, 16);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.globalAlpha = 1;
          return;
        }
        let color = t.color;
        if (missed) color = Math.floor(missFx.t / 0.13) % 2 ? '#FF3B30' : '#fff';
        const grad = ctx.createLinearGradient(0, y, 0, y + th);
        grad.addColorStop(0, missed ? color : shade(color, 0.25));
        grad.addColorStop(1, color);
        roundRect(ctx, x, y, w, th, 16);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255, 255, 255, .55)';
        ctx.stroke();
        // Shine
        roundRect(ctx, x + 8, y + 7, w - 16, Math.min(18, th * 0.18), 9);
        ctx.fillStyle = 'rgba(255, 255, 255, .28)';
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, .92)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (t.first && state === 'ready') {
          const pulse = 1 + 0.06 * Math.sin(performance.now() / 180);
          ctx.save();
          ctx.translate(x + w / 2, y + th / 2);
          ctx.scale(pulse, pulse);
          ctx.font = `900 ${Math.min(26, w * 0.26)}px ${FONT}`;
          ctx.fillText('START', 0, 0);
          ctx.restore();
        } else {
          ctx.font = `900 ${Math.min(44, w * 0.42)}px ${FONT}`;
          ctx.fillText(t.len > 1 ? '♫' : '♪', x + w / 2, y + th / 2 + 2);
        }
      }

      function draw() {
        const ctx = view.ctx;
        ctx.clearRect(0, 0, W, H);
        // Lanes
        for (let i = 0; i < LANES; i++) {
          ctx.fillStyle = `rgba(255, 255, 255, ${0.04 + 0.16 * laneFlash[i] + (i % 2 ? 0.03 : 0)})`;
          ctx.fillRect(i * laneW, 0, laneW, H);
        }
        ctx.fillStyle = 'rgba(255, 255, 255, .22)';
        for (let i = 1; i < LANES; i++) ctx.fillRect(i * laneW - 0.75, 0, 1.5, H);

        for (const t of tiles) drawTile(ctx, t);

        // Wrong spot: a flashing red square where she tapped.
        if (missFx && !missFx.tile) {
          ctx.globalAlpha = Math.floor(missFx.t / 0.13) % 2 ? 0.85 : 0.35;
          roundRect(ctx, missFx.lane * laneW + 4, missFx.y - rh / 2, laneW - 8, rh, 16);
          ctx.fillStyle = '#FF3B30';
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        for (const r of rings) {
          const k = r.t / 0.5;
          ctx.globalAlpha = 1 - k;
          ctx.lineWidth = 6 * (1 - k) + 1;
          ctx.strokeStyle = r.color;
          ctx.beginPath();
          ctx.arc(r.x, r.y, 20 + k * laneW * 0.7, 0, TAU);
          ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.font = `900 ${30}px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.fillText('♪', r.x + Math.sin(r.t * 12) * 8, r.y - k * 90);
        }
        ctx.globalAlpha = 1;
      }

      game.pause = () => {
        if (paused || state !== 'play') return;
        paused = true;
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

/** Lightens (+) or darkens (-) a #rrggbb color. */
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

