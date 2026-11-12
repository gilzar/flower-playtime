// Piano Pop songs: public-domain tunes plus one original pop tune. No copyrighted songs.
//
// notes: note names (C5 = middle C's octave up = MIDI 72), ":n" = length in rows (default 1), "|" = bar line.
// chords: one or two chords per bar (two = the second starts halfway through the bar).
// rowsPerBeat: 2 when the tune is written in eighth notes, so the drum beat lands every two rows.
import { COLORS } from '../ui.js';

export const SONGS = [
  {
    id: 'twinkle', title: 'Twinkle Twinkle', credit: 'Traditional', emoji: '⭐', color: COLORS.blue,
    notes: 'C5 C5 G5 G5 | A5 A5 G5:2 | F5 F5 E5 E5 | D5 D5 C5:2 | G5 G5 F5 F5 | E5 E5 D5:2 | G5 G5 F5 F5 | E5 E5 D5:2 |'
      + ' C5 C5 G5 G5 | A5 A5 G5:2 | F5 F5 E5 E5 | D5 D5 C5:2',
    chords: 'C | F C | F C | G C | C F | C G | C F | C G | C | F C | F C | G C',
  },
  {
    id: 'ode', title: 'Ode to Joy', credit: 'Beethoven', emoji: '🎻', color: COLORS.teal,
    notes: 'E5 E5 F5 G5 | G5 F5 E5 D5 | C5 C5 D5 E5 | E5 D5 D5:2 | E5 E5 F5 G5 | G5 F5 E5 D5 | C5 C5 D5 E5 | D5 C5 C5:2',
    chords: 'C | G | C | G | C | G | C | G C',
  },
  {
    id: 'bells', title: 'Jingle Bells', credit: 'J. Pierpont', emoji: '🔔', color: COLORS.red,
    notes: 'E5 E5 E5:2 | E5 E5 E5:2 | E5 G5 C5 D5 | E5:4 | F5 F5 F5 F5 | F5 E5 E5 E5 | E5 D5 D5 E5 | D5:2 G5:2 |'
      + ' E5 E5 E5:2 | E5 E5 E5:2 | E5 G5 C5 D5 | E5:4 | F5 F5 F5 F5 | F5 E5 E5 E5 | G5 G5 F5 D5 | C5:4',
    chords: 'C | C | C | C | F | C | D | G | C | C | C | C | F | C | G | C',
  },
  {
    id: 'cancan', title: 'Can-Can', credit: 'Offenbach', emoji: '💃', color: COLORS.orange, rowsPerBeat: 2,
    notes: 'C5:4 D5 F5 E5 D5 | G5:2 G5:2 G5 A5 E5 F5 | D5:2 D5:2 D5 F5 E5 D5 | C5 C6 B5 A5 G5 F5 E5 D5 |'
      + ' C5:4 D5 F5 E5 D5 | G5:2 G5:2 G5 A5 E5 F5 | D5:2 D5:2 D5 F5 E5 D5 | C5 G5 E5 D5 C5:4',
    chords: 'C | C | G | C G | C | C | G | G C',
  },
  {
    id: 'spotlight', title: 'Spotlight', credit: 'Original pop song', emoji: '🎤', color: COLORS.pink,
    notes: 'C5 E5 G5 E5 | D5 G5 G5:2 | C5 E5 A5 G5 | F5 E5 C5:2 | C5 E5 G5 C6 | B5 G5 D5:2 | A5 G5 E5 C5 | D5 E5 C5:2',
    chords: 'C | G | Am | F | C | G | Am | G C',
  },
];

const PITCH = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function midiOf(name) {
  const m = /^([A-G])(#|b)?(\d)$/.exec(name);
  if (!m) throw new Error(`Bad note ${name}`);
  return 12 * (Number(m[3]) + 1) + PITCH[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

/** Turns a song into tiles-to-be: [{ midi, at, len, chord? }] (in rows) plus its total length in rows. */
export function parseSong(song) {
  const rpb = song.rowsPerBeat || 1;
  const notes = [];
  let at = 0;
  for (const tok of song.notes.split(/\s+/)) {
    if (!tok || tok === '|') continue;
    const [name, len = '1'] = tok.split(':');
    notes.push({ midi: midiOf(name), at, len: Number(len) });
    at += Number(len);
  }
  // Chord changes, in rows, then attach each one to the first note at or after it.
  const changes = [];
  song.chords.split('|').forEach((bar, i) => {
    const names = bar.trim().split(/\s+/).filter(Boolean);
    names.forEach((c, k) => changes.push({ at: i * 4 * rpb + (k * 4 * rpb) / names.length, chord: c }));
  });
  let ci = 0;
  for (const n of notes) {
    while (ci < changes.length && changes[ci].at <= n.at) { n.chord = changes[ci].chord; ci++; }
  }
  return { notes, length: at, rowsPerBeat: rpb };
}
